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
 expect(html).toContain('Connection overview');expect(html).toContain('id="policy-save"');
 expect(html).toContain('id="accounts"');expect(html).toContain('id="account"');expect(html).toContain('Connect another account');expect(html).not.toContain('id="user"');expect(html).toContain('Existing OAuth grants remain unchanged');
 expect(html).not.toContain('data-step="0"');expect(html).not.toContain('id="register"');
 expect(html).not.toContain('name="password" value=');
 const setup=setupPage({presentation:mailAdminPresentation,enrolled:false,ready:false,admin:false});expect(setup).toContain('onboarding-layer');expect(setup).toContain('/icloud/assets/plugin-icon.png');
});

test('shared administration renders registered capability identifiers and escapes their labels',()=>{
 const html=setupPage({enrolled:true,ready:true,admin:true,presentation:{capabilities:[{id:'calendar.read',label:'Read <events>'}],credentialStepLabel:'credentialStatus',credentialSection:()=>'<section id="calendar-credential"></section>'}});
 expect(html).toContain('id="policy-input-calendar.read"');expect(html).toContain('Read &lt;events&gt;');expect(html).toContain('id="calendar-credential"');expect(html).not.toContain('id="policy-input-send"');
});

 test('initial setup finishes owner enrollment without collecting iCloud secrets',()=>{const html=setupPage({presentation:mailAdminPresentation,enrolled:false,ready:true,admin:false});expect(html.match(/data-progress=/g)).toHaveLength(3);expect(html).toContain('3 Connect ChatGPT');expect(html).not.toContain('id="complete-owner"');expect(html.match(/data-step=/g)).toHaveLength(3);expect(html).not.toContain('id="password"');expect(html).not.toContain('id="credentials"');expect(html).toContain('Connect another account');});

 test('Mail and Calendar share one save action with collapsed scope and maintenance details',()=>{const html=setupPage({presentation:mailAdminPresentation,enrolled:true,ready:true,admin:true,modules:[{id:'calendar',title:'Calendar',fields:[{id:'read',label:'Read calendars'}]}]});expect(html.match(/id="policy-save"/g)).toHaveLength(1);expect(html.match(/data-capability-all/g)).toHaveLength(2);expect(html.match(/data-copy="advancedScopes"/g)).toHaveLength(2);expect(html).toContain('<details id="account-maintenance">');expect(html).not.toContain('<details open');expect(html).not.toContain('data-module-save');expect(html.indexOf('id="policy-save"')).toBeLessThan(html.indexOf('id="account-maintenance"'));});
