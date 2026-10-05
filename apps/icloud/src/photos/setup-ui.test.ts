import {test,expect} from 'bun:test';
import {createPrivateAdmin} from '../admin/handler.js';
import {setupPage} from '../admin/page.js';
import {privacyLinks} from './setup-ui.js';
import type {OwnerSecretStore} from '../storage/owner-store.js';
test('configured Photos onboarding provides native shortcuts, remote Mac guidance and a recheck',()=>{
 const html=setupPage({enrolled:true,ready:true,admin:true,photosConfigured:true});
 expect(html).toContain(privacyLinks.photos);expect(html).toContain(privacyLinks.files);expect(html).toContain(privacyLinks.automation);
 expect(html).toContain('data-photos-action="authorize"');expect(html).toContain('id="photos-recheck"');expect(html).toContain('service Mac');expect(html).toContain('aria-live="polite"');
 expect(html.indexOf('1. Read your library')).toBeLessThan(html.indexOf('2. Allow Photos access'));
 expect(html.indexOf('2. Allow Photos access')).toBeLessThan(html.indexOf('3. Verify permissions'));
 expect(html.match(/id="photos-recheck"/g)).toHaveLength(1);
 expect(setupPage({enrolled:false,ready:true,admin:false,photosConfigured:true})).toContain('id="photos-onboarding" hidden');
 expect(setupPage({enrolled:true,ready:true,admin:true})).not.toContain('id="photos-setup"');
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
