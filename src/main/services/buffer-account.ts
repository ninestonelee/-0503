import type { Account, BufferChannel, BufferConnectionStatus, PublishRoute } from '../../shared/domain';
import type { Repositories } from '../db/repositories';
import { BUFFER_API_KEY, type BufferApiClient } from '../providers/buffer';
import type { CredentialManager } from './settings';
import { newAccountDefaults } from './threads-account';

type BufferAccountRepository = Pick<Repositories,
  'getAccount' | 'listAccounts' | 'getAccountByBufferChannelId' | 'saveAccount' | 'deleteAccount' | 'updatePublishRoute'
  | 'disableAutomationTarget' | 'cancelPendingThreadsJobs' | 'addLog'>;

const sameHandle = (left?: string, right?: string): boolean =>
  Boolean(left && right && left.replace(/^@/, '').toLocaleLowerCase() === right.replace(/^@/, '').toLocaleLowerCase());

const assertUsable = (channel: BufferChannel): void => {
  if (channel.isDisconnected) throw new Error(`Buffer에서 @${channel.name} 채널 연결이 끊어졌습니다. Buffer에서 채널을 다시 연결한 뒤 시도하세요.`);
  if (channel.isLocked) throw new Error(`Buffer 요금제 제한으로 @${channel.name} 채널이 잠겨 있어 발행할 수 없습니다.`);
};

/** Buffer API 키와 계정별 Buffer Threads 채널 연결을 관리한다. */
export class BufferAccountService {
  constructor(
    private readonly repositories: BufferAccountRepository,
    private readonly credentials: Pick<CredentialManager, 'get' | 'set' | 'delete' | 'status'>,
    private readonly buffer: Pick<BufferApiClient, 'threadsChannels' | 'channel'>,
    private readonly now: () => number = Date.now,
  ) {}

  private async stored(): Promise<{ stored: boolean; updatedAt?: string }> {
    return (await this.credentials.status([BUFFER_API_KEY]))[BUFFER_API_KEY] ?? { stored:false };
  }

  async status(check = false): Promise<BufferConnectionStatus> {
    const stored = await this.stored();
    if (!stored.stored) return { ...stored, channels:[], message:'Buffer API 키가 저장되지 않았습니다.' };
    if (!check) return { ...stored, channels:[], message:'Buffer API 키가 저장되어 있습니다. 연결 확인으로 채널을 불러오세요.' };
    const checkedAt = new Date(this.now()).toISOString();
    try {
      const channels = await this.buffer.threadsChannels();
      return { ...stored, ok:true, channels, checkedAt,
        message:channels.length ? `Buffer 연결 완료 · Threads 채널 ${channels.length}개` : 'Buffer 연결은 정상이지만 연결된 Threads 채널이 없습니다. Buffer에서 Threads 채널을 먼저 추가하세요.' };
    } catch (error) {
      return { ...stored, ok:false, channels:[], checkedAt, message:error instanceof Error ? error.message : String(error) };
    }
  }

  /** 키를 저장하기 전에 실제 API 호출로 유효성을 확인한다. */
  async saveApiKey(apiKey: string): Promise<BufferConnectionStatus> {
    const key = apiKey.trim();
    if (!key) throw new Error('Buffer API 키를 입력하세요.');
    await this.buffer.threadsChannels(key);
    await this.credentials.set(BUFFER_API_KEY, key);
    this.repositories.addLog('INFO', 'BUFFER', 'Buffer API 키를 확인하고 저장했습니다.');
    return this.status(true);
  }

  async deleteApiKey(): Promise<BufferConnectionStatus> {
    await this.credentials.delete(BUFFER_API_KEY);
    let cancelled = 0;
    for (const account of this.repositories.listAccounts().filter((item) => item.publishRoute === 'BUFFER')) {
      this.repositories.disableAutomationTarget(account.id);
      cancelled += this.repositories.cancelPendingThreadsJobs(account.id);
    }
    this.repositories.addLog('WARN', 'BUFFER', `Buffer API 키를 삭제해 Buffer 발행 계정의 자동화를 해제하고 대기 작업 ${cancelled}개를 취소했습니다.`);
    return this.status(false);
  }

  private assertChannelFree(channel: BufferChannel, accountId?: string): void {
    const duplicate = this.repositories.getAccountByBufferChannelId(channel.id);
    if (duplicate && duplicate.id !== accountId) throw new Error(`이미 다른 계정(${duplicate.name})에 연결된 Buffer 채널입니다: @${channel.name}`);
  }

  /** Buffer Threads 채널로 새 계정을 등록한다. Meta Access Token이 없어도 발행할 수 있다. */
  async register(channelId: string): Promise<Account> {
    const channel = await this.buffer.channel(channelId);
    assertUsable(channel);
    this.assertChannelFree(channel);
    const existing = this.repositories.listAccounts().find((account) => sameHandle(account.threadsHandle, channel.name));
    if (existing) throw new Error(`이미 등록된 Threads 계정(@${existing.threadsHandle})입니다. 계정 설정의 '발행 경로'에서 Buffer로 바꾸세요.`);
    const saved = this.repositories.saveAccount(newAccountDefaults(channel.displayName ?? channel.name, channel.name));
    try {
      const routed = this.repositories.updatePublishRoute(saved.id, 'BUFFER', { id:channel.id, name:channel.name });
      this.repositories.addLog('INFO', 'BUFFER', `Buffer Threads 채널 @${channel.name}로 계정을 등록했습니다.`, undefined, saved.id);
      return routed;
    } catch (error) {
      this.repositories.deleteAccount(saved.id);
      throw error;
    }
  }

  async setRoute(accountId: string, route: PublishRoute, channelId?: string): Promise<Account> {
    const account = this.repositories.getAccount(accountId);
    if (!account) throw new Error('발행 경로를 변경할 계정을 찾을 수 없습니다.');
    if (route === 'THREADS_API') {
      const updated = this.repositories.updatePublishRoute(account.id, 'THREADS_API');
      this.repositories.addLog('INFO', 'BUFFER', '발행 경로를 Threads API 직접 발행으로 변경했습니다.', undefined, account.id);
      return updated;
    }
    if (!channelId) throw new Error('Buffer Threads 채널을 선택하세요.');
    const channel = await this.buffer.channel(channelId);
    assertUsable(channel);
    this.assertChannelFree(channel, account.id);
    const sameUser = Boolean(account.threadsUserId && channel.serviceId && account.threadsUserId === channel.serviceId);
    if (account.threadsHandle && !sameUser && !sameHandle(account.threadsHandle, channel.name)) {
      throw new Error(`선택한 Buffer 채널(@${channel.name})이 이 계정(@${account.threadsHandle.replace(/^@/, '')})과 다릅니다. 같은 Threads 계정의 채널을 선택하세요.`);
    }
    const updated = this.repositories.updatePublishRoute(account.id, 'BUFFER', { id:channel.id, name:channel.name });
    this.repositories.addLog('INFO', 'BUFFER', `발행 경로를 Buffer(@${channel.name})로 변경했습니다.`, undefined, account.id);
    return updated;
  }
}
