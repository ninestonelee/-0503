import type { Account, ThreadsPostSummary, ThreadsProfile, ThreadsTokenDebugResult } from '../../shared/domain';
import type { CredentialManager } from '../services/settings';
import { threadsShortcode, type BufferApiClient } from './buffer';
import type { ConnectionResult, InsightValues, PublishInput, PublishResult, RemoteComment, ThreadsProvider, ThreadsTokenRefreshResult } from './contracts';

/** Buffer로 발행했지만 Threads 미디어 ID를 확인하지 못한 게시물의 원격 ID 접두어 */
export const BUFFER_REMOTE_PREFIX = 'buffer:';

export const isBufferRemoteId = (remoteId?: string): remoteId is `buffer:${string}` => Boolean(remoteId?.startsWith(BUFFER_REMOTE_PREFIX));
export const bufferPostIdFrom = (remoteId: string): string => remoteId.slice(BUFFER_REMOTE_PREFIX.length);

interface RoutedRepository {
  getAccount(id: string): Account | undefined;
  addLog(level: 'INFO' | 'WARN' | 'ERROR', category: string, message: string, detail?: string, accountId?: string): unknown;
}

const BUFFER_ONLY_MESSAGE = 'Buffer로 발행해 Threads 게시물 ID가 없는 글입니다. 삭제·댓글 관리는 Threads 앱에서 직접 하거나, 계정 설정에 Threads Access Token을 추가한 뒤 새로 발행한 글부터 사용할 수 있습니다.';

/**
 * 계정별 발행 경로에 따라 Threads 발행을 Meta Threads API 또는 Buffer API로 보낸다.
 * 댓글·삭제·토큰 관리처럼 Buffer API가 제공하지 않는 기능은 Meta Threads API를 그대로 사용한다.
 */
export class RoutedThreadsProvider implements ThreadsProvider {
  constructor(
    private readonly repositories: RoutedRepository,
    private readonly credentials: Pick<CredentialManager, 'status'>,
    private readonly meta: ThreadsProvider,
    private readonly buffer: Pick<BufferApiClient, 'publishNow' | 'metrics' | 'channel'>,
  ) {}

  private account(accountId: string): Account {
    const account = this.repositories.getAccount(accountId);
    if (!account) throw new Error('Threads 계정을 찾을 수 없습니다.');
    return account;
  }

  private viaBuffer(accountId: string): boolean {
    return this.account(accountId).publishRoute === 'BUFFER';
  }

  private async hasMetaToken(accountId: string): Promise<boolean> {
    const key = `threadsToken:${accountId}` as const;
    return Boolean((await this.credentials.status([key]))[key]?.stored);
  }

  private assertThreadsRemoteId(remoteId: string): void {
    if (isBufferRemoteId(remoteId)) throw new Error(BUFFER_ONLY_MESSAGE);
  }

  verifyAccessToken(accessToken: string): Promise<ThreadsProfile> { return this.meta.verifyAccessToken(accessToken); }
  debugAccessToken(accessToken: string): Promise<ThreadsTokenDebugResult> { return this.meta.debugAccessToken(accessToken); }
  debugStoredAccessToken(accountId: string): Promise<ThreadsTokenDebugResult> { return this.meta.debugStoredAccessToken(accountId); }
  refreshAccessToken(accountId: string): Promise<ThreadsTokenRefreshResult> { return this.meta.refreshAccessToken(accountId); }
  ownPosts(accountId: string, limit?: number): Promise<ThreadsPostSummary[]> { return this.meta.ownPosts(accountId, limit); }

  async test(accountId: string): Promise<ConnectionResult> {
    const account = this.account(accountId);
    if (account.publishRoute !== 'BUFFER') return this.meta.test(accountId);
    if (!account.bufferChannelId) return { ok:false, message:'Buffer Threads 채널이 선택되지 않았습니다.' };
    try {
      const channel = await this.buffer.channel(account.bufferChannelId);
      if (channel.isDisconnected) return { ok:false, message:`Buffer에서 @${channel.name} 채널 연결이 끊어졌습니다. Buffer에서 채널을 다시 연결하세요.` };
      if (channel.isLocked) return { ok:false, message:`Buffer 요금제 제한으로 @${channel.name} 채널이 잠겨 있습니다.` };
      return { ok:true, message:`Buffer 연결에 성공했습니다. (@${channel.name}${channel.isQueuePaused ? ' · Buffer 대기열 일시정지 상태' : ''})` };
    } catch (error) {
      return { ok:false, message:`Buffer 연결 실패: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async getPost(accountId: string, postId: string): Promise<ThreadsPostSummary> {
    this.assertThreadsRemoteId(postId);
    return this.meta.getPost(accountId, postId);
  }

  async replies(accountId: string, parentId: string, limit?: number): Promise<ThreadsPostSummary[]> {
    this.assertThreadsRemoteId(parentId);
    return this.meta.replies(accountId, parentId, limit);
  }

  async conversation(accountId: string, parentId: string, limit?: number): Promise<ThreadsPostSummary[]> {
    this.assertThreadsRemoteId(parentId);
    return this.meta.conversation(accountId, parentId, limit);
  }

  async deletePost(accountId: string, postId: string): Promise<string> {
    this.assertThreadsRemoteId(postId);
    return this.meta.deletePost(accountId, postId);
  }

  async comments(accountId: string): Promise<RemoteComment[]> {
    // Buffer API는 Threads 댓글을 제공하지 않는다. Meta 토큰이 없으면 댓글 자동 답글을 건너뛴다.
    if (this.viaBuffer(accountId) && !await this.hasMetaToken(accountId)) return [];
    return this.meta.comments(accountId);
  }

  async reply(accountId: string, commentId: string, text: string, linkUrl?: string): Promise<PublishResult> {
    return this.meta.reply(accountId, commentId, text, linkUrl);
  }

  async insights(accountId: string, postId: string): Promise<InsightValues> {
    if (isBufferRemoteId(postId)) return this.buffer.metrics(bufferPostIdFrom(postId));
    return this.meta.insights(accountId, postId);
  }

  async publish(accountId: string, input: PublishInput): Promise<PublishResult> {
    const account = this.account(accountId);
    if (account.publishRoute !== 'BUFFER') return this.meta.publish(accountId, input);
    if (!account.bufferChannelId) throw new Error('Buffer Threads 채널이 선택되지 않았습니다. 계정 설정에서 발행 경로를 확인하세요.');
    const { post, settled } = await this.buffer.publishNow(account.bufferChannelId, input);
    if (!settled) {
      this.repositories.addLog('WARN', 'PUBLISH', 'Buffer가 게시물을 받았지만 Threads 발행 완료를 아직 확인하지 못했습니다. Buffer가 이어서 발행합니다.',
        `Buffer 게시물 ID: ${post.id} · 상태: ${post.status}`, accountId);
      return { remoteId:`${BUFFER_REMOTE_PREFIX}${post.id}` };
    }
    const threadsId = await this.resolveThreadsId(accountId, post.externalLink);
    return { remoteId:threadsId ?? `${BUFFER_REMOTE_PREFIX}${post.id}`, permalink:post.externalLink };
  }

  /**
   * Meta 토큰이 함께 저장된 계정은 Buffer가 돌려준 게시물 주소로 Threads 미디어 ID를 찾아 저장한다.
   * 그러면 기존 댓글 자동 답글·삭제·성과 수집 기능을 그대로 쓸 수 있다.
   */
  private async resolveThreadsId(accountId: string, permalink?: string): Promise<string | undefined> {
    const shortcode = threadsShortcode(permalink);
    if (!shortcode || !await this.hasMetaToken(accountId)) return undefined;
    try {
      const posts = await this.meta.ownPosts(accountId, 10);
      return posts.find((post) => threadsShortcode(post.permalink) === shortcode)?.id;
    } catch (error) {
      this.repositories.addLog('WARN', 'PUBLISH', 'Buffer 발행은 완료됐지만 Threads 게시물 ID를 찾지 못해 Buffer 기준으로 기록합니다.',
        error instanceof Error ? error.message : String(error), accountId);
      return undefined;
    }
  }
}
