import {test,expect} from 'bun:test';
import {readiness,matchingEvidence,readinessServices,observedProviderRead} from './readiness.js';
test('registration never establishes account authorization or read success',()=>{
 const client={clientId:'a',name:'ChatGPT',registeredScopes:['calendar.read'],recovery:'fresh_consent_and_tool_refresh' as const};
 const result=readiness({read:true},'calendar',client);
 expect(result).toEqual({configured:'configuredOn',authorization:'unknownAuthorization',tested:'unknownRead',recovery:'recoveryConsent'});
 expect(readiness(undefined,'calendar',client).configured).toBe('configuredUnknown');
 expect(readiness({read:false},'calendar',client).configured).toBe('configuredOff');
});
test('missing ceilings route by actual registration ownership; no context remains unknown',()=>{
 expect(readiness({read:true},'calendar').recovery).toBe('recoverySelect');
 for(const [recovery,expected] of [['new_client_registration_then_consent','recoveryNew'],['explicit_client_update_then_consent','recoveryOwner']] as const){
  expect(readiness({read:true},'calendar',{clientId:'a',name:'ChatGPT',registeredScopes:['mail.read'],recovery}).recovery).toBe(expected);
 }
});

test('rendering selects only exact account/client/service evidence and rejects expiry',()=>{const row={accountId:'a',clientId:'c',service:'calendar',authorizedAt:new Date(1).toISOString(),expiresAt:new Date(1000).toISOString(),reads:{}};expect(matchingEvidence([row],'a','c','calendar',2)).toBe(row);for(const [a,c,s] of [['b','c','calendar'],['a','d','calendar'],['a','c','mail']])expect(matchingEvidence([row],a!,c!,s!,2)).toBeUndefined();expect(matchingEvidence([row],'a','c','calendar',1000)).toBeUndefined();});


test('composed Photos readiness stays separate from authorization and health',()=>{
 expect(readinessServices({calendar:{read:true},photos:{read:false},future:{read:true}})).toEqual(['mail','calendar','photos','future']);
 expect(readinessServices(undefined)).toEqual(['mail']);
 const client={clientId:'old',name:'ChatGPT',registeredScopes:['mail.read','calendar.read'],recovery:'new_client_registration_then_consent' as const};
 expect(readiness({read:true},'photos',client)).toEqual({configured:'configuredOn',authorization:'unknownAuthorization',tested:'unknownRead',recovery:'recoveryNew'});
 const now=new Date(1000).toISOString();
 expect(observedProviderRead('photos',{photos_health:now,photos_review_prepare:now,calendar_query_events:now}).verifiedAt).toBeUndefined();
 for(const tool of ['photos_query','photos_albums','photos_detail','photos_persons'])expect(observedProviderRead('photos',{[tool]:now}).verifiedAt).toBe(now);
 expect(observedProviderRead('future',{future_health:now}).verifiedAt).toBeUndefined();
 expect(observedProviderRead('calendar',{calendar_query_events:now}).verifiedAt).toBeUndefined();
 expect(observedProviderRead('calendar',{calendar_list_calendars:now}).listedAt).toBe(now);
 expect(observedProviderRead('calendar',{calendar_list_calendars:now,calendar_query_events:now}).verifiedAt).toBe(now);
});
test('HomeKit inventory is catalog evidence; health is not a read; fresh characteristic read is separate',()=>{expect(observedProviderRead('homekit',{homekit_health:'2026-10-06T10:00:00Z'})).toEqual({verifiedAt:undefined,listedAt:undefined});expect(observedProviderRead('homekit',{homekit_automation_inventory:'2026-10-06T10:00:00Z'})).toEqual({verifiedAt:undefined,listedAt:'2026-10-06T10:00:00Z'});expect(observedProviderRead('homekit',{homekit_read:'2026-10-06T10:01:00Z'}).verifiedAt).toBe('2026-10-06T10:01:00Z');});
