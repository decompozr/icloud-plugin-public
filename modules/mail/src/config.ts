import {z} from 'zod';
const https=z.string().url().refine(value=>{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&!url.search;},'HTTPS URL without credentials/query/fragment required');
const booleanString=z.enum(['true','false']).default('false').transform(value=>value==='true');
const environment=z.object({
 ICLOUD_USER:z.string().min(1),ICLOUD_APP_PASSWORD:z.string().min(1),
 MAIL_ALLOW_WRITES:booleanString,MAIL_ALLOW_SEND:booleanString,
 MCP_TRANSPORT:z.literal('http').default('http'),MCP_HOST:z.enum(['127.0.0.1','::1']).default('127.0.0.1'),
 MCP_PORT:z.coerce.number().int().min(1).max(65535).default(8787),
 MCP_PUBLIC_URL:https,MCP_OAUTH_ISSUER:https,MCP_OAUTH_AUDIENCE:z.string().min(1),MCP_OAUTH_JWKS_URL:https,
 MCP_OAUTH_SCOPES:z.string().default('mail.read').transform(value=>value.split(/\s+/).filter(Boolean)).refine(values=>values.includes('mail.read')&&values.every(value=>['mail.read','mail.write','mail.send'].includes(value))),
 MCP_OAUTH_ALLOWED_SUBJECTS:z.string().transform(value=>value.split(',').map(s=>s.trim()).filter(Boolean)).refine(values=>values.length>0)
});
export interface Config {
  readonly allowRead?:boolean; readonly allowUnsubscribe?:boolean;
 user:string;password:string;allowWrites:boolean;allowSend?:boolean;transport:'http';host:string;port:number;
 publicUrl:string;issuer:string;audience:string;jwksUrl:string;scopes:string[];allowedSubjects:string[];
}
export function readConfig(env:NodeJS.ProcessEnv=process.env):Config {
 const v=environment.parse(env);
 return {user:v.ICLOUD_USER,password:v.ICLOUD_APP_PASSWORD,allowWrites:v.MAIL_ALLOW_WRITES,allowSend:v.MAIL_ALLOW_SEND,transport:v.MCP_TRANSPORT,host:v.MCP_HOST,port:v.MCP_PORT,
 publicUrl:v.MCP_PUBLIC_URL.replace(/\/$/,''),issuer:v.MCP_OAUTH_ISSUER,audience:v.MCP_OAUTH_AUDIENCE,jwksUrl:v.MCP_OAUTH_JWKS_URL,scopes:v.MCP_OAUTH_SCOPES,allowedSubjects:v.MCP_OAUTH_ALLOWED_SUBJECTS};
}
