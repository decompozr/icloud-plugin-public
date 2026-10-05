import{prepareLocalOwner}from'./auth/local-owner.js';
import{Database}from'bun:sqlite';
import{join,dirname,resolve}from'node:path';
import{fileURLToPath}from'node:url';
import{readSettings,custodyDirectory}from'./server/settings.js';
import{custodyStartup}from'./server/custody-startup.js';
import{InstallationAccess}from'./server/installation-access.js';
import{installation}from'./server/installation.js';
import{createApplication}from'./server/application.js';
async function main() {
 process.umask(0o077);
 const args=process.argv.slice(2),configIndex=args.indexOf('--config');
 const path=args[configIndex+1];if(configIndex<0||!path)throw Error('An explicit --config TOML path is required');
 const settings=readSettings(resolve(path)),initialize=args.includes('--initialize');
 // Reject incompatible authority before creating even coordination metadata.
 custodyStartup(settings,initialize);
 const access=InstallationAccess.acquire(custodyDirectory(settings),'runtime',initialize);
 let retained=false,releasable=false;
 try{
 const {store,masterKey}=installation(settings,initialize);
 if(args.includes('--prepare-local-owner')){try{const url=prepareLocalOwner(settings,store.ownerId());console.log(url);if(process.platform==='darwin'&&!args.includes('--no-open'))Bun.spawn(['open',url],{stdout:'ignore',stderr:'ignore'});}finally{try{store.close();}finally{masterKey.fill(0);}releasable=true;}return;}
 if(initialize){try{store.close();}finally{masterKey.fill(0);}releasable=true;console.error('Installation initialized. Open the private setup page using the configured Tailscale owner account.');return;}
 let database:Database;
 try{database=new Database(join(settings.state_directory,'auth.sqlite'),{create:store.ownerId()===null,readwrite:true});}catch(error){try{store.close();}finally{masterKey.fill(0);}releasable=true;throw error;}
 const moduleDirectory=dirname(fileURLToPath(import.meta.url));
 const assetsDirectory=import.meta.url.endsWith('.ts')?resolve(moduleDirectory,'../dist/assets'):join(moduleDirectory,'assets');
 let app:Awaited<ReturnType<typeof createApplication>>;
 // Factory errors do not prove module disposal succeeded (factory cleanup is
 // best-effort). Retain exclusion even after closing these owned DB handles.
 try{app=await createApplication(settings,{store,masterKey,authDatabase:database,assetsDirectory});}catch(error){try{database.close();store.close();}finally{masterKey.fill(0);}throw error;}
 const listeners=[app.publicApp.listen(settings.public_port,settings.host),app.privateApp.listen(settings.private_port,settings.host),...(app.localApp&&settings.local_origin?[app.localApp.listen(Number(new URL(settings.local_origin).port),'127.0.0.1')]:[])];
 for(const listener of listeners)app.lifecycle.attach(listener);
 let stopPromise:Promise<void>|undefined;
 const stop=()=>stopPromise??=(async()=>{try{await app.lifecycle.shutdown(listeners,app.monitor,{onWaiting:counts=>console.info(JSON.stringify({event:'shutdown_waiting',...counts}))});await app.runtime.dispose();}finally{try{database.close();store.close();}finally{masterKey.fill(0);}}access.release();})();
 const stopFailed=()=>{console.error('Shutdown incomplete; inspect installation access before recovery.');process.exitCode=1;};
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void stop().then(()=>process.exit(0),stopFailed);});
 for(const listener of listeners)listener.on('error',()=>{void stop().then(()=>{process.exitCode=1;},stopFailed);});
 retained=true; // shutdown owns release, after drain/disposal/DB closure/key clearing
 console.error('Private setup and public MCP listeners started. Public access still requires owner OAuth.');
 }finally{if(!retained&&releasable)access.release();}
}
main().catch(()=> { console.error('Startup failed. Check required configuration.'); process.exitCode=1; });
