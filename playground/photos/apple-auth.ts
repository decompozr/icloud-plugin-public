import {checkedSession, type SavedSession} from './session-store';
import { ProbeError, type ProbeStage, type ProbeReason } from "./probe-diagnostics";
import { randomUUID } from 'node:crypto';
import { CookieJar } from 'tough-cookie';
import { AppleSrp, type AppleSrpChallenge } from './apple-srp.ts';

const AUTH = 'https://idmsa.apple.com/appleauth/auth';
const SETUP = 'https://setup.icloud.com/setup/ws/1';
const WIDGET = 'd39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d';
const MAX_RESPONSE = 8 * 1024 * 1024;
export class AppleAuthError extends ProbeError {
  constructor(code: ProbeReason, status?: number) {
    super(code, status);
    this.message = `Apple Photos request failed: ${code}${status === undefined ? "" : ` (HTTP ${status})`}`;
    this.name = 'AppleAuthError';
  }
}
export interface AuthenticatedAppleSession {
  dsid: string;
  clientId: string;
  webservices: Record<string, {url: string}>;
  request(url: string | URL, init?: RequestInit): Promise<Response>;
}
export interface AppleAuthOptions { fetch?: typeof fetch; timeoutMs?: number; }

function allowedUrl(input: string | URL): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new AppleAuthError('invalid_endpoint'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
      !(url.hostname === 'idmsa.apple.com' || url.hostname === 'setup.icloud.com' ||
        /^(?:p\d+-)?(?:ckdatabasews|sharedstreams)\.icloud\.com$/.test(url.hostname))) {
    throw new AppleAuthError('untrusted_endpoint');
  }
  return url;
}

/** Cookie/session custody; export only for the opt-in private session store. No raw secrets logged. */
export class AppleHttpSession {
  #cookies = new CookieJar();
  #fetch: typeof fetch;
  #timeout: number;
  #authHeaders = new Map<string, string>();
  constructor(options: AppleAuthOptions = {}) {
    this.#fetch = options.fetch ?? fetch;
    this.#timeout = options.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.#timeout) || this.#timeout < 1 || this.#timeout > 120_000) {
      throw new AppleAuthError('invalid_timeout');
    }
  }
  exportState() { return {cookies: this.#cookies.serializeSync(), headers: Object.fromEntries([...this.#authHeaders].filter(([key]) => key !== 'x-apple-i-rscd'))}; }
  restoreState(saved: SavedSession) { checkedSession(saved); try { this.#cookies = CookieJar.deserializeSync(saved.cookies as any); this.#authHeaders = new Map(Object.entries(saved.headers)); } catch { throw new AppleAuthError('session_cache_invalid'); } }
  authHeader(name: string): string | undefined { return this.#authHeaders.get(name.toLowerCase()); }

  async request(input: string | URL, init: RequestInit = {}): Promise<Response> {
    const url = allowedUrl(input);
    const controller = new AbortController();
    const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const operation = async () => {
      const headers = new Headers(init.headers);
      if (!headers.has('origin')) headers.set('origin', 'https://www.icloud.com');
      if (!headers.has('referer')) headers.set('referer', 'https://www.icloud.com/');
      if (!headers.has('user-agent')) headers.set('user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');
      headers.delete('cookie'); // Never accept a caller's unscoped cookies.
      const cookie = await this.#cookies.getCookieString(url.href);
      if (cookie) headers.set('cookie', cookie);
      const response = await this.#fetch(url.href, {...init, headers, redirect: 'manual', signal});
      if (signal.aborted) { void response.body?.cancel().catch(() => {}); throw new AppleAuthError('request_cancelled'); }
      if (response.status >= 300 && response.status < 400) throw new AppleAuthError('redirect_refused', response.status);
      if (Number(response.headers.get('content-length')) > MAX_RESPONSE) throw new AppleAuthError('response_too_large');
      for (const cookie of response.headers.getSetCookie()) {
        if (cookie.length > 16384) throw new AppleAuthError('invalid_cookie');
        await this.#cookies.setCookie(cookie, url.href, {ignoreError: true});
      }
      if (url.hostname === 'idmsa.apple.com' || url.hostname === 'setup.icloud.com') {
        for (const key of ['scnt', 'x-apple-id-session-id', 'x-apple-id-account-country',
          'x-apple-session-token', 'x-apple-twosv-trust-token', 'x-apple-i-rscd']) {
          const value = response.headers.get(key);
          if (value && value.length <= 16384) this.#authHeaders.set(key, value);
        }
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (response.body) {
        reader = response.body.getReader();
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_RESPONSE) throw new AppleAuthError('response_too_large');
          chunks.push(chunk.value);
        }
      }
      return new Response([204, 205, 304].includes(response.status) ? null : Buffer.concat(chunks), {
        status: response.status, headers: response.headers,
      });
    };
    try {
      return await Promise.race([operation(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new AppleAuthError('timeout')); }, this.#timeout);
      })]);
    } catch (error) {
      const wasAborted = signal.aborted;
      controller.abort();
      void reader?.cancel().catch(() => {});
      if (error instanceof AppleAuthError) throw error;
      throw new AppleAuthError(wasAborted ? 'request_cancelled' : 'transport_error');
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
}

/** Source-observed Apple SRP -> accountLogin -> trusted-device code/trust flow.
 * Single-use client with optional validated saved-session reuse; China endpoints deferred.
 */
export class AppleAuthClient {
  #session: AppleHttpSession;
  #used = false;
  clientId = `auth-${randomUUID()}`;
  constructor(options: AppleAuthOptions = {}) { this.#session = new AppleHttpSession(options); }

  exportSession(accountName: string, dsid: string): SavedSession { return checkedSession({version: 1, dsid, accountName, clientId: this.clientId, ...this.#session.exportState()}); }
  async resume(saved: SavedSession, onStage?: (stage: ProbeStage) => void): Promise<AuthenticatedAppleSession> {
    if (this.#used) throw new AppleAuthError('client_already_used');
    this.#used = true;
    checkedSession(saved); this.clientId = saved.clientId; this.#session.restoreState(saved);
    onStage?.('session-validation');
    const response = await this.#session.request(SETUP + '/validate', {method: 'POST', headers: {'Content-Type':'application/json'}, body:'null'});
    let account: Record<string, any>;
    if (response.ok) account = await this.#json(response);
    else if ([401,421].includes(response.status)) {
      try { account = await this.#accountLogin(); }
      catch (error) { if (error instanceof AppleAuthError && (error.code === 'missing_session_token' || error.code === 'account_login_rejected' && [401,421].includes(error.status!))) throw new AppleAuthError('session_expired'); throw error; }
    } else throw new AppleAuthError('account_login_rejected', response.status);
    if (account.hsaChallengeRequired === true || (Number(account.dsInfo?.hsaVersion) >= 1 && account.hsaTrustedBrowser !== true)) throw new AppleAuthError('session_expired');
    if (String(account.dsInfo?.dsid) !== saved.dsid) throw new AppleAuthError('session_account_mismatch');
    return this.#authenticated(account);
  }
  #authenticated(account: Record<string, any>): AuthenticatedAppleSession {
    if (account.domainToUse) throw new AppleAuthError('alternate_region_required');
    if (account.hasError || account.error || account.errorCode || account.serverErrorCode || account.errorMessage || account.errorReason) throw new AppleAuthError('account_login_rejected');
    const dsid = account.dsInfo?.dsid;
    if (!['string', 'number'].includes(typeof dsid) || !/^\d+$/.test(String(dsid)) || !account.webservices || typeof account.webservices !== 'object' || Array.isArray(account.webservices)) throw new AppleAuthError('missing_account_services');
    const webservices: Record<string, {url: string}> = Object.create(null);
    for (const [key, service] of Object.entries(account.webservices)) if (service && typeof service === 'object' && typeof (service as any).url === 'string') webservices[key] = {url: (service as any).url};
    return {dsid: String(dsid), clientId: this.clientId, webservices, request: (url, init) => this.#session.request(url, init)};
  }
  #headers(signin: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/javascript', 'Content-Type': 'application/json',
      Origin: signin ? 'https://idmsa.apple.com' : 'https://www.icloud.com',
      Referer: signin ? 'https://idmsa.apple.com/' : 'https://www.icloud.com/',
      'X-Apple-OAuth-Client-Id': WIDGET, 'X-Apple-OAuth-Client-Type': 'firstPartyAuth',
      'X-Apple-OAuth-Redirect-URI': 'https://www.icloud.com', 'X-Apple-OAuth-Require-Grant-Code': 'true',
      'X-Apple-OAuth-Response-Mode': 'web_message', 'X-Apple-OAuth-Response-Type': 'code',
      'X-Apple-OAuth-State': this.clientId, 'X-Apple-Widget-Key': WIDGET,
    };
    for (const key of ['scnt', 'x-apple-id-session-id']) {
      const value = this.#session.authHeader(key);
      if (value) headers[key] = value;
    }
    return headers;
  }

  async #auth(path: string, body?: unknown, accepted: number[] = [], push = false): Promise<Response> {
    const response = await this.#session.request(`${AUTH}${path}`, {
      method: push ? 'PUT' : body === undefined ? 'GET' : 'POST',
      headers: {...this.#headers(path.startsWith('/signin/')), ...(path === '/verify/trusteddevice/securitycode' ? {Accept: 'application/json'} : {})},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok && !accepted.includes(response.status)) throw new AppleAuthError('authentication_rejected', response.status);
    if (this.#session.authHeader('x-apple-i-rscd') === '401') throw new AppleAuthError('authentication_rejected', 401);
    if (response.ok && response.status !== 204) {
      const data = await response.clone().json().catch(() => null);
      if (data && typeof data === 'object' &&
          (data.hasError || data.error || data.errorCode || data.serverErrorCode ||
            data.errorMessage || data.errorReason || (Array.isArray(data.serviceErrors) && data.serviceErrors.length))) {
        throw new AppleAuthError('authentication_rejected', response.status);
      }
    }
    return response;
  }

  async #json(response: Response): Promise<Record<string, any>> {
    try {
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      return data;
    } catch { throw new AppleAuthError('invalid_response'); }
  }

  async #accountLogin(): Promise<Record<string, any>> {
    const token = this.#session.authHeader('x-apple-session-token');
    if (!token) throw new AppleAuthError('missing_session_token');
    const response = await this.#session.request(`${SETUP}/accountLogin`, {
      method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://www.icloud.com', Referer: 'https://www.icloud.com/'},
      body: JSON.stringify({accountCountryCode: this.#session.authHeader('x-apple-id-account-country'),
        dsWebAuthToken: token, extended_login: true, trustToken: this.#session.authHeader('x-apple-twosv-trust-token') ?? ''}),
    });
    if (!response.ok) throw new AppleAuthError('account_login_rejected', response.status);
    const data = await this.#json(response);
    if (data.domainToUse) throw new AppleAuthError('alternate_region_required');
    if (data.hasError || data.error || data.errorCode || data.serverErrorCode || data.errorMessage || data.errorReason) {
      throw new AppleAuthError('account_login_rejected');
    }
    return data;
  }

  async authenticate(input: {accountName: string; password: string; getCode?: () => Promise<string>; onStage?: (stage: ProbeStage) => void}): Promise<AuthenticatedAppleSession> {
    if (this.#used) throw new AppleAuthError('client_already_used');
    this.#used = true;
    let srp: AppleSrp;
    try { srp = await AppleSrp.create(input.accountName); }
    catch { throw new AppleAuthError('invalid_credentials_input'); }
    input.onStage?.("srp-init");
    const init = await this.#auth('/signin/init', {a: srp.publicKey, accountName: input.accountName, protocols: ['s2k', 's2k_fo']});
    const challenge = await this.#json(init);
    let proof: {m1: string; m2: string; c: string};
    try { proof = await srp.complete(input.password, challenge as AppleSrpChallenge); }
    catch { throw new AppleAuthError('invalid_srp_challenge'); }
    input.onStage?.("srp-complete");
    const complete = await this.#auth('/signin/complete?isRememberMeEnabled=true', {
      accountName: input.accountName, ...proof, rememberMe: true, trustTokens: [],
    }, [409, 412]);
    if (complete.status === 412) throw new AppleAuthError('account_repair_required', 412);
    input.onStage?.("account-login");
    let account = await this.#accountLogin();
    const needsCode = complete.status === 409 || account.hsaChallengeRequired === true ||
      (Number(account.dsInfo?.hsaVersion) >= 1 && account.hsaTrustedBrowser !== true);
    if (needsCode) {
      if (!input.getCode) throw new AppleAuthError('two_factor_required');
      if (Number(account.dsInfo?.hsaVersion) !== 2) throw new AppleAuthError('unsupported_two_step_auth');
      // Pinned icloudpd base.py trigger_push_notification: one bodyless PUT.
      // Request acceptance is not proof that a device displayed a notification.
      input.onStage?.("push-2fa");
      try { await this.#auth('/verify/trusteddevice/securitycode', undefined, [], true); }
      catch (error) {
        throw new AppleAuthError('two_factor_push_failed', error instanceof AppleAuthError ? error.status : undefined);
      }
      input.onStage?.("input-2fa");
      let code: string;
      try { code = await input.getCode(); } catch { throw new AppleAuthError('two_factor_cancelled'); }
      if (!/^\d{6}$/.test(code)) throw new AppleAuthError('invalid_two_factor_code');
      input.onStage?.("verify-2fa");
      await this.#auth('/verify/trusteddevice/securitycode', {securityCode: {code}});
      code = '';
      input.onStage?.("trust-session");
      await this.#auth('/2sv/trust');
      input.onStage?.("account-login-after-2fa");
      account = await this.#accountLogin();
      if (account.hsaChallengeRequired === true || account.hsaTrustedBrowser !== true) throw new AppleAuthError('session_not_trusted');
    }
    input.onStage?.("service-discovery");
    return this.#authenticated(account);
  }
}
