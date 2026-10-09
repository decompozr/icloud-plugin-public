/** Bundled disabled-module and late-readiness checks; fixture-only, no native I/O. */
import{join,resolve}from'node:path';import{pathToFileURL}from'node:url';
const args=process.argv.slice(2),option=(key:string)=>args[args.indexOf(key)+1];
const{chromium}=await import(pathToFileURL(resolve(option('--playwright-module'))).href);
const worker=Bun.spawn([process.execPath,join(import.meta.dir,'admin-fixture.worker.ts')],{stdout:'pipe',stderr:'pipe'});let browser:any;
try{
 const reader=worker.stdout.getReader(),first=await reader.read();reader.releaseLock();const origin=new TextDecoder().decode(first.value).trim();
 browser=await chromium.launch({headless:true,executablePath:option('--chrome')});const context=await browser.newContext({extraHTTPHeaders:{'x-fixture-session':'owner'},viewport:{width:390,height:844}}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
 await page.goto(origin+'/icloud/admin');await page.getByTestId('capabilities-card').locator('.module-summary').first().waitFor();
 for(const name of ['Configure Mail','Configure Calendar','Configure Photos','Configure Apple Home'])if(await page.getByRole('button',{name,exact:true}).count()!==1)throw Error('Disabled bundled UI missing: '+name);
 let finishPhotos!:()=>void;const pendingPhotos=new Promise<void>(r=>finishPhotos=r);let photoRequests=0;
 await page.route('**/icloud/admin/photos/status',async(route:any)=>{photoRequests++;await pendingPhotos;await route.fulfill({json:{libraryReadable:true,libraryStatus:'ready',authorization:'authorized',ready:true}})});
 let finishHome!:()=>void;const pendingHome=new Promise<void>(r=>finishHome=r);
 await page.route('**/icloud/admin/homekit/status',async(route:any)=>{await pendingHome;await route.fulfill({json:{helper:{ready:true,authorized:true,localUserId:501,sourceSHA256:'a'.repeat(64)},homes:[],bindings:[]}})});
 await page.getByRole('button',{name:'Configure Photos',exact:true}).click();const photos=page.getByRole('dialog',{name:'Photos Settings',exact:true});await photos.waitFor();await photos.locator('[data-step-state="checking"]').first().waitFor();
 await photos.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Configure Apple Home',exact:true}).click();const home=page.getByRole('dialog',{name:'Apple Home Settings',exact:true});await home.waitFor();await home.locator('#scope-homekit-read').locator('..').click();
 const confirmation=home.getByRole('button',{name:'Save capabilities',exact:true});if(!await confirmation.isDisabled())throw Error('Unlinked Home requirement unexpectedly ready');
 finishPhotos();await page.waitForTimeout(350);if(!await confirmation.isDisabled())throw Error('Late Photos response changed Home readiness');
 if(!await home.getByRole('button',{name:'Save capabilities',exact:true}).isDisabled())throw Error('Late response enabled module save');
 finishHome();await page.waitForTimeout(150);if(errors.length)throw Error(errors.join(';'));if(!photoRequests)throw Error('Race not exercised');
 const client=resolve(import.meta.dir,'../../icloud/dist/studio/client');let inspected=0;
 for await(const path of new Bun.Glob('**/*.js').scan(client)){const text=await Bun.file(join(client,path)).text();if(/bun:sqlite|SqliteOwnerStore|createOwnerAuth|node:fs|createDecipheriv/.test(text))throw Error('Backend code leaked into client '+path);inspected++;}
 console.log(JSON.stringify({passed:true,bundledDisabledPanels:4,lateReadinessFenced:true,clientChunksInspected:inspected,backendLeaks:0}));
}finally{await browser?.close();worker.kill();await worker.exited;const err=await new Response(worker.stderr).text();if(err)console.error(err)}
