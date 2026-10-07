import { describe, expect, it, vi } from 'vitest';
import type { Account, BufferChannel, PublishRoute } from '../../shared/domain';
import { BufferAccountService } from './buffer-account';
import { PublishEligibility } from './publish-eligibility';

const channel = (overrides: Partial<BufferChannel> = {}): BufferChannel => ({
  id:'ch-1', organizationId:'org-1', service:'threads', serviceId:'1789', name:'boksajang', displayName:'복사장',
  isDisconnected:false, isLocked:false, isQueuePaused:false, ...overrides,
});

const baseAccount = (overrides: Partial<Account> = {}): Account => ({
  id:'acc-1', publishRoute:'THREADS_API', name:'복사장', threadsHandle:'boksajang', topic:'AI 바이브 코딩', personality:'', tone:'', audience:'',
  forbiddenTopics:'', forbiddenExpressions:'', dailyEnabled:true, promotionEnabled:false, automationTarget:false, active:true,
  dailyRatio:2, promotionRatio:1, dailyPostTarget:12, operationStart:'09:00', operationEnd:'21:00', weekdays:[1], commentIntervalMinutes:30,
  fixedLinkEnabled:false, fixedLinkUrl:'', createdAt:'2026-10-01T00:00:00.000Z', updatedAt:'2026-10-01T00:00:00.000Z', ...overrides,
});

function memoryRepositories(initial: Account[] = []) {
  const accounts = new Map(initial.map((account) => [account.id, account]));
  let sequence = 0;
  return {
    accounts,
    getAccount:(id: string) => accounts.get(id),
    listAccounts:() => [...accounts.values()],
    getAccountByBufferChannelId:(id: string) => [...accounts.values()].find((account) => account.bufferChannelId === id),
    saveAccount:vi.fn((input: any) => {
      const saved = baseAccount({ ...input, id:input.id ?? `new-${++sequence}` });
      accounts.set(saved.id, saved);
      return saved;
    }),
    deleteAccount:vi.fn((id: string) => { accounts.delete(id); }),
    updatePublishRoute:vi.fn((id: string, route: PublishRoute, picked?: { id:string; name:string }) => {
      const updated = { ...accounts.get(id)!, publishRoute:route, bufferChannelId:picked?.id, bufferChannelName:picked?.name };
      accounts.set(id, updated);
      return updated;
    }),
    disableAutomationTarget:vi.fn(),
    cancelPendingThreadsJobs:vi.fn(() => 2),
    addLog:vi.fn(),
  };
}

function memoryCredentials(stored: Record<string, string> = {}) {
  const values = new Map(Object.entries(stored));
  return {
    values,
    get:async (key: string) => values.get(key),
    set:vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    delete:vi.fn(async (key: string) => { values.delete(key); }),
    status:async (keys: string[]) => Object.fromEntries(keys.map((key) => [key, { stored:values.has(key) }])),
  };
}

const bufferApi = (channels: BufferChannel[] = [channel()]) => ({
  threadsChannels:vi.fn(async () => channels),
  channel:vi.fn(async (id: string) => {
    const found = channels.find((item) => item.id === id);
    if (!found) throw new Error('채널 없음');
    return found;
  }),
});

describe('BufferAccountService', () => {
  it('API 키는 실제 채널 조회에 성공한 뒤에만 저장한다', async () => {
    const credentials = memoryCredentials();
    const api = bufferApi();
    api.threadsChannels.mockRejectedValueOnce(new Error('Buffer API 키가 유효하지 않습니다.'));
    const service = new BufferAccountService(memoryRepositories() as any, credentials as any, api);
    await expect(service.saveApiKey('wrong')).rejects.toThrow('유효하지 않습니다');
    expect(credentials.set).not.toHaveBeenCalled();
    const status = await service.saveApiKey(' good-key ');
    expect(credentials.values.get('bufferApiKey')).toBe('good-key');
    expect(status).toMatchObject({ stored:true, ok:true, channels:[expect.objectContaining({ id:'ch-1' })] });
  });

  it('Buffer 채널로 Meta 토큰 없이 계정을 등록한다', async () => {
    const repositories = memoryRepositories();
    const service = new BufferAccountService(repositories as any, memoryCredentials({ bufferApiKey:'k' }) as any, bufferApi());
    const account = await service.register('ch-1');
    expect(account).toMatchObject({ name:'복사장', threadsHandle:'boksajang', publishRoute:'BUFFER', bufferChannelId:'ch-1', bufferChannelName:'boksajang' });
    expect(account.threadsUserId).toBeUndefined();
  });

  it('이미 등록된 채널이나 같은 핸들의 계정은 중복 등록하지 않는다', async () => {
    const used = new BufferAccountService(memoryRepositories([baseAccount({ id:'a', threadsHandle:'other', bufferChannelId:'ch-1' })]) as any, memoryCredentials() as any, bufferApi());
    await expect(used.register('ch-1')).rejects.toThrow('이미 다른 계정');
    const sameHandle = new BufferAccountService(memoryRepositories([baseAccount({ id:'a', threadsHandle:'@BokSajang' })]) as any, memoryCredentials() as any, bufferApi());
    await expect(sameHandle.register('ch-1')).rejects.toThrow("'발행 경로'에서 Buffer로");
  });

  it('연결이 끊기거나 잠긴 채널은 등록하지 않는다', async () => {
    const service = new BufferAccountService(memoryRepositories() as any, memoryCredentials() as any, bufferApi([channel({ isDisconnected:true })]));
    await expect(service.register('ch-1')).rejects.toThrow('연결이 끊어졌습니다');
  });

  it('기존 계정의 발행 경로를 같은 Threads 계정의 Buffer 채널로만 바꾼다', async () => {
    const repositories = memoryRepositories([baseAccount({ threadsUserId:'1789', threadsHandle:'old_name' })]);
    const service = new BufferAccountService(repositories as any, memoryCredentials() as any, bufferApi([channel(), channel({ id:'ch-2', serviceId:'999', name:'stranger' })]));
    // 사용자 ID가 같으면 핸들이 바뀌었어도 같은 계정으로 본다.
    await expect(service.setRoute('acc-1', 'BUFFER', 'ch-1')).resolves.toMatchObject({ publishRoute:'BUFFER', bufferChannelId:'ch-1' });
    await expect(service.setRoute('acc-1', 'BUFFER', 'ch-2')).rejects.toThrow('이 계정(@old_name)과 다릅니다');
    await expect(service.setRoute('acc-1', 'THREADS_API')).resolves.toMatchObject({ publishRoute:'THREADS_API' });
  });

  it('API 키를 삭제하면 Buffer 발행 계정의 자동화를 해제한다', async () => {
    const repositories = memoryRepositories([baseAccount({ id:'b', publishRoute:'BUFFER', bufferChannelId:'ch-1' }), baseAccount({ id:'m' })]);
    const service = new BufferAccountService(repositories as any, memoryCredentials({ bufferApiKey:'k' }) as any, bufferApi());
    await expect(service.deleteApiKey()).resolves.toMatchObject({ stored:false });
    expect(repositories.disableAutomationTarget).toHaveBeenCalledExactlyOnceWith('b');
  });
});

describe('PublishEligibility (Buffer 경로)', () => {
  it('Buffer 계정은 Meta 토큰 없이 API 키와 채널만 있으면 발행할 수 있다', async () => {
    const repositories = memoryRepositories([baseAccount({ publishRoute:'BUFFER', bufferChannelId:'ch-1' })]);
    const eligibility = new PublishEligibility(repositories as any, memoryCredentials({ bufferApiKey:'k' }) as any);
    await expect(eligibility.hasPublishCredential('acc-1')).resolves.toBe(true);
    await expect(eligibility.assertAccountReady('acc-1')).resolves.toBeUndefined();
  });

  it('Buffer API 키가 없으면 발행 설정이 필요하다고 알린다', async () => {
    const repositories = memoryRepositories([baseAccount({ publishRoute:'BUFFER', bufferChannelId:'ch-1' })]);
    const eligibility = new PublishEligibility(repositories as any, memoryCredentials() as any);
    await expect(eligibility.hasPublishCredential('acc-1')).resolves.toBe(false);
    await expect(eligibility.assertAccountReady('acc-1')).rejects.toThrow('Buffer API 키·Threads 채널');
  });

  it('Threads API 경로 계정은 여전히 Meta 토큰이 필요하다', async () => {
    const repositories = memoryRepositories([baseAccount({ threadsUserId:'1789' })]);
    const eligibility = new PublishEligibility(repositories as any, memoryCredentials({ bufferApiKey:'k' }) as any);
    await expect(eligibility.hasPublishCredential('acc-1')).resolves.toBe(false);
    await expect(eligibility.assertAccountReady('acc-1')).rejects.toThrow('Threads Access Token');
  });
});
