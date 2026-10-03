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
 const {store,masterKey}=installation(settings,initialize);
 if(initialize){store.close();masterKey.fill(0);console.error('Installation initialized. Open the private setup page using the configured Tailscale owner account.');return;}
 const database=new Database(join(settings.state_directory,'auth.sqlite'),{create:store.ownerId()===null,readwrite:true});
 const moduleDirectory=dirname(fileURLToPath(import.meta.url));
 const assetsDirectory=import.meta.url.endsWith('.ts')?resolve(moduleDirectory,'../dist/assets'):join(moduleDirectory,'assets');
 let app:Awaited<ReturnType<typeof createApplication>>;
 try{app=await createApplication(settings,{store,masterKey,authDatabase:database,assetsDirectory});}catch(error){database.close();store.close();masterKey.fill(0);throw error;}
 const listeners=[app.publicApp.listen(settings.public_port,settings.host),app.privateApp.listen(settings.private_port,settings.host)];
 for(const listener of listeners)app.lifecycle.attach(listener);
 let stopping=false;
 const stop=async()=>{if(stopping)return;stopping=true;try{await app.lifecycle.shutdown(listeners,app.monitor,{onWaiting:counts=>console.info(JSON.stringify({event:'shutdown_waiting',...counts}))});await app.runtime.dispose();}finally{database.close();store.close();masterKey.fill(0);}};
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void stop().then(()=>process.exit(0));});
 for(const listener of listeners)listener.on('error',()=>{void stop().then(()=>{process.exitCode=1;});});
 console.error('Private setup and public MCP listeners started. Public access still requires owner OAuth.');
}
main().catch(()=> { console.error('Startup failed. Check required configuration.'); process.exitCode=1; });
