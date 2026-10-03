import type {Server} from 'node:http';
import type {Socket} from 'node:net';
import type {RequestHandler} from 'express';
import type {OperationMonitor} from '../observability/operations.js';

/** Owns only this application's listeners and sockets; never kills a process. */
export class HttpLifecycle {
 private draining=false;
 private requests=0;
 private tasks=0;
 private sockets=new Map<Socket,number>();
 private waiters=new Set<()=>void>();
 get isDraining(){return this.draining;}
 readonly admission:RequestHandler=(req,res,next)=>{
  if(this.draining){res.set('Connection','close').set('Retry-After','5').status(503).json({error:'Service draining'});return;}
  this.requests++;const socket=req.socket;this.sockets.set(socket,(this.sockets.get(socket)??0)+1);
  let finished=false;const complete=()=>{if(finished)return;finished=true;this.requests--;const remaining=Math.max(0,(this.sockets.get(socket)??1)-1);this.sockets.set(socket,remaining);if(this.draining&&remaining===0)socket.end();this.changed();};
  res.once('finish',complete);res.once('close',complete);next();
 };
 attach(server:Server){server.on('connection',socket=>{if(!this.sockets.has(socket))this.sockets.set(socket,0);socket.once('close',()=>{this.sockets.delete(socket);this.changed();});});}
 async track<T>(operation:()=>Promise<T>):Promise<T>{this.tasks++;try{return await operation();}finally{this.tasks--;this.changed();}}
 private changed(){for(const notify of this.waiters)notify();}
 async shutdown(servers:Server[],monitor:OperationMonitor,options:{graceMs?:number;onWaiting?:(counts:{requests:number;tasks:number;operations:number})=>void}={}):Promise<void>{
  this.draining=true;monitor.beginDrain();
  const closed=servers.map(server=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const closeIdle=()=>{for(const [socket,active]of this.sockets)if(active===0)socket.destroy();};
  closeIdle();
  const graceMs=options.graceMs??5000;
  let elapsed=false;
  const timer=setTimeout(()=>{elapsed=true;options.onWaiting?.({requests:this.requests,tasks:this.tasks,operations:monitor.activeCount});this.changed();},graceMs);
  try{
   // Track actual handler work separately: response abort can precede completion.
   while(this.tasks>0||monitor.activeCount>0||(!elapsed&&this.requests>0)){
    await new Promise<void>(resolve=>{const notify=()=>{this.waiters.delete(notify);resolve();};this.waiters.add(notify);if(monitor.activeCount>0)void monitor.waitForIdle().then(notify);});
   }
   // Only when no application task/operation remains may incomplete HTTP be cut.
   for(const socket of this.sockets.keys())socket.destroy();
   await Promise.all(closed);
  }finally{clearTimeout(timer);}
 }
}
