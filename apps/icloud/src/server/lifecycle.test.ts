import {test,expect} from 'bun:test';
import express from 'express';
import {connect} from 'node:net';
import {HttpLifecycle} from './lifecycle.js';
import {OperationMonitor} from '../observability/operations.js';

test('drain waits beyond grace for accepted write after caller disconnect and rejects new tools',async()=>{
 const lifecycle=new HttpLifecycle(),monitor=new OperationMonitor(()=>{}),app=express();app.use(lifecycle.admission);
 let finish:()=>void=()=>{},started:()=>void=()=>{};const startedPromise=new Promise<void>(r=>{started=r;}),gate=new Promise<void>(r=>{finish=r;});let writes=0;
 app.post('/write',async(_req,res)=>{await lifecycle.track(()=>monitor.run('mail_mark',{},async()=>{started();await gate;writes++;}));res.end('done');});
 const server=app.listen(0,'127.0.0.1');lifecycle.attach(server);await new Promise<void>(r=>server.once('listening',r));const address=server.address();if(!address||typeof address==='string')throw Error('No listener');
 const abort=new AbortController();const request=fetch(`http://127.0.0.1:${address.port}/write`,{method:'POST',signal:abort.signal}).catch(()=>undefined);await startedPromise;abort.abort();await request;
 let stopped=false,waiting=false;const shutdown=lifecycle.shutdown([server],monitor,{graceMs:20,onWaiting:()=>{waiting=true;}}).then(()=>{stopped=true;});
 await Bun.sleep(50);expect(waiting).toBe(true);expect(stopped).toBe(false);expect(monitor.activeCount).toBe(1);expect(writes).toBe(0);
 await expect(monitor.run('mail_mark',{},async()=>{writes++;})).rejects.toThrow('draining');
 finish();await shutdown;expect(writes).toBe(1);expect(monitor.activeCount).toBe(0);expect(stopped).toBe(true);
});
test('drain closes idle keepalive and incomplete request sockets without waiting indefinitely',async()=>{
 const lifecycle=new HttpLifecycle(),monitor=new OperationMonitor(()=>{}),app=express();app.use(lifecycle.admission);app.use(express.json());app.post('/body',(_req,res)=>res.end('done'));
 const server=app.listen(0,'127.0.0.1');lifecycle.attach(server);await new Promise<void>(r=>server.once('listening',r));const address=server.address();if(!address||typeof address==='string')throw Error('No listener');
 const socket=connect(address.port,'127.0.0.1');socket.on('error',()=>{});await new Promise<void>(r=>socket.once('connect',r));socket.write('POST /body HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{');
 await Bun.sleep(10);const begin=performance.now();await lifecycle.shutdown([server],monitor,{graceMs:20});expect(performance.now()-begin).toBeLessThan(1000);expect(monitor.activeCount).toBe(0);socket.destroy();
});
