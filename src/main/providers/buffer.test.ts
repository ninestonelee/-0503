import { describe, expect, it } from 'vitest';
import { BufferApiClient, insightsFromBufferMetrics, threadsShortcode } from './buffer';
import { ProviderRequestError, UncertainRemoteOperationError } from './contracts';

type Call = { body: any; headers: Record<string, string> };

const json = (data: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(data), { status:200, headers:{ 'content-type':'application/json' }, ...init });

function client(responses: Array<Response | Error>, key: string | null = 'buf_test_key') {
  const calls: Call[] = [];
  const pauses: number[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    calls.push({ body:JSON.parse(String(init.body)), headers:init.headers as Record<string, string> });
    const next = responses.shift();
    if (!next) throw new Error('예상하지 못한 추가 요청');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const api = new BufferApiClient({ get:async () => key ?? undefined }, fetchImpl, async (ms) => { pauses.push(ms); });
  return { api, calls, pauses };
}

const created = (post: Record<string, unknown>) => json({ data:{ createPost:{ __typename:'PostActionSuccess', post:{ id:'post-1', status:'sending', ...post } } } });
const polled = (post: Record<string, unknown>) => json({ data:{ post:{ id:'post-1', ...post } } });

describe('BufferApiClient.publishNow', () => {
  it('shareNow로 게시물을 만들고 이미지를 자산으로 보낸 뒤 sent 상태까지 확인한다', async () => {
    const { api, calls, pauses } = client([
      created({}),
      polled({ status:'sent', externalLink:'https://www.threads.com/@me/post/ABC123' }),
    ]);
    const result = await api.publishNow('channel-1', { text:'본문', imageUrls:['https://img.example.com/a.jpg', 'https://img.example.com/b.jpg'], linkUrl:'https://example.com' });
    expect(result.settled).toBe(true);
    expect(result.post.externalLink).toBe('https://www.threads.com/@me/post/ABC123');
    expect(calls[0].headers.Authorization).toBe('Bearer buf_test_key');
    const input = calls[0].body.variables.input;
    expect(input).toMatchObject({ text:'본문', channelId:'channel-1', schedulingType:'automatic', mode:'shareNow' });
    expect(input.assets).toEqual([{ image:{ url:'https://img.example.com/a.jpg' } }, { image:{ url:'https://img.example.com/b.jpg' } }]);
    // 이미지가 있으면 Buffer가 링크 첨부를 거부하므로 metadata를 보내지 않는다.
    expect(input.metadata).toBeUndefined();
    expect(calls[1].body.variables).toEqual({ input:{ id:'post-1' } });
    expect(pauses).toHaveLength(1);
  });

  it('이미지가 없으면 링크를 Threads 링크 첨부로 보낸다', async () => {
    const { api, calls } = client([created({ status:'sent' })]);
    await api.publishNow('channel-1', { text:'본문', linkUrl:'https://example.com/post' });
    expect(calls[0].body.variables.input.metadata).toEqual({ threads:{ linkAttachment:{ url:'https://example.com/post' } } });
    expect(calls[0].body.variables.input.assets).toEqual([]);
  });

  it('Buffer가 게시물 생성을 거부하면 재시도하지 않는 오류로 알린다', async () => {
    const { api } = client([json({ data:{ createPost:{ __typename:'InvalidInputError', message:'Text is required' } } })]);
    const error = await api.publishNow('channel-1', { text:'' }).catch((value) => value);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('Text is required');
  });

  it('게시물 생성 요청 중 네트워크가 끊기면 중복 발행을 막기 위해 불확실 오류로 처리한다', async () => {
    const { api } = client([new TypeError('fetch failed')]);
    await expect(api.publishNow('channel-1', { text:'본문' })).rejects.toBeInstanceOf(UncertainRemoteOperationError);
  });

  it('요청 한도 초과는 서버가 거부한 것이므로 재시도 가능한 오류다', async () => {
    const { api } = client([json({ data:null, errors:[{ message:'Too many', extensions:{ code:'RATE_LIMIT_EXCEEDED' } }] }, { headers:{ 'retry-after':'30' } })]);
    const error = await api.publishNow('channel-1', { text:'본문' }).catch((value) => value);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(30_000);
  });

  it('API 키가 잘못되면 재시도하지 않고 키 재발급을 안내한다', async () => {
    const { api } = client([json({ data:null, errors:[{ message:'Not authorized', extensions:{ code:'UNAUTHORIZED' } }] })]);
    const error = await api.publishNow('channel-1', { text:'본문' }).catch((value) => value);
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('Buffer API 키');
  });

  it('Buffer 발행이 error 상태가 되면 원인을 담아 실패시킨다', async () => {
    const { api } = client([created({}), polled({ status:'error', error:{ message:'Threads token expired' } })]);
    await expect(api.publishNow('channel-1', { text:'본문' })).rejects.toThrow('Threads token expired');
  });

  it('상태 확인 제한 시간 안에 확정되지 않으면 settled=false로 돌려준다', async () => {
    const responses: Response[] = [created({})];
    for (let index = 0; index < 20; index += 1) responses.push(polled({ status:'sending' }));
    const { api, pauses } = client(responses);
    const result = await api.publishNow('channel-1', { text:'본문' });
    expect(result).toMatchObject({ settled:false, post:{ id:'post-1', status:'sending' } });
    expect(pauses).toHaveLength(20);
  });

  it('API 키가 없으면 요청하지 않는다', async () => {
    const { api, calls } = client([], null);
    await expect(api.publishNow('channel-1', { text:'본문' })).rejects.toThrow('Buffer API 키가 저장되지 않았습니다');
    expect(calls).toHaveLength(0);
  });

  it('오류 메시지에 API 키가 섞여 있으면 가린다', async () => {
    const { api } = client([json({ data:null, errors:[{ message:'bad key buf_test_key', extensions:{ code:'UNEXPECTED' } }] })]);
    const error = await api.getPost('post-1').catch((value) => value);
    expect(error.message).not.toContain('buf_test_key');
    expect(error.retryable).toBe(true);
  });
});

describe('BufferApiClient.threadsChannels', () => {
  it('모든 조직의 채널 중 Threads 채널만 반환한다', async () => {
    const { api, calls } = client([
      json({ data:{ account:{ id:'acc', organizations:[{ id:'org-1', name:'내 조직' }] } } }),
      json({ data:{ channels:[
        { id:'ch-1', organizationId:'org-1', service:'threads', serviceId:'1789', name:'boksajang', displayName:'복사장', isDisconnected:false, isLocked:false, isQueuePaused:false },
        { id:'ch-2', organizationId:'org-1', service:'instagram', serviceId:'1', name:'insta', isDisconnected:false, isLocked:false, isQueuePaused:false },
      ] } }),
    ]);
    const channels = await api.threadsChannels('override-key');
    expect(channels).toEqual([expect.objectContaining({ id:'ch-1', name:'boksajang', displayName:'복사장', organizationName:'내 조직', serviceId:'1789' })]);
    expect(calls[0].headers.Authorization).toBe('Bearer override-key');
    expect(calls[1].body.variables).toEqual({ input:{ organizationId:'org-1' } });
  });
});

describe('Buffer 보조 함수', () => {
  it('Threads 게시물 주소에서 shortcode를 꺼낸다', () => {
    expect(threadsShortcode('https://www.threads.com/@me/post/DAbc_12-x?xmt=1')).toBe('DAbc_12-x');
    expect(threadsShortcode('https://www.threads.net/@me/post/XYZ')).toBe('XYZ');
    expect(threadsShortcode('https://example.com/@me/post/XYZ')).toBeUndefined();
    expect(threadsShortcode('not a url')).toBeUndefined();
  });

  it('Buffer 지표를 앱 성과 항목으로 바꾼다', () => {
    expect(insightsFromBufferMetrics([
      { type:'impressions', value:120 }, { type:'reactions', value:7 }, { type:'comments', value:3 },
      { type:'reposts', value:2 }, { type:'quotes', value:1 }, { type:'engagementRate', value:4.5 },
    ])).toEqual({ views:120, likes:7, replies:3, reposts:2, quotes:1 });
    expect(insightsFromBufferMetrics([{ type:'views', value:50 }, { type:'impressions', value:90 }])).toEqual({ views:50 });
  });
});
