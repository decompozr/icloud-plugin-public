import { createHash } from 'node:crypto';
import { MailOperationError, type MailTarget } from '../domain/mail.js';
import type { UnsubscribeGateway, UnsubscribeOperations, UnsubscribeSource, UnsubscribeSubmission, UnsubscribeResult } from '../domain/unsubscribe.js';

export class UnsubscribeService implements UnsubscribeOperations {
  constructor(private readonly source: UnsubscribeSource, private readonly gateway: UnsubscribeGateway,
    private readonly policy: { enabled: boolean } = { enabled: false }) {}
  private async derive(target: MailTarget) {
    const raw = await this.source.fetchRaw(target);
    if (raw.byteLength > 5 * 1024 * 1024) throw new MailOperationError('invalid_input', 'Message exceeds unsubscribe discovery limit');
    const result = await this.gateway.discover(raw);
    const messageHash = createHash('sha256').update(raw).digest('hex');
    return { ...result, entries: result.entries.map(entry => ({ ...entry, candidate: { ...entry.candidate,
      candidateId: createHash('sha256').update(JSON.stringify([target.mailbox, target.uid, target.uidValidity, messageHash, entry])).digest('hex') } })) };
  }
  async discover(target: MailTarget) {
    const result = await this.derive(target);
    return { target, candidates: result.entries.map(entry => entry.candidate), unsupportedReasons: result.unsupportedReasons };
  }
  async submit(input: UnsubscribeSubmission): Promise<UnsubscribeResult> {
    if (!this.policy.enabled) throw new MailOperationError('forbidden', 'Unsubscribe submission is disabled');
    const result = await this.derive(input);
    const entry = result.entries.find(entry => entry.candidate.candidateId === input.candidateId);
    if (!entry?.action) throw new MailOperationError('invalid_input', 'Unsubscribe candidate changed or is not supported; discover again');
    await this.gateway.submit(entry.action);
    return { status: 'submitted', candidateId: input.candidateId, confirmed: false };
  }
}
