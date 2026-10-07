import{createNativeReset}from'./server/native-reset.js';
import{assertResetComplete}from'./server/system-reset.js';
import{prepareLocalOwner}from'../../../modules/account/dist/index.js';
import{Database}from'bun:sqlite';
import{join,dirname,resolve}from'node:path';
import{fileURLToPath}from'node:url';
import{readSettings}from'./server/settings.js';
import{installation}from'./server/installation.js';
import{createApplication}from'./server/application.js';
async function main() {
 process.umask(0o077);
 const args=process.argv.slice(2),configIndex=args.indexOf('--config');
 const path=args[configIndex+1];if(configIndex<0||!path)throw Error('An explicit --config TOML path is required');
 const settings=readSettings(resolve(path)),initialize=args.includes('--initialize');
 assertResetComplete(settings);
 const {store,masterKey}=installation(settings,initialize);
 if(args.includes('--prepare-local-owner')){try{const url=prepareLocalOwner(settings,store.ownerId());console.log(url);if(process.platform==='darwin'&&!args.includes('--no-open'))Bun.spawn(['open',url],{stdout:'ignore',stderr:'ignore'});}finally{store.close();masterKey.fill(0);}return;}
 if(initialize){store.close();masterKey.fill(0);console.error('Installation initialized. Open the private setup page using the configured Tailscale owner account.');return;}
 const database=new Database(join(settings.state_directory,'auth.sqlite'),{create:store.ownerId()===null,readwrite:true});
 const moduleDirectory=dirname(fileURLToPath(import.meta.url));
 const assetsDirectory=import.meta.url.endsWith('.ts')?resolve(moduleDirectory,'../dist/assets'):join(moduleDirectory,'assets');
 const resetController=settings.runtime_mode==='native'?createNativeReset(settings,{entry:process.argv[1]!,configPath:resolve(path),cwd:process.cwd(),drainAndClose:()=>stop()}):{};
 let app:Awaited<ReturnType<typeof createApplication>>;
 try{app=await createApplication(settings,{store,masterKey,authDatabase:database,assetsDirectory,...resetController});}catch(error){database.close();store.close();masterKey.fill(0);throw error;}
 const listeners=[app.publicApp.listen(settings.public_port,settings.host),app.privateApp.listen(settings.private_port,settings.host),...(app.localApp&&settings.local_origin?[app.localApp.listen(Number(new URL(settings.local_origin).port),'127.0.0.1')]:[])];
 for(const listener of listeners)app.lifecycle.attach(listener);
 let stopping:Promise<void>|undefined;
 const stop=()=>stopping??=(async()=>{try{await app.lifecycle.shutdown(listeners,app.monitor,{onWaiting:counts=>console.info(JSON.stringify({event:'shutdown_waiting',...counts}))});await app.runtime.dispose();}finally{database.close();store.close();masterKey.fill(0);}})();
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void stop().then(()=>process.exit(0));});
 for(const listener of listeners)listener.on('error',()=>{void stop().then(()=>{process.exitCode=1;});});
 console.error('Private setup and public MCP listeners started. Public access still requires owner OAuth.');
}
main().catch(()=> { console.error('Startup failed. Check required configuration.'); process.exitCode=1; });
