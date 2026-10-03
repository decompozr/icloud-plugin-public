import type { MailTarget } from './mail.js';
export type UnsubscribeAction = { kind: 'mailto'; recipient: string; subject: string; body: string }
  | { kind: 'oneclick'; url: string };
export interface UnsubscribeCandidate { candidateId: string; kind: 'mailto' | 'oneclick' | 'manual'; destination: string; reason?: string }
export interface UnsubscribeDiscovery { target: MailTarget; candidates: UnsubscribeCandidate[]; unsupportedReasons: string[] }
export interface UnsubscribeSubmission extends MailTarget { candidateId: string }
export interface UnsubscribeResult { status: 'submitted'; candidateId: string; confirmed: false }
export interface UnsubscribeSource { fetchRaw(target: MailTarget): Promise<Uint8Array> }
export interface DerivedUnsubscribe { candidate: Omit<UnsubscribeCandidate, 'candidateId'>; action?: UnsubscribeAction }
export interface UnsubscribeGateway {
  discover(raw: Uint8Array): Promise<{ entries: DerivedUnsubscribe[]; unsupportedReasons: string[] }>;
  submit(action: UnsubscribeAction): Promise<void>;
}
export interface UnsubscribeOperations {
  discover(target: MailTarget): Promise<UnsubscribeDiscovery>;
  submit(input: UnsubscribeSubmission): Promise<UnsubscribeResult>;
}
