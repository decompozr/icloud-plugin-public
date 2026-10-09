import {test,expect} from 'bun:test';
import {sharedManagementRequest} from './shared-management-contract.js';
const albumGuid='11111111-1111-4111-8111-111111111111';
const invitationGuid='22222222-2222-4222-8222-222222222222';
test('permission changes preserve the observed name and cannot silently change other access',()=>{
 const request=sharedManagementRequest({action:'set_contributions',albumGuid,currentName:'Reviewed album',enabled:false});
 expect(request.payload).toEqual({albumguid:albumGuid,attributes:{name:'Reviewed album',allowcontributions:'0'}});
 expect(JSON.stringify(request)).not.toContain('ispublic');
 expect(sharedManagementRequest({action:'set_public_access',albumGuid,enabled:false}).payload).toEqual({albumguid:albumGuid,ispublic:'0'});
 expect(()=>sharedManagementRequest({action:'set_contributions',albumGuid,enabled:true})).toThrow();
});
test('invitation IDs are retained rather than regenerated and notifications are explicit',()=>{
 const input={action:'invite_participants',albumGuid,invitations:[{invitationGuid,email:'reviewed@example.test'}]};
 const first=sharedManagementRequest(input);expect(sharedManagementRequest(input)).toEqual(first);
 expect(first.mayNotify).toBe(true);expect(first.payload).toEqual({albumguid:albumGuid,invitations:[{email:'reviewed@example.test',invitationguid:invitationGuid}]});
 expect(()=>sharedManagementRequest({...input,invitations:[...input.invitations,...input.invitations]})).toThrow();
 expect(()=>sharedManagementRequest({...input,clientOrgKey:'tool-supplied-key'})).toThrow();
});
test('participant and content removal use exact separate identities and destination routing',()=>{
 const participant=sharedManagementRequest({action:'remove_participant',albumGuid,invitationGuid});
 expect(participant.endpoint).toBe('unshare');expect(participant.payload).toEqual({albumguid:albumGuid,invitations:[invitationGuid]});
 const assets=sharedManagementRequest({action:'remove_shared_assets',albumGuid,assetGuids:['exact-shared-copy']});
 expect(assets.endpoint).toBe('deleteassets');expect(assets.route).toBe('album_location');
 expect(assets.payload).toEqual({albumguid:albumGuid,assets:['exact-shared-copy']});
 expect(()=>sharedManagementRequest({action:'remove_shared_assets',albumGuid,assetGuids:[]})).toThrow();
 expect(()=>sharedManagementRequest({action:'remove_shared_assets',albumGuid,assetGuids:['a','a']})).toThrow();
});
