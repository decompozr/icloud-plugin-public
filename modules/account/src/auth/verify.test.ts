import {test,expect} from 'bun:test';
import {generateKeyPair,SignJWT} from 'jose';
import {createVerifier} from './verify.js';
test('identity verification accepts a calendar-only grant without granting mail access',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('ES256');
 const config={transport:'http' as const,host:'127.0.0.1',port:0,publicUrl:'https://example.invalid/mcp',issuer:'https://example.invalid',audience:'https://example.invalid/mcp',jwksUrl:'https://example.invalid/jwks',scopes:['calendar.read'],allowedSubjects:['owner']};
 const verify=createVerifier(config,async()=>publicKey);
 const token=await new SignJWT({scope:'calendar.read'}).setProtectedHeader({alg:'ES256'}).setSubject('owner').setIssuer(config.issuer).setAudience(config.audience).setIssuedAt().setExpirationTime('1h').sign(privateKey);
 const principal=await verify('Bearer '+token);expect(principal.subject).toBe('owner');expect(principal.scopes.has('calendar.read')).toBe(true);expect(principal.scopes.has('mail.read')).toBe(false);
 await expect(verify()).rejects.toThrow('Bearer token required');
});
