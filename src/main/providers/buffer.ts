import type { BufferChannel } from '../../shared/domain';
import type { CredentialManager } from '../services/settings';
import { ProviderRequestError, UncertainRemoteOperationError, type InsightValues, type PublishInput } from './contracts';

// Buffer 공개 GraphQL API (https://developers.buffer.com)
const API_URL = 'https://api.buffer.com';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_IMAGES = 20;
const STATUS_POLL_INTERVAL_MS = 3_000;
const STATUS_POLL_MAX_ATTEMPTS = 20;

export const BUFFER_API_KEY = 'bufferApiKey' as const;

const POST_FIELDS = 'id status dueAt sentAt externalLink error { message }';

const CREATE_POST = `mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { ${POST_FIELDS} } }
    ... on MutationError { message }
  }
}`;

const GET_POST = `query GetPost($input: PostInput!) { post(input: $input) { ${POST_FIELDS} } }`;
const GET_POST_METRICS = `query GetPostMetrics($input: PostInput!) { post(input: $input) { id status metrics { type value } } }`;
const GET_ORGANIZATIONS = 'query GetOrganizations { account { id organizations { id name } } }';
const GET_CHANNELS = `query GetChannels($input: ChannelsInput!) {
  channels(input: $input) { id name displayName service serviceId avatar externalLink isDisconnected isLocked isQueuePaused organizationId }
}`;

export type BufferPostStatus = 'draft' | 'error' | 'needs_approval' | 'scheduled' | 'sending' | 'sent';

export interface BufferPost {
  id: string;
  status: BufferPostStatus | string;
  dueAt?: string;
  sentAt?: string;
  externalLink?: string;
  errorMessage?: string;
}

export interface BufferPublishResult {
  post: BufferPost;
  /** 상태 확인 제한 시간 안에 sent/error로 확정되지 않았으면 false */
  settled: boolean;
}

const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;

const safeMessage = (value: unknown, secret?: string): string | undefined => {
  const message = text(value);
  if (!message) return undefined;
  return (secret ? message.replaceAll(secret, '[REDACTED]') : message).slice(0, 240);
};

const postFrom = (value: any): BufferPost => {
  const id = text(value?.id);
  if (!id) throw new Error('Buffer 게시물 ID를 확인할 수 없습니다.');
  return {
    id, status:text(value?.status) ?? 'scheduled', dueAt:text(value?.dueAt), sentAt:text(value?.sentAt),
    externalLink:text(value?.externalLink), errorMessage:text(value?.error?.message),
  };
};

const channelFrom = (value: any, organizationName?: string): BufferChannel | undefined => {
  const id = text(value?.id);
  const organizationId = text(value?.organizationId);
  if (!id || !organizationId) return undefined;
  return {
    id, organizationId, organizationName, service:text(value?.service) ?? '', serviceId:text(value?.serviceId) ?? '',
    name:(text(value?.name) ?? '').replace(/^@/, ''), displayName:text(value?.displayName), avatar:text(value?.avatar),
    externalLink:text(value?.externalLink), isDisconnected:value?.isDisconnected === true, isLocked:value?.isLocked === true,
    isQueuePaused:value?.isQueuePaused === true,
  };
};

const imageUrls = (input: PublishInput): string[] => {
  const values = input.imageUrls?.length ? input.imageUrls : input.imageUrl ? [input.imageUrl] : [];
  if (values.length > MAX_IMAGES) throw new Error(`Threads 이미지는 최대 ${MAX_IMAGES}장까지 발행할 수 있습니다.`);
  if (values.some((value) => typeof value !== 'string' || !value.trim())) throw new Error('Threads 이미지 주소를 확인할 수 없습니다.');
  return values.map((value) => value.trim());
};

/** Threads 게시물 주소의 shortcode를 비교용으로 꺼낸다. (threads.net / threads.com 모두 허용) */
export const threadsShortcode = (value?: string): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!/(^|\.)threads\.(net|com)$/i.test(url.hostname)) return undefined;
    return /\/post\/([^/?#]+)/.exec(url.pathname)?.[1];
  } catch {
    return undefined;
  }
};

/** Buffer 정규화 지표를 앱의 Threads 성과 항목으로 옮긴다. */
export const insightsFromBufferMetrics = (metrics: Array<{ type?: unknown; value?: unknown }>): InsightValues => {
  const values = new Map<string, number>();
  for (const metric of metrics) {
    const value = Number(metric?.value);
    if (typeof metric?.type === 'string' && Number.isFinite(value)) values.set(metric.type, value);
  }
  const pick = (...types: string[]): number | undefined => types.map((type) => values.get(type)).find((value) => value !== undefined);
  const result: InsightValues = {
    views:pick('views', 'impressions'), likes:pick('reactions', 'likes'), replies:pick('comments'),
    reposts:pick('reposts'), quotes:pick('quotes'), shares:pick('shares'),
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined)) as InsightValues;
};

interface RequestOptions {
  operation: string;
  /** 서버가 요청을 처리했는지 알 수 없는 실패를 불확실 오류로 다룬다. (게시물 생성 전용) */
  uncertainOnFailure?: boolean;
}

export class BufferApiClient {
  constructor(
    private readonly credentials: Pick<CredentialManager, 'get'>,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly pause: (milliseconds: number) => Promise<void> = async () => undefined,
  ) {}

  private async apiKey(override?: string): Promise<string> {
    const key = override?.trim() || await this.credentials.get(BUFFER_API_KEY);
    if (!key) throw new Error('Buffer API 키가 저장되지 않았습니다. 계정 관리 > Buffer 연결에서 API 키를 저장하세요.');
    return key;
  }

  private async request(query: string, variables: Record<string, unknown>, options: RequestOptions, apiKeyOverride?: string): Promise<any> {
    const key = await this.apiKey(apiKeyOverride);
    const uncertain = (message: string, cause?: unknown) => new UncertainRemoteOperationError(
      `Buffer ${options.operation} 결과가 불확실합니다. 중복 발행을 막기 위해 자동 재시도하지 않습니다. Buffer 대기열을 확인하세요. 원인: ${message}`, { cause });
    let response: Response;
    try {
      response = await this.fetchImpl(API_URL, {
        method:'POST', signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers:{ Authorization:`Bearer ${key}`, 'Content-Type':'application/json', Accept:'application/json' },
        body:JSON.stringify({ query, variables }),
      });
    } catch (error) {
      const message = safeMessage(error instanceof Error ? error.message : String(error), key) ?? '네트워크 오류';
      if (options.uncertainOnFailure) throw uncertain(message);
      throw new ProviderRequestError(`Buffer 서비스에 연결할 수 없어 ${options.operation}을(를) 완료하지 못했습니다. (${message})`, true);
    }
    const raw = await response.text();
    if (Buffer.byteLength(raw) > MAX_RESPONSE_BYTES) throw new Error('Buffer API 응답 크기 제한을 초과했습니다.');
    let body: any;
    try { body = JSON.parse(raw); } catch { body = undefined; }
    const retryAfterMs = Number(response.headers.get('retry-after') ?? 0) * 1000 || undefined;
    const firstError = Array.isArray(body?.errors) ? body.errors[0] : undefined;
    const code = text(firstError?.extensions?.code) ?? (response.status === 401 ? 'UNAUTHORIZED' : response.status === 429 ? 'RATE_LIMIT_EXCEEDED' : undefined);
    if (code === 'UNAUTHORIZED') throw new ProviderRequestError('Buffer API 키가 유효하지 않습니다. Buffer 설정 > API에서 키를 다시 발급해 저장하세요.', false, undefined, 401);
    if (code === 'FORBIDDEN') throw new ProviderRequestError(`Buffer ${options.operation} 권한이 없습니다. 이 API 키 계정이 소유한 채널인지 확인하세요.`, false, undefined, 403);
    if (code === 'NOT_FOUND') throw new ProviderRequestError(`Buffer ${options.operation} 대상을 찾을 수 없습니다.`, false, undefined, 404);
    if (code === 'RATE_LIMIT_EXCEEDED') {
      // 요청 한도 초과는 서버가 요청을 거부한 것이므로 게시물 생성이라도 재시도해도 중복되지 않는다.
      throw new ProviderRequestError(`Buffer API 요청 한도를 초과했습니다. 잠시 후 다시 시도합니다. [${options.operation}]`, true, retryAfterMs, 429);
    }
    if (code === 'GRAPHQL_VALIDATION_FAILED' || code === 'GRAPHQL_PARSE_FAILED' || code === 'BAD_USER_INPUT') {
      // 실행 전에 거부된 요청이므로 게시물이 만들어지지 않았다.
      throw new ProviderRequestError(`Buffer ${options.operation} 요청 형식이 거부되었습니다: ${safeMessage(firstError?.message, key) ?? code}`, false, undefined, 400);
    }
    if (!response.ok || firstError || !body?.data) {
      const message = safeMessage(firstError?.message, key) ?? `HTTP ${response.status}`;
      if (options.uncertainOnFailure) throw uncertain(message);
      throw new ProviderRequestError(`Buffer ${options.operation} 요청이 실패했습니다: ${message}`, response.status >= 500 || code === 'UNEXPECTED', retryAfterMs, response.status);
    }
    return body.data;
  }

  async organizations(apiKey?: string): Promise<Array<{ id: string; name?: string }>> {
    const data = await this.request(GET_ORGANIZATIONS, {}, { operation:'계정 확인' }, apiKey);
    const organizations = Array.isArray(data?.account?.organizations) ? data.account.organizations : [];
    return organizations.map((organization: any) => ({ id:text(organization?.id) ?? '', name:text(organization?.name) }))
      .filter((organization: { id: string }) => organization.id);
  }

  /** API 키에 연결된 모든 조직의 Threads 채널을 반환한다. */
  async threadsChannels(apiKey?: string): Promise<BufferChannel[]> {
    const channels: BufferChannel[] = [];
    for (const organization of await this.organizations(apiKey)) {
      const data = await this.request(GET_CHANNELS, { input:{ organizationId:organization.id } }, { operation:'채널 조회' }, apiKey);
      for (const value of Array.isArray(data?.channels) ? data.channels : []) {
        const channel = channelFrom(value, organization.name);
        if (channel?.service === 'threads') channels.push(channel);
      }
    }
    return channels;
  }

  async channel(channelId: string): Promise<BufferChannel> {
    const found = (await this.threadsChannels()).find((channel) => channel.id === channelId);
    if (!found) throw new Error('Buffer에서 선택한 Threads 채널을 찾을 수 없습니다. Buffer에 채널이 연결되어 있는지 확인하세요.');
    return found;
  }

  async getPost(postId: string): Promise<BufferPost> {
    const data = await this.request(GET_POST, { input:{ id:postId } }, { operation:'게시물 상태 확인' });
    return postFrom(data?.post);
  }

  async metrics(postId: string): Promise<InsightValues> {
    const data = await this.request(GET_POST_METRICS, { input:{ id:postId } }, { operation:'성과 조회' });
    return insightsFromBufferMetrics(Array.isArray(data?.post?.metrics) ? data.post.metrics : []);
  }

  /**
   * Buffer에 '지금 공유(shareNow)'로 게시물을 만든 뒤 Threads 발행이 확정될 때까지 상태를 확인한다.
   * 예약 시각 관리는 앱 스케줄러가 맡으므로 Buffer 대기열 시간은 사용하지 않는다.
   */
  async publishNow(channelId: string, input: PublishInput): Promise<BufferPublishResult> {
    const images = imageUrls(input);
    const postInput: Record<string, unknown> = {
      text:input.text, channelId, schedulingType:'automatic', mode:'shareNow',
      assets:images.map((url) => ({ image:{ url } })),
    };
    // Buffer는 링크 첨부와 이미지 자산을 함께 받지 않는다. 이미지가 없을 때만 링크 카드를 붙인다.
    if (!images.length && input.linkUrl) postInput.metadata = { threads:{ linkAttachment:{ url:input.linkUrl } } };
    const data = await this.request(CREATE_POST, { input:postInput }, { operation:'게시물 생성', uncertainOnFailure:true });
    const result = data?.createPost;
    if (result?.__typename !== 'PostActionSuccess' || !result?.post) {
      const reason = safeMessage(result?.message) ?? 'Buffer가 게시물 생성 이유를 알려주지 않았습니다.';
      throw new ProviderRequestError(`Buffer가 게시물 생성을 거부했습니다: ${reason}`, false);
    }
    let post: BufferPost;
    try { post = postFrom(result.post); }
    catch (error) { throw new UncertainRemoteOperationError('Buffer 게시물은 만들어졌지만 ID를 확인하지 못했습니다. Buffer 대기열을 확인하세요.', { cause:error }); }
    for (let attempt = 0; attempt < STATUS_POLL_MAX_ATTEMPTS; attempt += 1) {
      if (post.status === 'sent') return { post, settled:true };
      if (post.status === 'error') {
        throw new ProviderRequestError(`Buffer가 Threads 발행에 실패했습니다: ${post.errorMessage ?? '원인 미상'} (Buffer 게시물 ID: ${post.id})`, false);
      }
      await this.pause(STATUS_POLL_INTERVAL_MS);
      try { post = await this.getPost(post.id); }
      catch (error) {
        // 상태 확인 실패는 발행 실패가 아니다. Buffer가 이미 발행을 맡았으므로 확인만 다음으로 미룬다.
        if (error instanceof ProviderRequestError && error.retryable) continue;
        throw new UncertainRemoteOperationError(`Buffer 게시물(${post.id}) 상태를 확인하지 못했습니다. Buffer에서 발행 여부를 확인하세요.`, { cause:error });
      }
    }
    return { post, settled:false };
  }
}
