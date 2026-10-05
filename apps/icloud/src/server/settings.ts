import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {z} from 'zod';
const origin=z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&u.origin===value;},'Exact HTTPS origin required');
const schema=z.object({
 public_origin:origin,private_origin:origin,
 local_origin:z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='http:'&&u.hostname==='localhost'&&!!u.port&&u.origin===value;},'Exact localhost HTTP origin required').optional(),
 public_port:z.number().int().min(1).max(65535).default(4100),private_port:z.number().int().min(1).max(65535).default(4101),
 host:z.enum(['127.0.0.1','::1','0.0.0.0']).default('127.0.0.1'),
 runtime_mode:z.enum(['native','container']).default('native'),
 photos:z.object({python:z.string().min(1),library:z.string().min(1),native_helper:z.string().min(1),web_python:z.string().min(1).optional(),allow_writes:z.boolean().default(false),allow_delete:z.boolean().default(false)}).strict().optional(),
 bootstrap_owner_login:z.string().min(1).max(320).optional(),
 private_proxy_address:z.string().ip().optional(),
 state_directory:z.string().min(1),master_key_file:z.string().min(1),installation_marker:z.string().min(1),
 custody_directory:z.string().min(1).optional(),
 custody:z.object({format:z.literal(1),master_backend:z.enum(['file','keychain']),installation_id:z.string().uuid(),minimum_generation:z.number().int().positive().safe()}).strict().optional(),
 allow_writes:z.boolean().default(false),allow_send:z.boolean().default(false),tailscale_binary:z.string().default('tailscale'),tailscale_status_file:z.string().optional(),
}).strict().superRefine((v,c)=>{
 if(new URL(v.public_origin).hostname!==new URL(v.private_origin).hostname||v.public_origin===v.private_origin)c.addIssue({code:'custom',message:'Separate origins on the same hostname required'});
 if(v.local_origin&&(v.runtime_mode!=='native'||[v.public_port,v.private_port].includes(Number(new URL(v.local_origin).port))))c.addIssue({code:'custom',message:'Local owner listener requires native mode and a distinct port'});
 if(v.public_port===v.private_port)c.addIssue({code:'custom',message:'Distinct listeners required'});
 if(v.host==='0.0.0.0'&&v.runtime_mode!=='container')c.addIssue({code:'custom',message:'Native listeners must use loopback'});
 if(v.custody?.master_backend==='keychain'&&v.runtime_mode==='container')c.addIssue({code:'custom',message:'Container custody must remain file-based'});
});
export type AppSettings=z.infer<typeof schema>;
export function readSettings(path:string):AppSettings{
 const result=schema.parse(Bun.TOML.parse(readFileSync(path,'utf8')));
 for(const field of ['state_directory','master_key_file','installation_marker'] as const)result[field]=resolve(dirname(path),result[field]);
 result.custody_directory=result.custody_directory?resolve(dirname(path),result.custody_directory):dirname(result.master_key_file);
 if(result.tailscale_status_file)result.tailscale_status_file=resolve(dirname(path),result.tailscale_status_file);
 if(result.photos){if(result.runtime_mode!=='native')throw Error('Photos requires native macOS runtime');for(const field of ['python','library','native_helper'] as const)result.photos[field]=resolve(dirname(path),result.photos[field]);}
 if(result.photos?.web_python)result.photos.web_python=resolve(dirname(path),result.photos.web_python);
 return result;
}
/** Stable namespace for retained installation proofs/reviews across key cutover. */
export function custodyDirectory(settings:AppSettings):string{return settings.custody_directory??dirname(settings.master_key_file);}
