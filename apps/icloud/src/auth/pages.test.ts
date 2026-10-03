import {test,expect} from 'bun:test';
import {signedOAuthQuery} from './browser.js';
import {renderAuthPage} from './pages.js';
test('signed continuation filters page parameters and preserves repeated resource parameters',()=>{
 const query=signedOAuthQuery('?client_id=c&resource=a&resource=b&ba_param=client_id&ba_param=resource&sig=s&theme=dark');
 const parsed=new URLSearchParams(query);
 expect(parsed.getAll('resource')).toEqual(['a','b']);
 expect(parsed.get('client_id')).toBe('c');
 expect(parsed.has('theme')).toBe(false);
 expect(()=>signedOAuthQuery('?client_id=c')).toThrow();
});
test('public auth pages load a local typed browser bundle without inline ceremony code',()=>{
 for(const mode of ['sign-in','consent'] as const){const html=renderAuthPage(mode);expect(html).toContain('/icloud/assets/auth-browser.js');expect(html).toContain('aria-live="polite"');expect(html).not.toContain('navigator.credentials');}
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
 for(const html of [setup,renderAuthPage('sign-in')])expect(html).toContain('data-ui-icon="passkey" aria-hidden="true"');
 expect(renderAuthPage('consent')).toContain('class="secondary" type="button" data-auth-deny');
});

 test('shared visual tokens have concrete values without circular references',async()=>{
 const {pageStyles}=await import('../ui/page.js');
 expect(pageStyles).toContain('--ui-background:#f3f6f8');
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
