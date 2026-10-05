import { MailOperationError } from '../domain/mail.js';
import type {
  BatchAction, BatchRequest, FlagRequest, FlagResult, MailBatchOutcome, MailDownload, MailGateway,
  MailItemOutcome, MailMutationResult, MailOperations, MailPolicy, MailSession, MailTarget, Mailbox,
  MailboxLease, MessageMetadata, MarkRequest, MarkResult, MoveRequest, MoveResult, OrganizeRequest,
  ReadRequest, ReadResult, SearchRequest, SearchResult, TagRequest, TagResult,
} from '../domain/mail.js';
export type { MailConfig, MailTarget, MailMessageInput } from '../domain/mail.js';

export class MailService implements MailOperations {
  private readonly policy: Required<MailPolicy>;
  constructor(policy: MailPolicy, private readonly gateway: MailGateway, private readonly access?:()=>{read:boolean;write:boolean}) {
    this.policy = { allowWrites: false, maxMessages: 100, maxBodyChars: 100000, maxAttachmentBytes: 1024 * 1024, ...policy };
    for (const key of ['maxMessages', 'maxBodyChars', 'maxAttachmentBytes'] as const) {
      if (!Number.isSafeInteger(this.policy[key]) || this.policy[key] < 1) throw new MailOperationError('invalid_input', `Invalid ${key}`);
    }
  }
  private mailbox(value: string): string {
    if (!value || value.length > 1024 || /[\r\n\0]/.test(value)) throw new MailOperationError('invalid_input', 'Invalid mailbox');
    return value;
  }
  private async selected<T>(session: MailSession, mailbox: string, readOnly: boolean, run: (lease: MailboxLease) => Promise<T>): Promise<T> {
    const lease = await session.select(this.mailbox(mailbox), { readOnly });
    try { return await run(lease); } finally { lease.release(); }
  }
  private checkTarget(uidValidity: string, target: MailTarget): void {
    if (!Number.isSafeInteger(target.uid) || target.uid < 1 || target.uid > 4294967295) throw new MailOperationError('invalid_input', 'Invalid message UID');
    if (!/^\d+$/.test(target.uidValidity) || target.uidValidity !== uidValidity) throw new MailOperationError('stale_identity', 'Mailbox identity changed; search again before using this message');
  }
  private readAllowed(): void {if(this.access&&!this.access().read)throw new MailOperationError('forbidden','Mail access is disabled');}
  private writeAllowed(): void {
    if (this.access ? !this.access().read || !this.access().write : !this.policy.allowWrites) throw new MailOperationError('forbidden', 'This mail action is disabled by server configuration');
  }
  private async collect(download: MailDownload): Promise<Buffer> {
    const chunks: Uint8Array[] = []; let bytes = 0;
    for await (const chunk of download.chunks) {
      bytes += chunk.byteLength;
      if (bytes > this.policy.maxAttachmentBytes) { download.cancel(); throw new MailOperationError('invalid_input', 'Message exceeds the configured download limit'); }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  listMailboxes(): Promise<Mailbox[]> { this.readAllowed(); return this.gateway.withSession(session => session.list()); }
  async search(input: SearchRequest): Promise<SearchResult> {
    this.readAllowed();
    const limit = input.limit ?? Math.min(20, this.policy.maxMessages);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > Math.min(100, this.policy.maxMessages)) throw new MailOperationError('invalid_input', 'Invalid search limit');
    const query = input.query ?? '', unreadOnly = input.unreadOnly ?? false;
    if (query.length > 1000 || /[\r\n\0]/.test(query)) throw new MailOperationError('invalid_input', 'Invalid search query');
    return this.gateway.withSession(session => this.selected(session, input.mailbox, true, async lease => {
      const { uidValidity } = lease, cursor = input.cursor;
      if (cursor && (cursor.mailbox !== input.mailbox || cursor.uidValidity !== uidValidity || cursor.query !== query || cursor.unreadOnly !== unreadOnly)) throw new MailOperationError('stale_identity', 'Cursor does not match this mailbox or search');
      if (cursor && (!Number.isSafeInteger(cursor.beforeUid) || cursor.beforeUid < 1 || !Number.isSafeInteger(cursor.startingUpperUid) || cursor.startingUpperUid < cursor.beforeUid - 1 || cursor.startingUpperUid > 4294967295)) throw new MailOperationError('invalid_input', 'Invalid search cursor');
      const startingUpperUid = cursor?.startingUpperUid ?? Math.max(0, lease.uidNext - 1);
      const beforeUid = cursor?.beforeUid ?? startingUpperUid + 1;
      const found = beforeUid <= 1 ? [] : await session.search(query, { unreadOnly, beforeUid });
      const eligible = [...new Set(found)].filter(uid => uid > 0 && uid < beforeUid && uid <= startingUpperUid).sort((a, b) => b - a);
      const uids = eligible.slice(0, limit);
      const messages = uids.length ? await session.summaries(uids) : [];
      messages.sort((a, b) => b.uid - a.uid);
      const lastUid = uids.at(-1), truncated = eligible.length > limit;
      return { mailbox: input.mailbox, uidValidity, messages, truncated,
        ...(truncated && lastUid !== undefined ? { nextCursor: { mailbox: input.mailbox, uidValidity, beforeUid: lastUid, startingUpperUid, query, unreadOnly } } : {}) };
    }));
  }
  /** Internal bounded source access for application services; never an MCP operation. */
  fetchRaw(target: MailTarget): Promise<Uint8Array> {
    this.readAllowed();
    return this.gateway.withSession(session => this.selected(session, target.mailbox, true, async lease => {
      this.checkTarget(lease.uidValidity, target);
      const metadata = await session.metadata(target.uid);
      if (!metadata) throw new MailOperationError('missing', 'Message not found');
      if (metadata.size !== undefined && metadata.size > this.policy.maxAttachmentBytes) throw new MailOperationError('invalid_input', 'Message exceeds the configured download limit');
      return this.collect(await session.download(target.uid, undefined, this.policy.maxAttachmentBytes + 1));
    }));
  }
  async read(target: ReadRequest): Promise<ReadResult> {
    this.readAllowed();
    const mode = target.mode ?? 'full';
    if (mode !== 'summary' && mode !== 'full') throw new MailOperationError('invalid_input', 'Invalid read mode');
    return this.gateway.withSession(session => this.selected(session, target.mailbox, true, async lease => {
      this.checkTarget(lease.uidValidity, target);
      const metadata = await session.metadata(target.uid);
      if (!metadata) throw new MailOperationError('missing', 'Message not found');
      if (metadata.size !== undefined && metadata.size > this.policy.maxAttachmentBytes) throw new MailOperationError('invalid_input', 'Message exceeds the configured download limit');
      const download = await session.download(target.uid, undefined, this.policy.maxAttachmentBytes + 1);
      const parsed = await this.gateway.parse(await this.collect(download));
      const cap = mode === 'summary' ? Math.min(500, this.policy.maxBodyChars) : this.policy.maxBodyChars;
      const text = parsed.text.slice(0, cap);
      return { mailbox: target.mailbox, uid: target.uid, uidValidity: target.uidValidity, ...parsed, mode, text,
        truncated: parsed.text.length > cap, ...(mode === 'summary' ? { excerpt: text } : { attachments: metadata.attachments }) };
    }));
  }
  private async resolveAction(session: MailSession, lease: MailboxLease, action: BatchAction): Promise<Exclude<BatchAction, { type: 'organize' }>> {
    if (action.type === 'tag') {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(action.keyword)) throw new MailOperationError('invalid_input', 'Use a keyword of 1–64 letters, digits, dots, underscores or hyphens');
      // This lease came from a writable SELECT, independently of read-only search/read sessions.
      if (!lease.supportsKeywords && !lease.allowedKeywords?.includes(action.keyword)) throw new MailOperationError('unsupported_capability', 'Mailbox does not permit this custom keyword');
      return action;
    }
    if (action.type !== 'move' && action.type !== 'organize') return action;
    if (!session.supportsMove) throw new MailOperationError('unsupported_capability', 'Server does not support a safe message move strategy');
    const boxes = await session.list();
    let destination: string | undefined;
    if (action.type === 'move') destination = this.mailbox(action.destination);
    else if (action.action === 'restore') {
      if (!action.destination) throw new MailOperationError('invalid_input', 'Restore requires an explicit original destination');
      destination = this.mailbox(action.destination);
    } else {
      const specialUse = { trash: '\\Trash', archive: '\\Archive', junk: '\\Junk', not_junk: '\\Inbox' }[action.action];
      const matches = boxes.filter(box => box.selectable && (box.specialUse === specialUse || (action.action === 'not_junk' && box.path.toUpperCase() === 'INBOX')));
      if (matches.length > 1) throw new MailOperationError('ambiguous_destination', 'Multiple destination mailboxes match; select an explicit destination');
      destination = matches[0]?.path;
    }
    if (!destination || !boxes.some(box => box.path === destination && box.selectable)) throw new MailOperationError('missing', 'Requested destination mailbox was not found');
    return { type: 'move', destination };
  }
  private async perform(session: MailSession, target: MailTarget, action: Exclude<BatchAction, { type: 'organize' }>): Promise<MailMutationResult> {
    // Preflight awaits may outlive authorization. Check again at the dispatch boundary.
    this.writeAllowed();
    try {
      if (action.type === 'move') {
        const result = await session.move(target.uid, action.destination);
        if (!result) throw new MailOperationError('upstream_failure', 'Unable to move message');
        if (result.uid === undefined || result.uidValidity === undefined) throw new MailOperationError('outcome_unknown', 'Provider did not confirm the destination identity for this message');
        return { moved: true, destination: action.destination,
          destinationTarget: { mailbox: action.destination, uid: result.uid, uidValidity: result.uidValidity } };
      }
      const success = action.type === 'mark' ? await session.mark(target.uid, action.seen)
        : action.type === 'flag' ? await session.flag(target.uid, action.flagged)
          : await session.tag(target.uid, action.keyword, action.enabled);
      if (!success) throw new MailOperationError('outcome_unknown', 'Provider did not confirm the message update');
      let confirmed: MessageMetadata | undefined;
      try { confirmed = await session.metadata(target.uid); }
      catch { throw new MailOperationError('outcome_unknown', 'Message state could not be verified after the update'); }
      const expectedFlag = action.type === 'mark' ? '\\Seen' : action.type === 'flag' ? '\\Flagged' : action.keyword;
      const enabled = action.type === 'mark' ? action.seen : action.type === 'flag' ? action.flagged : action.enabled;
      if (!confirmed?.flags || confirmed.flags.includes(expectedFlag) !== enabled) throw new MailOperationError('outcome_unknown', 'Message state could not be verified after the update');
      return { updated: true };
    } catch (error: unknown) {
      if (error instanceof MailOperationError) throw error;
      throw new MailOperationError('outcome_unknown', 'The provider did not confirm the outcome; inspect the message before retrying');
    }
  }
  async batch(input: BatchRequest): Promise<MailBatchOutcome> {
    this.writeAllowed(); this.mailbox(input.mailbox);
    if (input.uids.length < 1 || input.uids.length > 50 || new Set(input.uids).size !== input.uids.length) throw new MailOperationError('invalid_input', 'Provide 1–50 distinct message UIDs');
    return this.gateway.withSession(session => this.selected(session, input.mailbox, false, async lease => {
      const targets = input.uids.map(uid => ({ mailbox: input.mailbox, uidValidity: input.uidValidity, uid }));
      for (const target of targets) this.checkTarget(lease.uidValidity, target);
      for (const target of targets) if (!await session.metadata(target.uid)) throw new MailOperationError('missing', 'A selected message was not found; no changes were attempted');
      const action = await this.resolveAction(session, lease, input.action);
      const items: MailItemOutcome[] = []; let unknown = false, stopped = false;
      for (const target of targets) {
        if (unknown || stopped) { items.push({ target, status: 'not_attempted' }); continue; }
        try {
          if (!await session.metadata(target.uid)) { items.push({ target, status: 'failed', code: 'missing' }); continue; }
          items.push({ target, status: 'succeeded', result: await this.perform(session, target, action) });
        }
        catch (error: unknown) {
          const code = error instanceof MailOperationError ? error.code : 'outcome_unknown';
          if (code === 'outcome_unknown') { unknown = true; items.push({ target, status: 'outcome_unknown', code,
            ...(error instanceof MailOperationError && error.recovery ? { recovery: error.recovery } : {}) }); }
          else { items.push({ target, status: 'failed', code }); if (code === 'forbidden') stopped = true; }
        }
      }
      const succeeded = items.filter(item => item.status === 'succeeded').length;
      return { status: unknown ? 'unknown' : succeeded === items.length ? 'completed' : succeeded ? 'partial' : 'rejected', items };
    }));
  }
  private async single(target: MailTarget, action: BatchAction): Promise<MailMutationResult> {
    const batch = await this.batch({ mailbox: target.mailbox, uidValidity: target.uidValidity, uids: [target.uid], action });
    const item = batch.items[0];
    if (item?.status === 'succeeded') return item.result;
    throw new MailOperationError(item?.status === 'failed' || item?.status === 'outcome_unknown' ? item.code : 'upstream_failure', 'Mail operation was not confirmed',
      item?.status === 'outcome_unknown' ? item.recovery : undefined);
  }
  async mark(target: MarkRequest): Promise<MarkResult> { await this.single(target, { type: 'mark', seen: target.seen }); return { ...target, updated: true }; }
  async flag(target: FlagRequest): Promise<FlagResult> { await this.single(target, { type: 'flag', flagged: target.flagged }); return { ...target, updated: true }; }
  async tag(target: TagRequest): Promise<TagResult> { await this.single(target, { type: 'tag', keyword: target.keyword, enabled: target.enabled }); return { ...target, updated: true }; }
  async move(target: MoveRequest): Promise<MoveResult> {
    const result = await this.single(target, { type: 'move', destination: target.destination });
    if ('moved' in result) return result;
    throw new MailOperationError('upstream_failure', 'Move result missing');
  }
  async organize(target: OrganizeRequest): Promise<MoveResult> {
    const result = await this.single(target, { type: 'organize', action: target.action, destination: target.destination });
    if ('moved' in result) return result;
    throw new MailOperationError('upstream_failure', 'Move result missing');
  }
}
