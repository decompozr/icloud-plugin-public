import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Config } from '../config.js';
export interface Principal { scopes: Set<string>; subject: string; accountId?: string; clientId?:string; expiresAt?:number }
export function createVerifier(config: Config, key: JWTVerifyGetKey = createRemoteJWKSet(new URL(config.jwksUrl))) {
  return async (authorization?: string): Promise<Principal> => {
    const match = /^Bearer ([^\s]+)$/i.exec(authorization ?? '');
    if (!match) throw new Error('Bearer token required');
    const { payload } = await jwtVerify(match[1]!, key, { issuer: config.issuer, audience: config.audience, algorithms: ['RS256','ES256'], requiredClaims: ['exp','iat','sub'] });
    if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.scope !== 'string') throw new Error('Invalid token claims');
    if (!config.allowedSubjects.includes(payload.sub)) throw new Error('Unauthorized subject');
    const scopes = new Set(payload.scope.split(' ').filter(Boolean));
    return { subject: payload.sub, scopes };
  };
}
