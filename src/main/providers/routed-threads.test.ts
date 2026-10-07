import { describe, expect, it, vi } from 'vitest';
import type { Account, BufferChannel } from '../../shared/domain';
import type { ThreadsProvider } from './contracts';
import { RoutedThreadsProvider } from './routed-threads';

const account = (overrides: Partial<Account> = {}): Account => ({
  id:'acc-1', publishRoute:'THREADS_API', name:'복사장', threadsHandle:'boksajang', topic:'AI', personality:'', tone:'', audience:'',
  forbiddenTopics:'', forbiddenExpressions:'', dailyEnabled:true, promotionEnabled:false, automationTarget:true, active:true,
  dailyRatio:2, promotionRatio:1, dailyPostTarget:12, operationStart:'09:00', operationEnd:'21:00', weekdays:[1], commentIntervalMinutes:30,
  fixedLinkEnabled:false, fixedLinkUrl:'', createdAt:'2026-10-01T00:00:00.000Z', updatedAt:'2026-10-01T00:00:00.000Z', ...overrides,
});

function setup(current: Account, metaToken = false) {
  const meta = {
    publish:vi.fn(async () => ({ remoteId:'meta-1' })), ownPosts:vi.fn(async () => [] as any[]), comments:vi.fn(async () => []),
    insights:vi.fn(async () => ({ views:1 })), deletePost:vi.fn(async (_a: string, id: string) => id), getPost:vi.fn(),
    test:vi.fn(async () => ({ ok:true, message:'meta' })),
  };
  const buffer = {
    publishNow:vi.fn(async () => ({ settled:true, post:{ id:'bp-1', status:'sent', externalLink:'https://www.threads.com/@boksajang/post/SHORT1' } })),
    metrics:vi.fn(async () => ({ views:9 })),
    channel:vi.fn(async () => ({ id:'ch-1', name:'boksajang', isDisconnected:false, isLocked:false, isQueuePaused:false } as BufferChannel)),
  };
  const logs: string[] = [];
  const provider = new RoutedThreadsProvider(
    { getAccount:() => current, addLog:(_level, _category, message) => { logs.push(message); } },
    { status:async (keys) => Object.fromEntries(keys.map((key) => [key, { stored:metaToken }])) },
    meta as unknown as ThreadsProvider, buffer,
  );
  return { provider, meta, buffer, logs };
}

describe('RoutedThreadsProvider', () => {
  it('Threads API 경로 계정은 기존 Meta 발행을 그대로 사용한다', async () => {
    const { provider, meta, buffer } = setup(account());
    await expect(provider.publish('acc-1', { text:'본문' })).resolves.toEqual({ remoteId:'meta-1' });
    expect(meta.publish).toHaveBeenCalledOnce();
    expect(buffer.publishNow).not.toHaveBeenCalled();
  });

  it('Buffer 경로 계정은 Buffer로 발행하고 토큰이 없으면 Buffer ID로 기록한다', async () => {
    const { provider, meta, buffer } = setup(account({ publishRoute:'BUFFER', bufferChannelId:'ch-1' }));
    const input = { text:'본문', imageUrls:['https://img.example.com/a.jpg'] };
    await expect(provider.publish('acc-1', input)).resolves.toEqual({ remoteId:'buffer:bp-1', permalink:'https://www.threads.com/@boksajang/post/SHORT1' });
    expect(buffer.publishNow).toHaveBeenCalledWith('ch-1', input);
    expect(meta.publish).not.toHaveBeenCalled();
    expect(meta.ownPosts).not.toHaveBeenCalled();
  });

  it('Meta 토큰도 있으면 Buffer 발행 주소로 Threads 게시물 ID를 찾아 기존 기능을 이어서 쓴다', async () => {
    const { provider, meta } = setup(account({ publishRoute:'BUFFER', bufferChannelId:'ch-1' }), true);
    meta.ownPosts.mockResolvedValue([
      { id:'other', permalink:'https://www.threads.net/@boksajang/post/OTHER' },
      { id:'threads-77', permalink:'https://www.threads.net/@boksajang/post/SHORT1' },
    ]);
    await expect(provider.publish('acc-1', { text:'본문' })).resolves.toMatchObject({ remoteId:'threads-77' });
  });

  it('Threads 발행 완료를 확인하지 못해도 Buffer가 맡았으므로 성공으로 기록하고 경고를 남긴다', async () => {
    const { provider, buffer, logs } = setup(account({ publishRoute:'BUFFER', bufferChannelId:'ch-1' }), true);
    buffer.publishNow.mockResolvedValue({ settled:false, post:{ id:'bp-2', status:'sending' } } as any);
    await expect(provider.publish('acc-1', { text:'본문' })).resolves.toEqual({ remoteId:'buffer:bp-2' });
    expect(logs[0]).toContain('Buffer가 게시물을 받았지만');
  });

  it('Buffer 채널이 없으면 발행하지 않는다', async () => {
    const { provider, buffer } = setup(account({ publishRoute:'BUFFER' }));
    await expect(provider.publish('acc-1', { text:'본문' })).rejects.toThrow('Buffer Threads 채널이 선택되지 않았습니다');
    expect(buffer.publishNow).not.toHaveBeenCalled();
  });

  it('Buffer ID 게시물의 성과는 Buffer 지표로, Threads ID 게시물은 Meta로 조회한다', async () => {
    const { provider, meta, buffer } = setup(account({ publishRoute:'BUFFER', bufferChannelId:'ch-1' }));
    await expect(provider.insights('acc-1', 'buffer:bp-1')).resolves.toEqual({ views:9 });
    expect(buffer.metrics).toHaveBeenCalledWith('bp-1');
    await expect(provider.insights('acc-1', 'threads-1')).resolves.toEqual({ views:1 });
    expect(meta.insights).toHaveBeenCalledWith('acc-1', 'threads-1');
  });

  it('Buffer ID 게시물은 Meta API로 삭제·조회하지 않는다', async () => {
    const { provider, meta } = setup(account({ publishRoute:'BUFFER', bufferChannelId:'ch-1' }), true);
    await expect(provider.deletePost('acc-1', 'buffer:bp-1')).rejects.toThrow('Threads 게시물 ID가 없는 글');
    await expect(provider.getPost('acc-1', 'buffer:bp-1')).rejects.toThrow('Threads 게시물 ID가 없는 글');
    expect(meta.deletePost).not.toHaveBeenCalled();
    expect(meta.getPost).not.toHaveBeenCalled();
  });

  it('Meta 토큰이 없는 Buffer 계정은 댓글 수집을 건너뛰고, 토큰이 있으면 Meta로 수집한다', async () => {
    const withoutToken = setup(account({ publishRoute:'BUFFER', bufferChannelId:'ch-1' }));
    await expect(withoutToken.provider.comments('acc-1')).resolves.toEqual([]);
    expect(withoutToken.meta.comments).not.toHaveBeenCalled();
    const withToken = setup(account({ publishRoute:'BUFFER', bufferChannelId:'ch-1' }), true);
    await withToken.provider.comments('acc-1');
    expect(withToken.meta.comments).toHaveBeenCalledOnce();
  });

  it('Buffer 계정 연결 확인은 Buffer 채널 상태를 본다', async () => {
    const { provider, buffer, meta } = setup(account({ publishRoute:'BUFFER', bufferChannelId:'ch-1' }));
    await expect(provider.test('acc-1')).resolves.toMatchObject({ ok:true });
    buffer.channel.mockResolvedValue({ id:'ch-1', name:'boksajang', isDisconnected:true, isLocked:false, isQueuePaused:false } as BufferChannel);
    await expect(provider.test('acc-1')).resolves.toMatchObject({ ok:false });
    expect(meta.test).not.toHaveBeenCalled();
  });
});
