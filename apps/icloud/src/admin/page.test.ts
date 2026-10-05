import{test,expect}from'bun:test';
import {mailAdminPresentation} from '../mail/admin.js';
import{setupPage}from'./page.js';
import{i18n}from'../i18n/index.js';
test('tutorial emphasizes UI labels safely in both locales and conditions advanced settings on discovery',async()=>{
 try{
  for(const locale of ['en','zh-TW']){
   await i18n.changeLanguage(locale);
   const html=setupPage({presentation:mailAdminPresentation,enrolled:true,ready:true,admin:false,publicMcpUrl:'https://example.invalid/icloud/mcp?x=<script>'});
   for(const text of ['Authentication','OAuth','Advanced OAuth settings','Create as a plugin'])expect(html).toContain(`<strong>${text}</strong>`);
   expect(html).not.toContain('**');expect(html).not.toContain('x=<script>');expect(html).toContain('x=&lt;script&gt;');
   expect(html).toContain(locale==='en'?'Once automatic discovery succeeds':'自動探索成功後');
  }
 }finally{await i18n.changeLanguage('en');}
});

test('ChatGPT tutorial separates browser setup and developer mode before creation',()=>{
 const html=setupPage({presentation:mailAdminPresentation,enrolled:true,ready:true,admin:false});
 const headings=['1. Open ChatGPT in your browser','2. Enable developer mode','3. Create custom MCP server','4. Set up authentication','5. Create as a plugin','6. Authorize access','7. Try it'];
 let previous=-1;
 for(const heading of headings){const position=html.indexOf(heading);expect(position).toBeGreaterThan(previous);previous=position;}
 expect(html).toContain('desktop or mobile app');
 expect(html).toContain('<strong>Security and login</strong>');
});

test('enrolled administration presents per-account management without enrollment steps',()=>{
 const html=setupPage({presentation:mailAdminPresentation,enrolled:true,ready:true,admin:true});
 expect(html).toContain('Service capabilities');expect(html).toContain('id="policy-save"');
 expect(html).toContain('id="accounts"');expect(html).toContain('id="account"');expect(html).toContain('/icloud/setup?mode=account');expect(html).not.toContain('id="user"');expect(html).toContain('Existing OAuth grants remain unchanged');
 expect(html).not.toContain('data-step="0"');expect(html).not.toContain('id="register"');
 expect(html).not.toContain('name="password" value=');
 const setup=setupPage({presentation:mailAdminPresentation,enrolled:false,ready:false,admin:false});expect(setup).toContain('onboarding-layer');expect(setup).toContain('/icloud/assets/plugin-icon.png');
});

test('shared administration renders registered capability identifiers and escapes their labels',()=>{
 const html=setupPage({enrolled:true,ready:true,admin:true,presentation:{capabilities:[{id:'calendar.read',label:'Read <events>'}],credentialStepLabel:'credentialStatus',credentialSection:()=>'<section id="calendar-credential"></section>'}});
 expect(html).toContain('id="policy-input-calendar.read"');expect(html).toContain('Read &lt;events&gt;');expect(html).toContain('id="calendar-credential"');expect(html).not.toContain('id="policy-input-send"');
});

 test('setup adds credentials only in a separate owner-authorized account step',()=>{const html=setupPage({presentation:mailAdminPresentation,enrolled:false,ready:true,admin:false});expect(html.match(/data-progress=/g)).toHaveLength(4);expect(html).toContain('4 Connect client');expect(html).not.toContain('id="complete-owner"');expect(html.match(/data-step=/g)).toHaveLength(4);expect(html).toContain('id="account-add"');expect(html).toContain('id="account-password"');expect(html).not.toContain('id="credentials"');expect(html).not.toContain('type="password" value=');});

 test('Mail and Calendar share one save action with collapsed scope and maintenance details',()=>{const html=setupPage({presentation:mailAdminPresentation,enrolled:true,ready:true,admin:true,modules:[{id:'calendar',title:'Calendar',fields:[{id:'read',label:'Read calendars'}]}]});expect(html.match(/id="policy-save"/g)).toHaveLength(1);expect(html.match(/data-capability-all/g)).toHaveLength(2);expect(html.match(/data-copy="advancedScopes"/g)).toHaveLength(2);expect(html).toContain('<details id="account-maintenance">');expect(html).not.toContain('<details open');expect(html).not.toContain('data-module-save');expect(html.indexOf('id="policy-save"')).toBeLessThan(html.indexOf('id="account-maintenance"'));});


test('five destinations have current navigation and only their own management controls',()=>{
 for(const view of ['overview','accounts','connections','system','setup'] as const){
  const html=setupPage({presentation:mailAdminPresentation,enrolled:true,ready:true,admin:view!=='setup',view});
  for(const path of ['/','/icloud/admin/accounts','/icloud/admin/connections','/icloud/admin/system','/icloud/setup'])expect(html).toContain(`href="${path}"`);
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html).toContain('href="#page-content"');
  expect(html.includes('id="policy-save"')).toBe(view==='accounts');
  expect(html.includes('id="credentials"')).toBe(view==='accounts');
  expect(html.includes('id="readiness-results"')).toBe(view==='connections');
  expect(html.includes('id="overview-content"')).toBe(view==='overview');
  expect(html.includes('id="system-content"')).toBe(view==='system');
  expect(html.includes('id="register"')).toBe(view==='setup');
 }
});

test('status starts unknown and capability copy describes installation-wide policy',()=>{
 const overview=setupPage({enrolled:true,ready:true,admin:true,view:'overview'});
 expect(overview).toContain('Status not yet checked');expect(overview).toContain('id="overview-next"');expect(overview).not.toContain('Your iCloud connection is ready');
 const accounts=setupPage({enrolled:true,ready:true,admin:true,view:'accounts'});
 expect(accounts).toContain('entire installation');expect(accounts).toContain('not only the selected account');
 const system=setupPage({enrolled:true,ready:true,admin:true,view:'system'});
 expect(system).toContain('Unknown means');expect(system).toContain('id="system-refresh"');
});

test('account-only wizard exposes resume mode without embedding credentials',()=>{
 const html=setupPage({enrolled:true,ready:true,admin:false,view:'setup',mode:'account'});
 expect(html).toContain('data-mode="account"');expect(html).toContain('data-enrolled="true"');expect(html).toContain('autocomplete="new-password"');expect(html).toContain('Multi-account operation has not been verified');expect(html).not.toContain('name="password" value=');
});
