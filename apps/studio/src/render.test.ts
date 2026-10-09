import {test,expect} from 'bun:test';
import {renderAdmin,renderAuth,renderCredential,renderPhotosSetup,renderPhotosCloud,pageStyles,type UiCopy} from '../dist/index.js';
const copy:UiCopy={t:key=>key,richText:key=>[{text:key,strong:false}],authT:key=>key};
test('Studio renders all private destinations with isolated controls',()=>{
 for(const view of ['overview','accounts','connections','system','setup'] as const){
  const html=renderAdmin({enrolled:true,ready:true,admin:view!=='setup',view},copy,pageStyles,'en');
  expect(html).toContain('data-ui-framework="svelte"');
  expect(html.match(/aria-current="page"/g)??[]).toHaveLength(view==='setup'?0:1);
  expect(html.includes('data-testid="capabilities-card"')).toBe(view==='overview'||view==='setup');
  expect(html).not.toContain('data-step=');expect(html).not.toContain('id="result"');
  expect(html.includes('id="connections-list"')).toBe(view==='connections');
  expect(html.includes('id="system-content"')).toBe(view==='system');
 }
});
test('untrusted presentation values remain text and cannot inject handlers or elements',()=>{
 const attack='"><img src=x onerror="alert(1)">';
 const html=renderAdmin({enrolled:true,ready:true,admin:true,view:'overview',modules:[{id:attack,title:attack,fields:[{id:attack,label:attack}]}]},copy,'','en');
 expect(html).not.toContain('<img');expect(html).not.toMatch(/<[^>]*\bonerror\s*=/);
 const auth=renderAuth('consent',false,{'photos.read':attack},copy,'','zh-TW');
 expect(auth).toContain('<html lang="zh-TW">');expect(auth).not.toContain('<img');
 expect(auth).toContain('data-auth-return=""');
});
test('transient credential forms render empty and auth does not inherit a private return target',()=>{
 for(const mode of ['connect','consent','sign-in'] as const){
  const html=renderAuth(mode,false,{},copy,'','en');
  expect(html).not.toContain('value="password"');expect(html).toContain('data-auth-return=""');
 }
 const html=renderCredential(true,copy);expect(html).toContain('id="password"');expect(html).toMatch(/id="password"[^>]*value=""/);expect(html).not.toContain('value="fixture-secret"');
});
test('Photos setup modules remain inert until existing controllers attach',()=>{
 const local=renderPhotosSetup(),cloud=renderPhotosCloud();
 expect(local).toContain('data-step-state="checking"');expect(cloud).toContain('id="photos-cloud-login-fields" disabled');
 for(const html of [local,cloud]){expect(html).not.toContain('<script');expect(html).not.toContain('onclick=');}
});
test('renderer requests do not share mutable presentation context',()=>{
 const first=renderAuth('sign-in',false,{}, {...copy,authT:key=>'first '+key},'','en');
 const second=renderAuth('sign-in',false,{}, {...copy,authT:key=>'second '+key},'','en');
 expect(first).toContain('first headingSignIn');expect(second).toContain('second headingSignIn');expect(second).not.toContain('first headingSignIn');
});
test('Home linking is not mounted in the global System page',()=>{const html=renderAdmin({enrolled:true,ready:true,admin:true,view:'system',homekitConfigured:true,modules:[{id:'homekit',title:'Apple Home',fields:[{id:'read',label:'Read'}]}]},copy,pageStyles,'en');expect(html).toContain('id="system-content"');expect(html).not.toContain('data-testid="homekit-setup"');});

test('application actions expose names and icons, with visible text for decisions',()=>{
 const pages = [
  ...(['overview','accounts','connections','system','setup'] as const).map(view => renderAdmin({enrolled:true,ready:true,admin:view!=='setup',view,resetAvailable:true},copy,pageStyles,'en')),
  ...(['connect','consent','sign-in'] as const).map(mode => renderAuth(mode,false,{},copy,pageStyles,'en')),
  renderCredential(true,copy),renderCredential(false,copy),renderPhotosSetup(),renderPhotosCloud(),
 ];
 for(const html of pages){
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  expect(buttons.length).toBeGreaterThan(0);
  for(const [,attributes,body] of buttons){
   expect(attributes).toMatch(/aria-label="[^"]+"/);
   expect(body).toContain('<svg');
   const text=body.replace(/<[^>]*>/g,'').trim();
   if(attributes.includes('dz-labeled-action') || (attributes.includes('aria-haspopup="menu"') && !attributes.includes('icon-only'))) expect(text.length).toBeGreaterThan(0);
   else {expect(text).toBe('');if(attributes.includes('dz-icon-action')) {expect(attributes).toContain('data-touch-appearance="default"');expect(attributes).toContain('data-size="normal"');};}
  }
 }
});
