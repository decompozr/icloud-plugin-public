import{test,expect}from'bun:test';
import{setupPage}from'./page.js';
import{i18n}from'../i18n/index.js';
test('tutorial emphasizes UI labels safely in both locales and conditions advanced settings on discovery',async()=>{
 try{
  for(const locale of ['en','zh-TW']){
   await i18n.changeLanguage(locale);
   const html=setupPage({enrolled:true,ready:true,admin:false,publicMcpUrl:'https://example.invalid/icloud/mcp?x=<script>'});
   for(const text of ['Authentication','OAuth','Advanced OAuth settings','Create as a plugin'])expect(html).toContain(`<strong>${text}</strong>`);
   expect(html).not.toContain('**');expect(html).not.toContain('x=<script>');expect(html).toContain('x=&lt;script&gt;');
   expect(html).toContain(locale==='en'?'Once automatic discovery succeeds':'自動探索成功後');
  }
 }finally{await i18n.changeLanguage('en');}
});

test('ChatGPT tutorial separates browser setup and developer mode before creation',()=>{
 const html=setupPage({enrolled:true,ready:true,admin:false});
 const headings=['1. Open ChatGPT in your browser','2. Enable developer mode','3. Create custom MCP server','4. Set up authentication','5. Create as a plugin','6. Authorize access','7. Try it'];
 let previous=-1;
 for(const heading of headings){const position=html.indexOf(heading);expect(position).toBeGreaterThan(previous);previous=position;}
 expect(html).toContain('desktop or mobile app');
 expect(html).toContain('<strong>Security and login</strong>');
});

test('enrolled administration presents one-account management without enrollment steps',()=>{
 const html=setupPage({enrolled:true,ready:true,admin:true});
 expect(html).toContain('Connection overview');expect(html).toContain('id="policy-save"');
 expect(html).toContain('does not add another account');expect(html).toContain('Existing OAuth grants remain unchanged');
 expect(html).not.toContain('data-step="0"');expect(html).not.toContain('id="register"');
 expect(html).not.toContain('name="password" value=');
 const setup=setupPage({enrolled:false,ready:false,admin:false});expect(setup).toContain('onboarding-layer');expect(setup).toContain('/icloud/assets/plugin-icon.png');
});
