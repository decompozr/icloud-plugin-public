import {expect,test} from 'bun:test';
import {eventResourceUri,parseEventResourceUri,nativeEventResourceUri} from './resources.js';
const binding='00000000-0000-4000-8000-000000000001',home='00000000-0000-4000-8000-000000000002',accessory='00000000-0000-4000-8000-000000000003',service='00000000-0000-4000-8000-000000000004',characteristic='00000000-0000-4000-8000-000000000005';
const a={bindingId:binding,homeId:home,accessoryId:accessory,serviceId:service,characteristicId:characteristic,session:binding,after:7};const uri=eventResourceUri(a);
test('resource addresses preserve exact binding/Home/characteristic and cursor',()=>{expect(parseEventResourceUri(uri,{id:binding,home})).toEqual(a);expect(nativeEventResourceUri(a)).toBe(`homekit://events/${home}/${accessory}/${service}/${characteristic}?after=7`);});
test('foreign binding and foreign Home cannot map to native feeds',()=>{expect(()=>parseEventResourceUri(uri,{id:accessory,home})).toThrow('foreign_event_resource');expect(()=>parseEventResourceUri(uri,{id:binding,home:accessory})).toThrow('foreign_event_resource');});
test('native all-feed, credential authorities, fragments and encoded separators are denied',()=>{for(const value of ['homekit://events/all',uri.replace('binding/','user@binding/'),uri+'#fragment',uri.replace('/events/','%2Fevents%2F')])expect(()=>parseEventResourceUri(value,{id:binding,home})).toThrow();});
test('duplicate, fractional, negative and unsafe cursor values are denied',()=>{for(const suffix of ['?after=1&after=2','?after=-1','?after=1.5','?after=9007199254740992','?other=1'])expect(()=>parseEventResourceUri(uri.split('?')[0]+suffix,{id:binding,home})).toThrow();});

test('cursor session must be explicit and duplicate sessions are denied',()=>{expect(()=>parseEventResourceUri(uri.replace('&session='+binding,''),{id:binding,home})).toThrow('event_session_required');expect(()=>parseEventResourceUri(uri+'&session='+binding,{id:binding,home})).toThrow();});
