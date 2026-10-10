/** Final catalog adoption and module warning acceptance; disposable provider fixtures. */
import {join,resolve} from 'node:path';import {mkdir} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2),option=(key:string)=>args[args.indexOf(key)+1],output=option('--output');await mkdir(output,{recursive:true});
const {chromium}=await import(pathToFileURL(resolve(option('--playwright-module'))).href);const worker=Bun.spawn([process.execPath,join(import.meta.dir,'admin-fixture.worker.ts')],{stdout:'pipe',stderr:'pipe'});let browser:any,checks=0;const a=(okay:unknown,message:string)=>{if(!okay)throw Error(message);checks++};
try{
 const reader=worker.stdout.getReader(),first=await reader.read();reader.releaseLock();const origin=new TextDecoder().decode(first.value).trim();browser=await chromium.launch({headless:true,executablePath:option('--chrome')});
 for(const locale of ['en','zh-TW'])for(const width of [1280,390]){
  const context=await browser.newContext({extraHTTPHeaders:{'x-fixture-session':'owner'},viewport:{width,height:900},hasTouch:width===390,isMobile:width===390});await context.addCookies([{name:'PARAGLIDE_LOCALE',value:locale,url:origin}]);const page=await context.newPage(),errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));await page.goto(origin+'/icloud/admin');await page.locator('.status-dot').first().waitFor();
  const notice=page.getByTestId('photos-shared-write-unsupported');a(await notice.count()===1,'Exactly one registered notice');a(await notice.locator('..').getByRole('heading').count()===1,'Notice shares its module heading');a(await notice.getAttribute('role')==='note','Static warning');a(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overview wraps');await page.getByTestId('capabilities-card').screenshot({path:join(output,`capabilities-${locale}-${width}.png`)});
  await page.getByTestId('accounts-card').locator('header').getByRole('button').first().click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  a(await dialog.locator('.field[data-size=normal] #credential-account').count()===1,'Account select is pinned catalog');await dialog.locator('#credential-account').selectOption('');await dialog.locator('#credential-user').waitFor();
  a(await dialog.locator('label[data-size=normal][for=credential-user]').count()===1,'Email uses catalog FieldLabel');a(await dialog.locator('label[data-size=normal][for=credential-password]').count()===1,'Password uses catalog FieldLabel');a(await dialog.locator('#credential-password').inputValue()==='','Secret remains blank');
  a(await dialog.evaluate((el:HTMLElement)=>el.scrollWidth<=el.clientWidth),'Modal wraps');await dialog.screenshot({path:join(output,`credential-${locale}-${width}.png`)});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  a(errors.length===0,'No page errors');await context.close();
 }
 console.log(JSON.stringify({passed:true,checks,fixtureOnly:true}));await Bun.write(join(output,'result.json'),JSON.stringify({passed:true,checks,fixtureOnly:true},null,2));
}finally{await browser?.close();worker.kill();await worker.exited;}
