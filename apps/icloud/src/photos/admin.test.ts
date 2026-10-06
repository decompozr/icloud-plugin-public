import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {createPhotosAdmin} from './admin.js';
const disabled={read:false,write:false,delete:false};
test('Photos global policy defaults disabled within the configured ceiling without reading providers or changing OAuth state',()=>{
 const db=new Database(':memory:');let owner:string|null=null;
 try{
  db.exec('CREATE TABLE fixture_grants(id TEXT,scope TEXT); INSERT INTO fixture_grants VALUES(\'client\',\'photos.read\')');
  const module=createPhotosAdmin({database:db,store:{ownerId:()=>owner},ceiling:{read:true,write:true,delete:false}});
  expect(module.policy()).toEqual(disabled);expect(db.query('SELECT * FROM photos_admin_policy').all()).toEqual([]);
  owner='owner';expect(module.policy()).toEqual(disabled);
  expect(module.admin.id).toBe('photos');expect(module.admin.title).toBe('Mac Photos library');expect(module.admin.fields.map(field=>field.id)).toEqual(['read','write','delete']);
  expect(db.query('SELECT * FROM fixture_grants').all()).toEqual([{id:'client',scope:'photos.read'}]);
 }finally{db.close();}
});
test('Photos policy requires strict hierarchy, configured ceilings and confirmation for enabling',async()=>{
 const db=new Database(':memory:'),module=createPhotosAdmin({database:db,store:{ownerId:()=> 'owner'},ceiling:{read:true,write:true,delete:false}});
 try{
  const invalid:Record<string,boolean>[]=[{read:false,write:true,delete:false},{read:true,write:false,delete:true},{read:true,write:true,delete:true},{read:true,write:true,delete:false,unexpected:true}];
  for(const value of invalid)await expect(module.admin.updateCapabilities(value,false)).rejects.toThrow();
  expect(module.policy()).toEqual(disabled);
  expect(await module.admin.updateCapabilities(disabled,false)).toEqual(disabled);
  await expect(module.admin.updateCapabilities({read:true,write:false,delete:false},false)).rejects.toThrow('confirmation_required');
  expect(module.policy()).toEqual(disabled);
  expect(await module.admin.updateCapabilities({read:true,write:false,delete:false},true)).toEqual({read:true,write:false,delete:false});
  await expect(module.admin.updateCapabilities({read:true,write:true,delete:true},true)).rejects.toThrow('configured_capability_disabled');
 }finally{db.close();}
});
test('Photos persists owner policy, isolates owners and never resurrects actions after a ceiling is tightened',async()=>{
 const db=new Database(':memory:');let owner:string|null='first';const store={ownerId:()=>owner};
 try{
  const first=createPhotosAdmin({database:db,store,ceiling:{read:true,write:true,delete:true}});
  expect(first.policy()).toEqual(disabled);await first.admin.updateCapabilities({read:true,write:true,delete:true},true);
  await first.admin.updateCapabilities({read:true,write:false,delete:false},false);
  expect(createPhotosAdmin({database:db,store,ceiling:{read:true,write:true,delete:true}}).policy()).toEqual({read:true,write:false,delete:false});
  owner='second';const second=createPhotosAdmin({database:db,store,ceiling:{read:true,write:true,delete:true}});expect(second.policy()).toEqual(disabled);await second.admin.updateCapabilities({read:true,write:true,delete:true},true);
  createPhotosAdmin({database:db,store,ceiling:{read:true,write:false,delete:false}});
  expect(createPhotosAdmin({database:db,store,ceiling:{read:true,write:true,delete:true}}).policy()).toEqual({read:true,write:false,delete:false});
  owner='first';expect(first.policy()).toEqual({read:true,write:false,delete:false});
  owner=null;expect(first.policy()).toEqual(disabled);await expect(first.admin.updateCapabilities(disabled,true)).rejects.toThrow('forbidden');
  expect(db.query('SELECT owner FROM photos_admin_policy ORDER BY owner').all()).toEqual([{owner:'first'},{owner:'second'}]);
 }finally{db.close();}
});
test('Photos deletion requires a distinct confirmed re-enable within the configured ceiling',async()=>{
 const db=new Database(':memory:'),module=createPhotosAdmin({database:db,store:{ownerId:()=> 'owner'},ceiling:{read:true,write:true,delete:true}});
 try{
  await module.admin.updateCapabilities({read:true,write:true,delete:false},true);
  await expect(module.admin.updateCapabilities({read:true,write:true,delete:true},false)).rejects.toThrow('confirmation_required');
  expect(module.policy()).toEqual({read:true,write:true,delete:false});
  expect(await module.admin.updateCapabilities({read:true,write:true,delete:true},true)).toEqual({read:true,write:true,delete:true});
 }finally{db.close();}
});
test('Photos factory rejects malformed or inconsistent configured ceilings',()=>{
 const db=new Database(':memory:');try{expect(()=>createPhotosAdmin({database:db,store:{ownerId:()=> 'owner'},ceiling:{read:false,write:true,delete:false}})).toThrow('invalid_input');}finally{db.close();}
});
