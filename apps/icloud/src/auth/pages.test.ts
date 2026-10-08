import {test,expect} from 'bun:test';
import {signedOAuthQuery,connectionCredential} from './browser.js';
import {renderAuthPage} from './pages.js';
test('signed continuation filters page parameters and preserves repeated resource parameters',()=>{
 const query=signedOAuthQuery('?client_id=c&resource=a&resource=b&ba_param=client_id&ba_param=resource&sig=s&theme=dark');
 const parsed=new URLSearchParams(query);
 expect(parsed.getAll('resource')).toEqual(['a','b']);
 expect(parsed.get('client_id')).toBe('c');
 expect(parsed.has('theme')).toBe(false);
 expect(()=>signedOAuthQuery('?client_id=c')).toThrow();
});
test('snapshot auth pages contain accessible inert markup without inline ceremony code',()=>{
 for(const mode of ['sign-in','consent'] as const){const html=renderAuthPage(mode);expect(html).not.toContain('/icloud/assets/auth-browser.js');expect(html).not.toContain('data-auth-status');expect(html).not.toContain('navigator.credentials');}
});
test('private owner login returns to administration while public login has no admin destination',()=>{
 expect(renderAuthPage('sign-in',true)).toContain('data-auth-return="/icloud/admin"');
 expect(renderAuthPage('sign-in')).toContain('data-auth-return=""');
});

test('auth copy uses shared i18next English default and missing-locale fallback', async()=>{
 const {i18n}=await import('../i18n/index.js');
 const {authT,authEnglish}=await import('./i18n.js');
 expect(i18n.language).toBe('en');
 expect(renderAuthPage('sign-in')).toContain('Sign in with your passkey');
 expect(renderAuthPage('consent')).toContain('Allow connection');
 try {
  await i18n.changeLanguage('fr');
  expect(authT('actionFailed')).toBe(authEnglish.actionFailed);
  expect(renderAuthPage('consent')).toContain(authEnglish.headingConsent);
 }finally{await i18n.changeLanguage('en');}
 expect(Object.values(authEnglish).some(text=>/[\u3400-\u9fff]/u.test(text))).toBe(false);
});

test('resumed owner enrollment does not create another passkey', async()=>{
 const {registerOwner}=await import('./browser.js');
 const original=globalThis.fetch;
 const paths:string[]=[];
 globalThis.fetch=Object.assign(async(input:string|URL|Request)=>{
  paths.push(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  return Response.json({ready:true,passkeyRegistered:true});
 },{preconnect:original.preconnect});
 try{await registerOwner();expect(paths).toEqual(['/icloud/setup/begin']);}
 finally{globalThis.fetch=original;}
});

test('setup and authentication share styles, branding and accessible Passkey icon',async()=>{
 const {setupPage}=await import('../admin/page.js');
 const {pageStyles}=await import('../ui/page.js');
 const setup=setupPage({enrolled:false,ready:false,admin:false});
 for(const html of [setup,renderAuthPage('sign-in'),renderAuthPage('consent')]){
  expect(html).toContain(`<style>${pageStyles}</style>`);
  expect(html).toContain('data-ui-icon="brand" aria-hidden="true"');
  expect(html).not.toContain('#1749c9');
 }
 expect(renderAuthPage('sign-in')).toContain('data-ui-icon="passkey" aria-hidden="true"');
 const denial=renderAuthPage('consent').match(/<button\b[^>]*data-auth-deny[^>]*>/)?.[0] ?? '';
 expect(denial).toContain('type="button"');
 expect(denial).toContain('data-dz-action');
 expect(denial).toContain('aria-label="Deny"');
 expect(denial).toContain('--bg: var(--dz-color-surface, #FFFFFF)');
});

 test('shared visual tokens have concrete values without circular references',async()=>{
 const {pageStyles}=await import('../ui/page.js');
 expect(pageStyles).toContain('--ui-background:#FFFFFF');
 for(const [,name,value] of pageStyles.matchAll(/(--ui-[a-z-]+):([^;]+);/g))expect(value).not.toContain(`var(${name})`);
 });

test('send consent is explicit in both supported locales',async()=>{
 const {i18n}=await import('../i18n/index.js');
 const {authT}=await import('./i18n.js');
 try{
  expect(authT('scopeSend')).toBe('Send new messages and replies from your iCloud mailbox');
  await i18n.changeLanguage('zh-TW');
  expect(authT('scopeSend')).toBe('從你的 iCloud 信箱寄送新郵件及回覆');
 }finally{await i18n.changeLanguage('en');}
});

 test('registered consent labels escape HTML attribute injection and accept non-mail scopes',()=>{
 const html=renderAuthPage('consent',false,{'calendar.read':'Read events \"<private>','calendar.write':'Update calendar'});
 expect(html).toContain('calendar.read');expect(html).toContain('&lt;private&gt;');expect(html).not.toContain('<private>');
 });

test('registered Mail consent labels retain locale and unknown-module fallback through rendered metadata',async()=>{
 const {i18n}=await import('../i18n/index.js');
 const {mailScopeDescriptions}=await import('@decompozr/mail/server/consent.js');
 const {consentScopeLabel}=await import('./scope-labels.js');
 try{
  await i18n.changeLanguage('zh-TW');
  const html=renderAuthPage('consent',false,{...mailScopeDescriptions,'calendar.read':{default:'Read calendar'}});
  expect(html).toContain('<html lang="zh-TW">');
  const attribute=html.match(/data-auth-scope-labels="([^"]*)"/)![1]!;
  const labels=JSON.parse(attribute.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&'));
  expect(consentScopeLabel(labels,'mail.send')).toBe('從你的 iCloud 信箱寄送新郵件及回覆');
  expect(consentScopeLabel(labels,'mail.read')).toBe('讀取及搜尋郵件');
  expect(consentScopeLabel(labels,'calendar.read')).toBe('Read calendar');
  expect(consentScopeLabel(labels,'calendar.write')).toBe('calendar.write');
  expect(consentScopeLabel(labels,'mail.send','fr')).toBe('Send new messages and replies from your iCloud mailbox');
 }finally{await i18n.changeLanguage('en');}
});

 test('native account connection collects transient secrets and consent identifies selected account',async()=>{
 const {i18n}=await import('../i18n/index.js');
 try{for(const locale of ['en','zh-TW']){await i18n.changeLanguage(locale);const html=renderAuthPage('connect');expect(html).toContain('data-connect-accounts');expect(html).toContain('data-connect-add');expect(html).not.toContain('data-connect-form');expect(html).not.toContain('name="appPassword" value=');expect(html).toContain('data-auth-deny');expect(renderAuthPage('consent')).toContain('data-auth-account');}}
 finally{await i18n.changeLanguage('en');}
 });

test('adding an account with no optional name omits the label and preserves transient password',()=>{
 const data=new FormData();data.set('user','first@icloud.com');data.set('appPassword','transient');data.set('label','   ');
 expect(connectionCredential(data)).toEqual({user:'first@icloud.com',appPassword:'transient'});
 data.set('label',' Work ');expect(connectionCredential(data).label).toBe('Work');
});

 test('saved-account recovery explicitly requires a fresh native connection in both locales',async()=>{
 const {authT}=await import('./i18n.js');const {i18n}=await import('../i18n/index.js');
 try{for(const locale of ['en','zh-TW']){await i18n.changeLanguage(locale);expect(authT('savedReconnect')).toContain('Connect another account');expect(authT('connectionExpired')).toContain('Connect another account');}}
 finally{await i18n.changeLanguage('en');}
 });

test('account display deduplicates email labels and retains distinct names',async()=>{
 const {accountDisplay}=await import('./browser.js');
 expect(accountDisplay({label:' Owner@icloud.com ',user:'owner@icloud.com'})).toEqual({primary:'owner@icloud.com'});
 expect(accountDisplay({label:'Personal',user:'owner@icloud.com'})).toEqual({primary:'Personal',secondary:'owner@icloud.com'});
 expect(accountDisplay({label:' ',user:'owner@icloud.com'})).toEqual({primary:'owner@icloud.com'});
 const html=renderAuthPage('consent');expect(html).toContain('Authorize iCloud access');expect(html).toContain('data-auth-client-id');expect(html).not.toContain('Authorize mailbox access');
});

 test('Photos consent distinguishes local library and groups only explicitly requested permissions',async()=>{
 const {consentPermissionGroups}=await import('./browser.js');
 const {authT}=await import('./i18n.js');
 const {i18n}=await import('../i18n/index.js');
 try{
  for(const locale of ['en','zh-TW']){
   await i18n.changeLanguage(locale);
   const groups=consentPermissionGroups(['mail.read','photos.read','photos.delete','offline_access']);
   expect(groups.map(group=>group.scopes)).toEqual([['mail.read'],['photos.read','photos.delete'],['offline_access']]);
   expect(groups[1]!.title).toBe(authT('permissionPhotos'));
   expect(groups.flatMap(group=>group.scopes)).not.toContain('photos.write');
   expect(renderAuthPage('consent')).toMatch(/data-auth-photos-library(?:="")? hidden(?:="")?/);
   expect(renderAuthPage('consent')).toContain(authT('photosLibrary'));
   expect(authT('scopePhotosDelete')).not.toBe('photos.delete');
  }
 }finally{await i18n.changeLanguage('en');}
 });
