import { Client, Hash, Mode, Srp, util } from '@foxt/js-srp';
import { createHash, pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';

// Protocol reference: icloudpd 879c561240d993d748ddb4546f935090502b16d3
// src/pyicloud_ipd/base.py _authenticate_srp. The dependency's GSA mode implements
// RFC5054 padding and omits the username only from x, retaining it in M1.
const derive = promisify(pbkdf2);
const srp = new Srp(Mode.GSA, Hash.SHA256, 2048);
export interface AppleSrpChallenge {
  protocol: 's2k' | 's2k_fo'; salt: string; iteration: number; b: string; c: string;
}

function decode(value: unknown, max: number): Buffer {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid SRP challenge');
  }
  const result = Buffer.from(value, 'base64');
  if (!result.length || result.length > max) throw new Error('Invalid SRP challenge');
  return result;
}

/** One-use, in-memory SRP handshake. Never serialize this object or its proofs. */
export class AppleSrp {
  #client: Client;
  #used = false;
  private constructor(client: Client) { this.#client = client; }

  static async create(accountName: string, privateValueForTest?: bigint): Promise<AppleSrp> {
    if (!accountName || Buffer.byteLength(accountName) > 1024) throw new Error('Invalid account name');
    if (privateValueForTest !== undefined && privateValueForTest <= 0n) throw new Error('Invalid SRP private value');
    return new AppleSrp(await srp.newClient(Buffer.from(accountName), new Uint8Array(), privateValueForTest));
  }

  get publicKey(): string { return Buffer.from(util.bytesFromBigint(this.#client.A)).toString('base64'); }

  async complete(password: string, challenge: AppleSrpChallenge): Promise<{m1: string; m2: string; c: string}> {
    if (this.#used) throw new Error('SRP handshake already consumed');
    this.#used = true;
    if (!challenge || !['s2k', 's2k_fo'].includes(challenge.protocol) ||
        !Number.isSafeInteger(challenge.iteration) || challenge.iteration < 1 || challenge.iteration > 1_000_000 ||
        typeof challenge.c !== 'string' || !challenge.c || challenge.c.length > 16384 ||
        typeof password !== 'string' || !password || Buffer.byteLength(password) > 16384) {
      throw new Error('Invalid SRP challenge or password');
    }
    const salt = decode(challenge.salt, 1024);
    const b = decode(challenge.b, 256);
    const bn = util.bigintFromBytes(b);
    if (bn <= 0n || bn >= srp.pf.N) throw new Error('Invalid SRP server public key');
    const digest = createHash('sha256').update(password, 'utf8').digest();
    const input = challenge.protocol === 's2k_fo' ? Buffer.from(digest.toString('hex'), 'utf8') : digest;
    let derived: Buffer | undefined;
    try {
      derived = await derive(input, salt, challenge.iteration, 32, 'sha256');
      this.#client.p = derived;
      const m1 = Buffer.from(await this.#client.generate(salt, b), 'hex').toString('base64');
      const m2 = Buffer.from(await this.#client.generateM2()).toString('base64');
      return {m1, m2, c: challenge.c};
    } finally {
      derived?.fill(0); input.fill(0); digest.fill(0);
      this.#client.K.fill(0); this.#client.M.fill(0);
    }
  }
}
