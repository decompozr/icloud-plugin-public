import { simpleParser } from 'mailparser';
import { dkimVerify } from 'mailauth/lib/dkim/verify.js';
import type { DKIMVerifyResult } from 'mailauth';
import { lookup } from 'node:dns/promises';
import { request, type RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { LookupAddress } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { MailOperationError, type MailMessageInput, type SendResult } from '../domain/mail.js';
import type { DerivedUnsubscribe, UnsubscribeAction, UnsubscribeGateway } from '../domain/unsubscribe.js';

export type DkimVerifier = (raw: Uint8Array) => Promise<DKIMVerifyResult>;
export type UnsubscribePost = (url: URL) => Promise<void>;
const invalid = (message: string) => new MailOperationError('invalid_input', message);
const unknown = () => new MailOperationError('outcome_unknown', 'Submission was not confirmed; do not automatically retry');
async function bounded<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(invalid('Unsubscribe operation timed out')), ms);
  })]); } finally { if (timer) clearTimeout(timer); }
}
export function publicAddress(address: string): boolean {
  try { return ipaddr.parse(address).range() === 'unicast'; } catch { return false; }
}
function httpsUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') || value.length > 4096) throw invalid('Unsupported unsubscribe HTTPS destination');
  return url;
}
export interface OneClickTransport {
  resolve(hostname: string): Promise<LookupAddress[]>;
  request(url: URL, options: RequestOptions, response: (response: IncomingMessage) => void): ClientRequest;
}
/** Trusted infrastructure injection only. The same policy runs with fixture and production IO. */
export function createOneClickPost(transport: OneClickTransport = {
  resolve: hostname => lookup(hostname, { all: true }), request,
}): UnsubscribePost {
  return async url => {
  httpsUrl(url.href);
  const answers = await bounded(transport.resolve(url.hostname.replace(/^\[|\]$/g, '')), 5000);
  if (!answers.length || answers.some(answer => !publicAddress(answer.address))) throw invalid('Unsubscribe destination must use public internet addresses');
  const pinned = answers[0]!;
  await new Promise<void>((resolve, reject) => {
    const body = 'List-Unsubscribe=One-Click';
    const req = transport.request(url, { method: 'POST', agent: false, headers: {
      'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body),
    }, lookup: (_host, options, callback) => {
      if (typeof options === 'object' && options.all) callback(null, [pinned]);
      else callback(null, pinned.address, pinned.family);
    } }, response => {
      let bytes = 0;
      response.on('data', chunk => { bytes += chunk.length; if (bytes > 65536) { reject(unknown()); req.destroy(); } });
      response.on('error', () => reject(unknown()));
      response.on('end', () => response.statusCode && response.statusCode >= 200 && response.statusCode < 300 ? resolve() : reject(unknown()));
    });
    const timer = setTimeout(() => req.destroy(unknown()), 10000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', () => reject(unknown()));
    req.end(body);
  });
  };
}
/** One HTTPS POST, no redirects, cookies, authorization or pooled sockets. DNS answer is pinned. */
export const postOneClick = createOneClickPost();
function mailto(value: string): UnsubscribeAction {
  const url = new URL(value);
  if (url.hash || url.host) throw invalid('Invalid mailto destination');
  const recipient = decodeURIComponent(url.pathname);
  if (!/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(recipient) || recipient.length > 254) throw invalid('Invalid unsubscribe recipient');
  const fields = [...url.searchParams.keys()];
  if (fields.some(key => !['subject', 'body'].includes(key)) || new Set(fields).size !== fields.length) throw invalid('Unsupported mailto fields');
  const subject = url.searchParams.get('subject') ?? '';
  const body = url.searchParams.get('body') ?? '';
  if (/[\r\n\0]/.test(subject) || /\0/.test(body) || subject.length > 998 || body.length > 10000) throw invalid('Invalid unsubscribe mail content');
  return { kind: 'mailto', recipient, subject, body };
}
export function createUnsubscribeGateway(options: {
  sendMail: (input: MailMessageInput) => Promise<SendResult>;
  verifyDkim?: DkimVerifier;
  /** Trusted composition/test seam only; never derived from tool inputs. */
  post?: UnsubscribePost;
}): UnsubscribeGateway {
  const verify = options.verifyDkim ?? (raw => dkimVerify(Buffer.from(raw)));
  return {
    async discover(raw) {
      const parsed = await simpleParser(Buffer.from(raw), { skipHtmlToText: true, skipTextToHtml: true });
      const header = (key: string) => parsed.headerLines.filter(line => line.key === key).map(line => line.line.slice(line.line.indexOf(':') + 1).replace(/\r?\n[ \t]+/g, ' ').trim());
      const lists = header('list-unsubscribe'); const posts = header('list-unsubscribe-post');
      const entries: DerivedUnsubscribe[] = []; const unsupportedReasons: string[] = [];
      if (lists.length !== 1 || posts.length > 1) return { entries, unsupportedReasons: ['Missing or duplicate unsubscribe headers'] };
      const list = lists[0]!;
      const values = [...list.matchAll(/<([^<>]+)>/g)].map(match => match[1]!);
      if (!values.length || values.length > 10 || list.replace(/<[^<>]+>/g, '').replace(/[\s,]/g, '')) return { entries, unsupportedReasons: ['Malformed unsubscribe header'] };
      let oneclick = false;
      if (posts[0]?.toLowerCase() === 'list-unsubscribe=one-click') {
        try {
          const result = await bounded(verify(raw), 10000);
          oneclick = result.results.some(result => result.status.result === 'pass' &&
            ['list-unsubscribe', 'list-unsubscribe-post'].every(key => result.signingHeaders?.headers.some(line => line.slice(0, line.indexOf(':')).toLowerCase() === key)));
        } catch { unsupportedReasons.push('DKIM verification unavailable'); }
      }
      for (const value of new Set(values)) {
        try {
          if (/^mailto:/i.test(value)) {
            const action = mailto(value);
            entries.push({ candidate: { kind: 'mailto', destination: value }, action });
          } else if (/^https:/i.test(value)) {
            const url = httpsUrl(value);
            if (oneclick) entries.push({ candidate: { kind: 'oneclick', destination: url.href }, action: { kind: 'oneclick', url: url.href } });
            else entries.push({ candidate: { kind: 'manual', destination: url.href, reason: 'Requires manual handling: no verified DKIM covering both one-click headers' } });
          } else unsupportedReasons.push('Unsupported unsubscribe scheme');
        } catch { unsupportedReasons.push('Invalid unsubscribe destination'); }
      }
      return { entries, unsupportedReasons };
    },
    async submit(action) {
      if (action.kind === 'oneclick') return (options.post ?? postOneClick)(httpsUrl(action.url));
      // Revalidate even trusted derived actions at the adapter boundary.
      const validated = mailto(`mailto:${action.recipient}?subject=${encodeURIComponent(action.subject)}&body=${encodeURIComponent(action.body)}`);
      if (validated.kind !== 'mailto') throw invalid('Invalid unsubscribe action');
      try {
        const sent = await bounded(options.sendMail({ to: [validated.recipient], subject: validated.subject, text: validated.body }), 15000);
        if (sent.rejected.length || !sent.accepted.includes(validated.recipient)) throw unknown();
      } catch { throw unknown(); }
    },
  };
}
