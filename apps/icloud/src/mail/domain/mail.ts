/** Application-owned mail contracts. No provider SDK types cross this boundary. */
export interface MailPolicy { allowWrites?: boolean; maxMessages?: number; maxBodyChars?: number; maxAttachmentBytes?: number }
export interface MailConfig extends MailPolicy { user: string; password: string }
export interface MailTarget { accountId?: string; mailbox: string; uid: number; uidValidity: string }
export interface SearchCursor { accountId?: string; mailbox: string; uidValidity: string; beforeUid: number; startingUpperUid: number; query: string; unreadOnly: boolean }
export interface SearchRequest { mailbox: string; query?: string; unreadOnly?: boolean; limit?: number; cursor?: SearchCursor }
export interface ReadRequest extends MailTarget { mode?: 'summary' | 'full' }
export interface MarkRequest extends MailTarget { seen: boolean }
export interface FlagRequest extends MailTarget { flagged: boolean }
export interface TagRequest extends MailTarget { keyword: string; enabled: boolean }
export interface MoveRequest extends MailTarget { destination: string }
export type FolderAction = 'trash' | 'archive' | 'junk' | 'not_junk' | 'restore';
export interface OrganizeRequest extends MailTarget { action: FolderAction; destination?: string }
export type BatchAction = { type: 'mark'; seen: boolean } | { type: 'flag'; flagged: boolean }
  | { type: 'tag'; keyword: string; enabled: boolean } | { type: 'move'; destination: string }
  | { type: 'organize'; action: FolderAction; destination?: string };
export interface BatchRequest { accountId?: string; mailbox: string; uidValidity: string; uids: number[]; action: BatchAction }
export interface MailMessageInput { to: string[]; subject: string; text: string }
export interface MailAddress { name?: string; address?: string }
export interface Mailbox { path: string; name: string; specialUse?: string; selectable: boolean }
export interface MessageSummary { uid: number; subject?: string; from: MailAddress[]; date?: string; flags: string[]; size?: number }
export interface AttachmentMetadata { partId: string; filename?: string; contentType: string; size?: number }
export interface ParsedMessage { subject?: string; from?: string; to: MailAddress[]; date?: string; text: string }
export interface SearchResult { mailbox: string; uidValidity: string; messages: MessageSummary[]; truncated: boolean; nextCursor?: SearchCursor }
export interface ReadResult extends MailTarget, ParsedMessage { mode: 'summary' | 'full'; truncated: boolean; excerpt?: string; attachments?: AttachmentMetadata[] }
export interface MarkResult extends MarkRequest { updated: boolean }
export interface FlagResult extends FlagRequest { updated: boolean }
export interface TagResult extends TagRequest { updated: boolean }
export interface MoveResult { moved: boolean; destination: string; destinationTarget?: MailTarget }
export type MailMutationResult = { updated: boolean } | MoveResult;
export interface SendResult { messageId: string; accepted: string[]; rejected: string[] }
export interface MailOperations {
  listMailboxes(): Promise<Mailbox[]>;
  search(input: SearchRequest): Promise<SearchResult>;
  read(input: ReadRequest): Promise<ReadResult>;
  mark(input: MarkRequest): Promise<MarkResult>;
  flag(input: FlagRequest): Promise<FlagResult>;
  tag(input: TagRequest): Promise<TagResult>;
  move(input: MoveRequest): Promise<MoveResult>;
  organize(input: OrganizeRequest): Promise<MoveResult>;
  batch(input: BatchRequest): Promise<MailBatchOutcome>;
}
export interface MailSelectionOptions { readOnly?: boolean }
export interface MailboxLease { uidValidity: string; uidNext: number; supportsKeywords: boolean; allowedKeywords?: string[]; release(): void }
export interface MessageMetadata { size?: number; flags?: string[]; attachments: AttachmentMetadata[] }
export interface MailDownload { filename?: string; contentType: string; chunks: AsyncIterable<Uint8Array>; cancel(): void }
export interface AppendedMessage { uid?: number; uidValidity?: string }
export interface ProviderSearch { unreadOnly?: boolean; beforeUid?: number }
export interface ProviderMove { uid?: number; uidValidity?: string }
/** All message identifiers in this port are UIDs, never sequence numbers. */
export interface MailSession {
  readonly supportsMove: boolean;
  append?(mailbox:string,source:Uint8Array):Promise<AppendedMessage|undefined>;
  headers?(uid:number,maxBytes:number):Promise<Uint8Array|undefined>;
  list(): Promise<Mailbox[]>;
  select(mailbox: string, options?: MailSelectionOptions): Promise<MailboxLease>;
  search(query?: string, options?: ProviderSearch): Promise<number[]>;
  summaries(uids: number[]): Promise<MessageSummary[]>;
  metadata(uid: number): Promise<MessageMetadata | undefined>;
  download(uid: number, partId: string | undefined, maxBytes: number): Promise<MailDownload>;
  mark(uid: number, seen: boolean): Promise<boolean>;
  flag(uid: number, flagged: boolean): Promise<boolean>;
  tag(uid: number, keyword: string, enabled: boolean): Promise<boolean>;
  move(uid: number, destination: string): Promise<ProviderMove | false>;
}
export interface MailGateway {
  withSession<T>(run: (session: MailSession) => Promise<T>): Promise<T>;
  parse(source: Uint8Array): Promise<ParsedMessage>;
}
export type MailErrorCode = 'invalid_input' | 'stale_identity' | 'missing' | 'outcome_unknown'
  | 'unsupported_capability' | 'ambiguous_destination' | 'forbidden' | 'upstream_failure';
export class MailOperationError extends Error {
  constructor(readonly code: MailErrorCode, message: string) { super(message); this.name = 'MailOperationError'; }
}
export type MailItemOutcome =
  | { target: MailTarget; status: 'succeeded'; result: MailMutationResult }
  | { target: MailTarget; status: 'failed'; code: Exclude<MailErrorCode, 'outcome_unknown'> }
  | { target: MailTarget; status: 'outcome_unknown'; code: 'outcome_unknown' }
  | { target: MailTarget; status: 'not_attempted' };
export interface MailBatchOutcome { status: 'completed' | 'rejected' | 'partial' | 'unknown'; items: MailItemOutcome[] }
