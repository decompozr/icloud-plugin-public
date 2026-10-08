import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { dkimSign } from 'mailauth/lib/dkim/sign.js';
import { dkimVerify } from 'mailauth/lib/dkim/verify.js';
import { createUnsubscribeGateway, postOneClick, publicAddress } from '../icloud/unsubscribe.js';
import { UnsubscribeService } from './unsubscribe.js';
const target = { mailbox: 'INBOX', uid: 1, uidValidity: '42' };
const raw = (headers: string) => Buffer.from(`From: sender@example.com\r\nTo: owner@example.net\r\nSubject: Newsletter\r\n${headers}\r\n\r\nHello\r\n`);
const sendMail = async (input: { to: string[] }) => ({ accepted: input.to, rejected: [], messageId: 'fixture' });

describe('unsubscribe', () => {
  test('real DKIM cryptography must cover both headers; tampering fails', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const source = raw('List-Unsubscribe: <https://example.com/remove>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click');
    const resolver = async () => [[`v=DKIM1; k=rsa; p=${publicKey.export({ type: 'spki', format: 'der' }).toString('base64')}`]];
    const sign = async (headerList: string[]) => {
      const result = await dkimSign(source, { signingDomain: 'example.com', selector: 'test',
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), headerList,
        signatureData: [{ signingDomain: 'example.com', selector: 'test', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) }] });
      expect(result.errors).toHaveLength(0);
      return Buffer.concat([Buffer.from(result.signatures), source]);
    };
    const gateway = createUnsubscribeGateway({ sendMail, verifyDkim: data => dkimVerify(Buffer.from(data), { resolver }) });
    const signed = await sign(['from', 'subject', 'list-unsubscribe', 'list-unsubscribe-post']);
    expect((await gateway.discover(signed)).entries[0]?.candidate.kind).toBe('oneclick');
    expect((await gateway.discover(Buffer.from(signed.toString().replace('/remove', '/evil')))).entries[0]?.candidate.kind).toBe('manual');
    expect((await gateway.discover(await sign(['from', 'list-unsubscribe']))).entries[0]?.candidate.kind).toBe('manual');
  });
  test('mailto derives only header address and decoded fields, no discovery network', async () => {
    let sends = 0;
    const gateway = createUnsubscribeGateway({ sendMail: async input => { sends++; expect(input).toEqual({ to: ['leave@example.com'], subject: 'Stop now', text: 'Please remove me' }); return sendMail(input); } });
    const service = new UnsubscribeService({ fetchRaw: async () => raw('List-Unsubscribe: <mailto:leave@example.com?subject=Stop%20now&body=Please%20remove%20me>') }, gateway, { enabled: true });
    const discovery = await service.discover(target);
    expect(sends).toBe(0);
    expect(await service.submit({ ...target, candidateId: discovery.candidates[0]!.candidateId })).toMatchObject({ status: 'submitted', confirmed: false });
    expect(sends).toBe(1);
  });
  test('rejects header injection, extra recipients and arbitrary query headers', async () => {
    const gateway = createUnsubscribeGateway({ sendMail });
    for (const address of ['a@example.com,b@example.com', 'a%0d%0a@example.com', 'a@example.com?subject=x%0d%0aBcc:x', 'a@example.com?to=x@example.com', 'a@example.com?subject=a&subject=b']) {
      expect((await gateway.discover(raw(`List-Unsubscribe: <mailto:${address}>`))).entries).toHaveLength(0);
    }
  });
  test('policy disabled and stale candidate never submit', async () => {
    let content = raw('List-Unsubscribe: <mailto:a@example.com>'); let calls = 0;
    const gateway = createUnsubscribeGateway({ sendMail: async input => { calls++; return sendMail(input); } });
    const source = { fetchRaw: async () => content };
    const service = new UnsubscribeService(source, gateway, { enabled: true });
    const id = (await service.discover(target)).candidates[0]!.candidateId;
    await expect(new UnsubscribeService(source, gateway).submit({ ...target, candidateId: id })).rejects.toMatchObject({ code: 'forbidden' });
    content = raw('List-Unsubscribe: <mailto:b@example.com>');
    await expect(service.submit({ ...target, candidateId: id })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(calls).toBe(0);
  });
  test('rejects duplicate headers and reports unknown mail submission without retry', async () => {
    let calls = 0;
    const gateway = createUnsubscribeGateway({ sendMail: async () => { calls++; throw Error('SMTP disconnected'); } });
    expect((await gateway.discover(raw('List-Unsubscribe: <mailto:a@example.com>\r\nList-Unsubscribe: <mailto:b@example.com>'))).entries).toHaveLength(0);
    await expect(gateway.submit({ kind: 'mailto', recipient: 'a@example.com', subject: '', body: '' })).rejects.toMatchObject({ code: 'outcome_unknown' });
    expect(calls).toBe(1);
  });
  test('production transport blocks nonpublic IPs before any request', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1']) expect(publicAddress(ip)).toBe(false);
    expect(publicAddress('8.8.8.8')).toBe(true);
    await expect(postOneClick(new URL('https://127.0.0.1/unsubscribe'))).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
