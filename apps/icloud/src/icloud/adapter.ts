import { MailOperationError } from '../domain/mail.js';
import { ImapFlow, type MessageStructureObject } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type {
  AppendedMessage, AttachmentMetadata, MailDownload, MailGateway, MailMessageInput,
  MailSession, MailSelectionOptions, Mailbox, MailboxLease, MessageMetadata, MessageSummary, ParsedMessage, ProviderMove, ProviderSearch, SendResult,
} from '../domain/mail.js';

export interface ICloudCredentials { user: string; password: string }
/** Explicit test seam; production configuration never changes the fixed TLS endpoint. */
export interface ICloudAdapterDependencies { createClient?: () => ImapFlow }

function providerError(error: unknown): MailOperationError {
  return error instanceof MailOperationError ? error
    : new MailOperationError('upstream_failure', 'The mail provider operation failed');
}

function mutationError(error: unknown): MailOperationError {
  if (error instanceof MailOperationError) return error;
  if (typeof error === 'object' && error !== null && 'responseStatus' in error
      && (error.responseStatus === 'NO' || error.responseStatus === 'BAD')) {
    return new MailOperationError('upstream_failure', 'Provider rejected the mail update');
  }
  return new MailOperationError('outcome_unknown', 'Provider did not confirm the mail update');
}

function isoDate(value: Date | undefined): string | undefined {
  return value && Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
}
function attachments(node: MessageStructureObject | undefined): AttachmentMetadata[] {
  if (!node) return [];
  const result: AttachmentMetadata[] = [];
  const filename = node.dispositionParameters?.filename ?? node.parameters?.name;
  if (node.part && (node.disposition === 'attachment' || filename)) {
    result.push({ partId: node.part, filename, contentType: node.type, size: node.size });
  }
  for (const child of node.childNodes ?? []) result.push(...attachments(child));
  return result;
}

/** SDK boundary: normalize false unions, sets, bigints, dates and streams here. */
class ICloudSession implements MailSession {
  constructor(private readonly client: ImapFlow) {}
  get supportsMove(): boolean {
    return this.client.capabilities.has('MOVE') || (this.client.capabilities.has('UIDPLUS') && 'exec' in this.client && typeof this.client.exec === 'function');
  }
  async list(): Promise<Mailbox[]> {
    return (await this.client.list()).map(box => ({
      path: box.path, name: box.name, specialUse: box.specialUse, selectable: !box.flags.has('\\Noselect'),
    }));
  }
  async select(mailbox: string, options: MailSelectionOptions = {}): Promise<MailboxLease> {
    const lock = await this.client.getMailboxLock(mailbox, { readOnly: options.readOnly ?? true });
    const selected = this.client.mailbox;
    if (!selected) { lock.release(); throw new MailOperationError('upstream_failure', 'Mailbox selection failed'); }
    return { uidValidity: selected.uidValidity.toString(), uidNext: selected.uidNext,
      supportsKeywords: !selected.readOnly && (selected.permanentFlags?.has('\\*') ?? false),
      allowedKeywords: selected.readOnly ? [] : [...(selected.permanentFlags ?? [])].filter(flag => !flag.startsWith('\\')), release: () => lock.release() };
  }
  async search(query?: string, options: ProviderSearch = {}): Promise<number[]> {
    if (options.beforeUid !== undefined && options.beforeUid <= 1) return [];
    const result = await this.client.search({ ...(query ? { text: query } : { all: true }),
      ...(options.unreadOnly ? { seen: false } : {}),
      ...(options.beforeUid !== undefined ? { uid: `1:${options.beforeUid - 1}` } : {}) }, { uid: true });
    if (result === false) throw new MailOperationError('upstream_failure', 'Provider did not complete the mail search');
    return result;
  }
  async summaries(uids: number[]): Promise<MessageSummary[]> {
    if (!uids.length) return [];
    const messages: MessageSummary[] = [];
    for await (const item of this.client.fetch(uids.join(','), { uid: true, envelope: true, flags: true, size: true }, { uid: true })) {
      messages.push({ uid: item.uid, subject: item.envelope?.subject,
        from: (item.envelope?.from ?? []).map(address => ({ name: address.name, address: address.address })),
        date: isoDate(item.envelope?.date), flags: [...(item.flags ?? [])], size: item.size });
    }
    return messages;
  }
  async headers(uid:number,maxBytes:number):Promise<Uint8Array|undefined> {
    const result=await this.client.fetchOne(uid,{bodyParts:[{key:'HEADER',start:0,maxLength:maxBytes}]},{uid:true});
    return result ? result.headers : undefined;
  }
  async metadata(uid: number): Promise<MessageMetadata | undefined> {
    const item = await this.client.fetchOne(uid, { size: true, flags: true, bodyStructure: true }, { uid: true });
    if (!item) return undefined;
    return { size: item.size, flags: item.flags ? [...item.flags] : undefined, attachments: attachments(item.bodyStructure) };
  }
  async download(uid: number, partId: string | undefined, maxBytes: number): Promise<MailDownload> {
    const downloaded = await this.client.download(uid, partId, { uid: true, maxBytes });
    const source: AsyncIterable<unknown> = downloaded.content;
    async function* chunks(): AsyncIterable<Uint8Array> {
      for await (const chunk of source) {
        if (!(chunk instanceof Uint8Array)) throw new MailOperationError('upstream_failure', 'Invalid mail download data');
        yield chunk;
      }
    }
    return { filename: downloaded.meta.filename, contentType: downloaded.meta.contentType,
      chunks: chunks(), cancel: () => downloaded.content.destroy() };
  }
  private async store(uid: number, flag: string, enabled: boolean): Promise<boolean> {
    try { return enabled ? await this.client.messageFlagsAdd(uid, [flag], { uid: true })
      : await this.client.messageFlagsRemove(uid, [flag], { uid: true }); }
    catch (error: unknown) { throw mutationError(error); }
  }
  mark(uid: number, seen: boolean): Promise<boolean> { return this.store(uid, '\\Seen', seen); }
  flag(uid: number, flagged: boolean): Promise<boolean> { return this.store(uid, '\\Flagged', flagged); }
  tag(uid: number, keyword: string, enabled: boolean): Promise<boolean> { return this.store(uid, keyword, enabled); }
  /** The SDK exposes exec at runtime but omits it from declarations. Narrow and validate
   * this one command rather than widening the SDK type or using its unsafe fallback. */
  private async expungeExactUid(uid: number): Promise<void> {
    if (!Number.isSafeInteger(uid) || uid < 1 || uid > 4294967295 || !this.client.capabilities.has('UIDPLUS')) throw new MailOperationError('unsupported_capability', 'Exact UID expunge unavailable');
    const client = this.client;
    if (!('exec' in client) || typeof client.exec !== 'function') throw new MailOperationError('unsupported_capability', 'Exact UID expunge unavailable');
    const result: unknown = await client.exec('UID EXPUNGE', [{ type: 'SEQUENCE', value: String(uid) }]);
    if (typeof result !== 'object' || result === null || !('next' in result) || typeof result.next !== 'function') throw new MailOperationError('outcome_unknown', 'Invalid exact UID expunge response');
    try {
      if (!('response' in result) || typeof result.response !== 'object' || result.response === null
        || !('command' in result.response) || result.response.command !== 'OK') throw new MailOperationError('outcome_unknown', 'Exact UID expunge was not confirmed');
    } finally { result.next(); }
  }
  async move(uid: number, destination: string): Promise<ProviderMove | false> {
    if (!this.supportsMove) throw new MailOperationError('unsupported_capability', 'Server does not support safe message moves');
    if (!Number.isSafeInteger(uid) || uid < 1 || uid > 4294967295) throw new MailOperationError('invalid_input', 'Invalid message UID');
    if (this.client.capabilities.has('MOVE')) {
      try {
        const result = await this.client.messageMove(uid, destination, { uid: true });
        // SDK false conflates an explicit refusal with a lost completion response.
        if (!result) throw new MailOperationError('outcome_unknown', 'Native MOVE outcome was not confirmed');
        const mappedUid = result.uidMap?.get(uid);
        return mappedUid !== undefined && result.uidValidity !== undefined
          ? { uid: mappedUid, uidValidity: result.uidValidity.toString() } : {};
      } catch { throw new MailOperationError('outcome_unknown', 'Native MOVE outcome was not confirmed'); }
    }
    // Never call messageMove without MOVE: its fallback ignores deletion failures.
    // Never call messageDelete: it ignores STORE failures and can issue global EXPUNGE.
    try {
      const copied = await this.client.messageCopy(uid, destination, { uid: true });
      const destinationUid = copied && copied.uidMap?.get(uid);
      if (!copied || copied.uidMap?.size !== 1 || !destinationUid || !Number.isSafeInteger(destinationUid)
        || destinationUid < 1 || destinationUid > 4294967295 || copied.uidValidity === undefined || copied.uidValidity <= 0n || copied.uidValidity > 4294967295n) {
        throw new MailOperationError('outcome_unknown', 'COPY destination identity was not confirmed');
      }
      if (!await this.client.messageFlagsAdd(uid, ['\\Deleted'], { uid: true })) throw new MailOperationError('outcome_unknown', 'Source deletion flag was not confirmed');
      const flagged = await this.client.fetchOne(uid, { flags: true }, { uid: true });
      if (!flagged || flagged.uid !== uid || !flagged.flags?.has('\\Deleted')) throw new MailOperationError('outcome_unknown', 'Source deletion flag could not be verified');
      await this.expungeExactUid(uid);
      const remaining = await this.client.fetchOne(uid, { uid: true }, { uid: true });
      if (remaining || !this.client.usable || !this.client.mailbox) throw new MailOperationError('outcome_unknown', 'Source removal could not be verified');
      return { uid: destinationUid, uidValidity: copied.uidValidity.toString() };
    } catch {
      // COPY may already exist at the destination. Never retry or undo blindly.
      throw new MailOperationError('outcome_unknown', 'Safe move completion was not confirmed; inspect source and destination before retrying');
    }
  }
  async append(mailbox: string, source: Uint8Array): Promise<AppendedMessage | undefined> {
    const result = await this.client.append(mailbox, Buffer.from(source), ['\\Draft']);
    if (!result) return undefined;
    return { uid: result.uid, uidValidity: result.uidValidity?.toString() };
  }
}

/** Draft provider implementation; fixed iCloud TLS endpoints, no sensitive logging. */
export class ICloudMailAdapter implements MailGateway {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly credentials: ICloudCredentials, private readonly dependencies: ICloudAdapterDependencies = {}) {}
  withSession<T>(run: (session: MailSession) => Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      const client = this.dependencies.createClient?.() ?? new ImapFlow({ host: 'imap.mail.me.com', port: 993, secure: true,
        auth: { user: this.credentials.user, pass: this.credentials.password }, logger: false,
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
        tls: { rejectUnauthorized: true } });
      try { await client.connect(); return await run(new ICloudSession(client)); }
      catch (error: unknown) { throw providerError(error); }
      finally { try { await client.logout(); } catch { client.close(); } }
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  async parse(source: Uint8Array): Promise<ParsedMessage> {
    let parsed: ParsedMail;
    try { parsed = await simpleParser(Buffer.from(source), { skipTextToHtml: true }); }
    catch (error: unknown) { throw providerError(error); }
    const recipients = parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : [];
    return { subject: parsed.subject, from: parsed.from?.text,
      to: recipients.flatMap(group => group.value.map(address => ({ name: address.name, address: address.address }))),
      date: isoDate(parsed.date), text: parsed.text ?? '' };
  }
  private message(input: MailMessageInput) {
    const email = /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/;
    if (!email.test(this.credentials.user)) throw new MailOperationError('invalid_input', 'Invalid sender address');
    return { from: this.credentials.user, to: input.to, subject: input.subject, text: input.text };
  }
  async compose(input: MailMessageInput): Promise<Uint8Array> {
    try { return await new MailComposer(this.message(input)).compile().build(); }
    catch (error: unknown) { throw providerError(error); }
  }
  async send(input: MailMessageInput): Promise<SendResult> {
    const options: SMTPTransport.Options = { host: 'smtp.mail.me.com', port: 587, secure: false, requireTLS: true,
      auth: { user: this.credentials.user, pass: this.credentials.password }, tls: { rejectUnauthorized: true },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000, logger: false, debug: false };
    const transport = nodemailer.createTransport(options);
    try {
      const result = await transport.sendMail(this.message(input));
      return { messageId: result.messageId,
        accepted: result.accepted.map(address => typeof address === 'string' ? address : address.address),
        rejected: result.rejected.map(address => typeof address === 'string' ? address : address.address) };
    } catch (error: unknown) { throw providerError(error); }
    finally { transport.close(); }
  }
}
