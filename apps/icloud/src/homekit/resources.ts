import {z} from 'zod';
import {HomeKitError} from './provider.js';
const id=z.string().uuid();
export const eventAddressSchema=z.object({bindingId:id,homeId:id,accessoryId:id,serviceId:id,characteristicId:id,session:id.optional(),after:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0)}).strict();
export type EventAddress=z.infer<typeof eventAddressSchema>;
/** Binding-scoped event resource address. Binding is looked up with verified owner/account context first. */
export function eventResourceUri(raw:z.input<typeof eventAddressSchema>):string {const a=eventAddressSchema.parse(raw);return `homekit://binding/${a.bindingId}/events/${a.homeId}/${a.accessoryId}/${a.serviceId}/${a.characteristicId}${a.after||a.session?'?'+new URLSearchParams({...a.after?{after:String(a.after)}:{},...a.session?{session:a.session}:{}}).toString():''}`;}
export function parseEventResourceUri(uri:string,binding:{id:string;home:string}):EventAddress {
 if(uri.length>1024||uri.includes('%')||/\s/.test(uri))throw new HomeKitError('invalid_event_uri');
 const u=new URL(uri);if(u.protocol!=='homekit:'||u.hostname!=='binding'||u.port||u.username||u.password||u.hash)throw new HomeKitError('invalid_event_uri');
 const parts=u.pathname.split('/').slice(1);if(parts.length!==6||parts[1]!=='events')throw new HomeKitError('invalid_event_uri');const query=[...u.searchParams];if(query.length>2||new Set(query.map(([key])=>key)).size!==query.length||query.some(([key,value])=>key!=='session'&&(key!=='after'||!/^\d+$/.test(value))))throw new HomeKitError('invalid_event_cursor');
 const address=eventAddressSchema.parse({bindingId:parts[0],homeId:parts[2],accessoryId:parts[3],serviceId:parts[4],characteristicId:parts[5],session:u.searchParams.get('session')??undefined,after:Number(u.searchParams.get('after')??0)});if(address.after>0&&!address.session)throw new HomeKitError('event_session_required');if(address.bindingId!==binding.id||address.homeId!==binding.home)throw new HomeKitError('foreign_event_resource');return address;
}
/** Never map an aggregate native feed across Homes. Exact characteristic only. */
export function nativeEventResourceUri(address:EventAddress):string {const a=eventAddressSchema.parse(address);return `homekit://events/${a.homeId}/${a.accessoryId}/${a.serviceId}/${a.characteristicId}${a.after?'?after='+a.after:''}`;}
