import {test,expect} from 'bun:test';
import {readConfig} from './config.js';
const env={ICLOUD_USER:'fixture@example.invalid',ICLOUD_APP_PASSWORD:'dummy',MCP_PUBLIC_URL:'https://mail.example.invalid/icloud/mcp',MCP_OAUTH_ISSUER:'https://issuer.example.invalid/',MCP_OAUTH_AUDIENCE:'https://mail.example.invalid/icloud/mcp',MCP_OAUTH_JWKS_URL:'https://issuer.example.invalid/keys',MCP_OAUTH_ALLOWED_SUBJECTS:'owner'};
test('HTTP only configuration preserves exact issuer and validates owner restriction',()=> {
 expect(readConfig(env).transport).toBe('http');expect(readConfig(env).issuer).toBe(env.MCP_OAUTH_ISSUER);
 expect(()=>readConfig({...env,MCP_TRANSPORT:'stdio'})).toThrow();
 expect(()=>readConfig({...env,MCP_OAUTH_ALLOWED_SUBJECTS:''})).toThrow();
 expect(()=>readConfig({...env,MCP_HOST:'0.0.0.0'})).toThrow();
});
