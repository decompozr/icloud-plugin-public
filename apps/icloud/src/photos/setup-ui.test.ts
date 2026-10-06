import {test,expect} from 'bun:test';
import {createPrivateAdmin} from '../admin/handler.js';
import {setupPage} from '../admin/page.js';
import {privacyLinks,photosSetupSection} from './setup-ui.js';
import type {OwnerSecretStore} from '../storage/owner-store.js';
test('Photos onboarding starts with honest checking steps and a single recovery shortcut',()=>{
 const html=photosSetupSection();
 expect(html.match(/data-step-state="checking"/g)).toHaveLength(2);
 expect(html).toContain('Read Photos');expect(html).toContain('Organize Photos');
 expect(html).toContain('Need help?');expect(html).toContain('id="photos-recheck"');
 expect(html).not.toContain('Tailscale');expect(html).not.toContain('1. Read your library');
 expect(html.match(/id="photos-recheck"/g)).toHaveLength(1);
});
test('settings launcher requires owner, matching origin, JSON and a fixed action allowlist',async()=>{
 let opened=0,checked=0;
 const handler=createPrivateAdmin({privateOrigin:'https://host.test',store:{ownerId:()=> 'owner'} as OwnerSecretStore,ownerAuth:{ownerSession:async headers=>{if(headers.get('x-session')!=='owner')throw Error();return {user:{id:'owner'}};},enrollmentSession:async()=>{throw Error();}},diagnostics:async()=>({installed:true,authenticated:true,online:true,privateReachable:true}),validateCredential:async()=>{},photosSetup:{status:async()=>{checked++;return {ready:false};},action:async()=>{opened++;return {opened:true,ready:false};}}});
 const action=(body:unknown,origin='https://host.test',session='owner')=>handler(new Request('https://host.test/icloud/admin/photos/action',{method:'POST',headers:{origin,'x-session':session,'content-type':'application/json'},body:JSON.stringify(body)}));
 expect((await action({action:'photos'},'https://attacker.test')).status).toBe(403);
 expect((await action({action:'photos'},'https://host.test','other')).status).toBe(403);
 expect((await action({action:'file:///tmp/arbitrary'})).status).toBe(400);
 expect((await action({action:'photos',url:'evil'})).status).toBe(400);
 expect(opened).toBe(0);
 const status=await handler(new Request('https://host.test/icloud/admin/photos/status',{headers:{'x-session':'owner'}}));expect(status.status).toBe(200);expect(checked).toBe(1);expect(opened).toBe(0);
 expect((await action({action:'photos'})).status).toBe(200);expect(opened).toBe(1);
});
