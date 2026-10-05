import {test,expect} from 'bun:test';
import {createServer} from 'node:net';
import {availableLocalPort} from './local-port.js';
test('local port planning skips occupied and excluded ports with a bounded range',async()=>{
 const server=createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw Error('Fixture address unavailable');
 try{expect(await availableLocalPort(address.port,[],10)).toBeGreaterThan(address.port);expect(await availableLocalPort(address.port+1,[address.port+1],10)).toBeGreaterThan(address.port+1);await expect(availableLocalPort(address.port,[],1)).rejects.toThrow();await expect(availableLocalPort(80)).rejects.toThrow();}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
