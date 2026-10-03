import express from 'express';
import {HttpLifecycle} from './lifecycle.js';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type {ModuleRuntime} from '../modules/runtime.js';
import type { Config } from '../config.js';
import type { Principal } from '../auth/verify.js';
import { createVerifier } from '../auth/verify.js';
import { createServer } from '../mcp/server.js';
export function createHttpApp(config: Config, runtime:ModuleRuntime, verify = createVerifier(config), lifecycle=new HttpLifecycle()):express.Express {
  const app = express();
  app.disable('x-powered-by');app.use(lifecycle.admission);
  const resource = config.publicUrl;
  const metadataPath = '/.well-known/oauth-protected-resource/icloud/mcp';
  const metadataUrl = `${new URL(resource).origin}${metadataPath}`;
  app.get(metadataPath, (_req,res)=>res.json({ resource, authorization_servers:[config.issuer], scopes_supported:runtime.allowedScopes, bearer_methods_supported:['header'] }));
  const principals=new WeakMap<express.Request,Principal>();
  app.use('/icloud/mcp', async (req,res,next)=> {
    // Requests may arrive only through the configured public host or the loopback proxy.
    const host = req.get('host')?.toLowerCase();
    const allowedHosts = [new URL(resource).host,`127.0.0.1:${config.port}`,`localhost:${config.port}`,`[::1]:${config.port}`];
    if (!host || !allowedHosts.includes(host)) { res.status(403).json({error:'Invalid host'}); return; }
    const origin = req.get('origin');
    if (origin && origin !== new URL(resource).origin) { res.status(403).json({error:'Invalid origin'}); return; }
    try { principals.set(req,await lifecycle.track(()=>verify(req.get('authorization')))); next(); }
    catch { res.set('WWW-Authenticate',`Bearer resource_metadata="${metadataUrl}", error="invalid_token"`).status(401).json({error:'A valid owner access token is required'}); }
  });
  app.post('/icloud/mcp',express.json({limit:'2mb'}), async (req,res)=> {
    const body:unknown=req.body;
    const parsed=JSONRPCMessageSchema.safeParse(body);
    if(!parsed.success){res.status(400).json({error:'Invalid MCP request'});return;}
    const principal=principals.get(req);
    if(!principal){res.status(401).end();return;}
    const server = createServer(runtime,config.publicUrl,principal.scopes,operation=>lifecycle.track(operation));
    const transport = new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=> { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req,res,parsed.data); }
    catch { if (!res.headersSent) res.status(500).json({error:'MCP request failed'}); }
  });
  app.all('/icloud/mcp',(_req,res)=>res.status(405).set('Allow','POST').end());
  return app;
}
