import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {ModuleRuntime} from '../modules/runtime.js';
import {createServer} from '../mcp/server.js';
import {createPrivateAdmin,type AdminOptions} from '../admin/handler.js';
import {createPhotosAdmin} from './admin.js';
import {photosRegistration} from './module.js';
import {PhotosService} from './service.js';
import type {PhotosProvider} from './contracts.js';

test('Mail grants and incomplete Photos grants cannot invoke Photos writes or deletion',async()=>{
 const db=new Database(':memory:');let reads=0,writes=0;
 const policy={read:true,write:true,delete:true};
 const provider:PhotosProvider={read:async()=>{reads++;return {};},inspect:async()=>({revision:1}),apply:async()=>{writes++;return {status:'applied'};}};
 const service=new PhotosService(db,provider,()=>policy,()=> 'owner');
 const runtime=new ModuleRuntime().register(photosRegistration(service,()=>policy));await runtime.start();
 const asset='asset:1234567890abcdef:11111111-1111-1111-1111-111111111111';
 try{
  for(const scopes of [['mail.read'],['photos.read'],['photos.write'],['photos.delete'],['photos.read','photos.delete'],['photos.write','photos.delete']]){
   const server=createServer(runtime,'https://fixture.invalid/icloud/mcp',new Set(scopes)),client=new Client({name:'scope-fixture',version:'1'});
   const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
   try{
    expect((await client.callTool({name:'photos_delete_prepare',arguments:{action:'delete_assets',assetIds:[asset]}})).isError).toBe(true);
    if(!scopes.includes('photos.write')||!scopes.includes('photos.read'))expect((await client.callTool({name:'photos_prepare',arguments:{action:'create_album',title:'Blocked'}})).isError).toBe(true);
    if(!scopes.includes('photos.read'))expect((await client.callTool({name:'photos_health',arguments:{}})).isError).toBe(true);
   }finally{await client.close();await server.close();}
  }
  expect(reads).toBe(0);expect(writes).toBe(0);expect(db.query('SELECT * FROM photos_operations').all()).toEqual([]);
 }finally{await runtime.dispose();db.close();}
});

test('local and remote Photos admin share policy while each enforces its own owner and mutation origin',async()=>{
 const db=new Database(':memory:');let prompts=0;
 const module=createPhotosAdmin({database:db,store:{ownerId:()=> 'owner'},ceiling:{read:true,write:true,delete:false}});
 const session=async(headers:Headers)=>{if(headers.get('cookie')!=='owner')throw Error('Owner required');return{user:{id:'owner'}};};
 const store={ownerId:()=> 'owner'} as AdminOptions['store'];
 const origins=['http://localhost:4102','https://fixture.invalid:8443'];
 const admins=origins.map(privateOrigin=>createPrivateAdmin({privateOrigin,store,ownerAuth:{ownerSession:session,enrollmentSession:session},diagnostics:async()=>({installed:false,authenticated:false,online:false,privateReachable:false}),validateCredential:async()=>{},modules:[module.admin],photosSetup:{status:async()=>({ready:false}),action:async()=>{prompts++;return{opened:true};}}}));
 const request=(index:number,path:string,body?:unknown,origin=origins[index]!,cookie='owner')=>admins[index]!(new Request(origins[index]+path,{method:body?'POST':'GET',headers:{origin,cookie,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}));
 try{
  for(let index=0;index<2;index++){
   expect((await request(index,'/icloud/admin/photos/status',undefined,origins[index],'')).status).toBe(403);
   expect((await request(index,'/icloud/admin/photos/action',{action:'authorize'},origins[1-index])).status).toBe(403);
   expect((await request(index,'/icloud/admin/photos/action',{action:'authorize'})).status).toBe(200);
  }
  expect(prompts).toBe(2);
  expect((await request(0,'/icloud/admin/modules/photos/capabilities',{policy:{read:true,write:false,delete:false},confirmEnable:false})).status).toBe(200);
  expect(module.policy()).toEqual({read:true,write:false,delete:false});
  expect((await request(1,'/icloud/admin/modules/photos/capabilities',{policy:{read:true,write:true,delete:false},confirmEnable:false})).status).toBe(409);
  expect((await request(1,'/icloud/admin/modules/photos/capabilities',{policy:{read:true,write:true,delete:false},confirmEnable:true})).status).toBe(200);
  expect(module.policy()).toEqual({read:true,write:true,delete:false});
 }finally{db.close();}
});
