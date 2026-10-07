import type { Account } from '../../shared/domain';
import type { Repositories } from '../db/repositories';
import type { CredentialManager } from './settings';
import { missingAccountRequirements } from './account-completeness';

export class PublishEligibility {
  constructor(
    private readonly repositories: Repositories,
    private readonly credentials: CredentialManager,
  ) {}

  /** 계정의 발행 경로(Threads API 직접 / Buffer)에 필요한 인증 정보가 모두 저장되어 있는지 확인한다. */
  async hasPublishCredential(accountId: string): Promise<boolean> {
    const account = this.repositories.getAccount(accountId);
    if (!account) return false;
    if (account.publishRoute === 'BUFFER') {
      const status = await this.credentials.status(['bufferApiKey']);
      return Boolean(account.bufferChannelId && status.bufferApiKey?.stored);
    }
    const status = await this.credentials.status([`threadsToken:${accountId}`]);
    return Boolean(account.threadsUserId && status[`threadsToken:${accountId}`]?.stored);
  }

  async assertAccountReady(accountId: string): Promise<void> {
    const account = this.repositories.getAccount(accountId);
    if (!account) throw new Error('발행할 계정을 찾을 수 없습니다.');
    if (account.publishRoute === 'BUFFER') {
      const missing = missingAccountRequirements(account, await this.hasPublishCredential(accountId), 'BUFFER');
      if (missing.length) throw new Error(`${account.name} 계정의 발행 설정이 필요합니다: ${[...new Set(missing)].join(', ')}`);
      return;
    }
    const tokenStatus = await this.credentials.status([`threadsToken:${accountId}`]);
    const missing = missingAccountRequirements(account, Boolean(tokenStatus[`threadsToken:${accountId}`]?.stored));
    if (!account.threadsUserId) missing.unshift('Threads 계정 인증');
    if (account.threadsTokenCheckFailedAt) missing.push('Threads 토큰 연결 재확인');
    if (account.threadsTokenValid === false || [account.threadsTokenExpiresAt,account.threadsTokenDataAccessExpiresAt].some(value=>value && Date.parse(value)<=Date.now())) missing.push('Threads 토큰 재인증');
    if (missing.length) throw new Error(`${account.name} 계정의 발행 설정이 필요합니다: ${[...new Set(missing)].join(', ')}`);
  }

  async assertAutomationReady(accounts = this.repositories.listAccounts()): Promise<void> {
    const targets = accounts.filter((account) => account.active && account.automationTarget);
    const missing: Account[] = [];
    for (const account of targets) { try { await this.assertAccountReady(account.id); } catch { missing.push(account); } }
    if (missing.length) throw new Error(`발행 설정이 완료되지 않은 자동화 계정: ${missing.map((account) => account.name).join(', ')}`);
  }

  async removeThreadsAccess(accountId: string): Promise<void> {
    await this.credentials.delete(`threadsToken:${accountId}`);
    if (this.repositories.getAccount(accountId)?.publishRoute === 'BUFFER') {
      // Buffer 발행 계정은 Meta 토큰 없이도 발행할 수 있으므로 댓글·삭제 기능만 해제된다.
      this.repositories.addLog('INFO', 'ACCOUNT', 'Threads 토큰을 삭제했습니다. Buffer 발행은 유지되며 댓글 자동 답글·삭제 기능은 사용할 수 없습니다.', undefined, accountId);
      return;
    }
    this.repositories.disableAutomationTarget(accountId);
    const cancelled = this.repositories.cancelPendingThreadsJobs(accountId);
    this.repositories.addLog('WARN', 'ACCOUNT', `Threads 토큰을 삭제해 자동화 대상을 해제하고 대기 작업 ${cancelled}개를 취소했습니다.`, undefined, accountId);
  }
}
