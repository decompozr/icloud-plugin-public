import { ImapFlow } from 'imapflow';
import nodemailer, { type Transporter } from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { MailOperationError } from '../domain/mail.js';

import { outboundMessageSchema, normalizedAddress, type OutboundMessage, type OutboundGateway } from '../domain/outbound.js';
import { z } from 'zod';
const rejectedEnvelope = z.object({ code: z.literal('EENVELOPE'), command: z.literal('RCPT TO'), responseCode: z.number().int().min(400).max(599), rejected: z.array(z.string()),
  rejectedErrors: z.array(z.object({ command: z.literal('RCPT TO'), responseCode: z.number().int().min(400).max(599) })) });
type OutboundReceipt = Awaited<ReturnType<OutboundGateway['send']>>;
type DraftReceipt = Awaited<ReturnType<OutboundGateway['draft']>>;
export interface OutboundDependencies {
  createSmtp?: () => Transporter<SMTPTransport.SentMessageInfo>;
  createImap?: () => ImapFlow;
}
export class ICloudOutboundAdapter implements OutboundGateway {
  constructor(private readonly credentials: { user: string; password: string }, private readonly dependencies: OutboundDependencies = {}) {}
  private message(input: OutboundMessage) {
    const parsed = outboundMessageSchema.safeParse(input);
    const sender = outboundMessageSchema.safeParse({ ...input, to: [this.credentials.user] });
    if (!parsed.success || !sender.success) throw new MailOperationError('invalid_input', 'Invalid outbound message');
    return { from: this.credentials.user, to: input.to, subject: input.subject, text: input.text,
      html: input.html, attachments: input.attachments?.map(a=>({filename:a.filename,contentType:a.contentType,content:Buffer.from(a.contentBase64,'base64')})),
      messageId: input.messageId, inReplyTo: input.inReplyTo, references: input.references,
      disableFileAccess: true, disableUrlAccess: true };
  }
  async send(input: OutboundMessage): Promise<OutboundReceipt> {
    const message = this.message(input);
    const options: SMTPTransport.Options = { host: 'smtp.mail.me.com', port: 587, secure: false, requireTLS: true,
      auth: { user: this.credentials.user, pass: this.credentials.password }, tls: { rejectUnauthorized: true },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000, logger: false, debug: false };
    const transport = this.dependencies.createSmtp?.() ?? nodemailer.createTransport(options);
    try {
      const receipt = await transport.sendMail(message);
      return { messageId: receipt.messageId,
        accepted: receipt.accepted.map(value => typeof value === 'string' ? value : value.address),
        rejected: receipt.rejected.map(value => typeof value === 'string' ? value : value.address) };
    } catch (error: unknown) {
      const rejected = rejectedEnvelope.safeParse(error);
      if (rejected.success && rejected.data.rejected.length === input.to.length && rejected.data.rejectedErrors.length === input.to.length
        && new Set(rejected.data.rejected.map(normalizedAddress)).size === input.to.length
        && input.to.every(address => rejected.data.rejected.map(normalizedAddress).includes(normalizedAddress(address)))) {
        return { messageId: input.messageId, accepted: [], rejected: rejected.data.rejected };
      }
      throw new MailOperationError('outcome_unknown', 'SMTP acceptance was not confirmed; inspect before retrying');
    } finally { transport.close(); }
  }
  async compose(input: OutboundMessage): Promise<Uint8Array> { return new MailComposer(this.message(input)).compile().build(); }
  async draft(input: OutboundMessage, mailbox: string): Promise<DraftReceipt> {
    if (!mailbox || mailbox.length > 1024 || /[\r\n\0]/.test(mailbox)) throw new MailOperationError('invalid_input', 'Invalid draft mailbox');
    const source = await new MailComposer(this.message(input)).compile().build();
    const client = this.dependencies.createImap?.() ?? new ImapFlow({ host: 'imap.mail.me.com', port: 993, secure: true,
      auth: { user: this.credentials.user, pass: this.credentials.password }, tls: { rejectUnauthorized: true }, logger: false,
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
    let appending = false;
    try {
      await client.connect(); appending = true;
      const result = await client.append(mailbox, source, ['\\Draft']);
      if (!result || result.uid === undefined || !Number.isSafeInteger(result.uid) || result.uid < 1 || result.uid > 4294967295
        || result.uidValidity === undefined || result.uidValidity <= 0n || result.uidValidity > 4294967295n) throw new MailOperationError('outcome_unknown', 'Draft identity was not confirmed');
      return { mailbox, uid: result.uid, uidValidity: result.uidValidity.toString(), messageId: input.messageId };
    } catch {
      throw new MailOperationError(appending ? 'outcome_unknown' : 'upstream_failure', appending ? 'Draft outcome was not confirmed; inspect before retrying' : 'Draft connection failed before submission');
    } finally { try { await client.logout(); } catch { client.close(); } }
  }
}
