import {createServer} from 'node:net';
/** Probe only loopback; callers persist the selected exact origin before startup. */
export async function availableLocalPort(start=4102,excluded:readonly number[]=[],attempts=50):Promise<number>{
 if(!Number.isInteger(start)||start<1024||start>65535||attempts<1||attempts>100)throw Error('Invalid local port range');
 for(let port=start;port<=65535&&port<start+attempts;port++){
  if(excluded.includes(port))continue;
  const free=await new Promise<boolean>((resolve,reject)=>{const server=createServer();server.once('error',error=>{if((error as NodeJS.ErrnoException).code==='EADDRINUSE')resolve(false);else reject(error);});server.listen(port,'127.0.0.1',()=>server.close(error=>error?reject(error):resolve(true)));});
  if(free)return port;
 }
 throw Error('No available localhost owner port in the selected range');
}
