import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {z} from 'zod';
const origin=z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&u.origin===value;},'Exact HTTPS origin required');
const schema=z.object({
 public_origin:origin,private_origin:origin,
 public_port:z.number().int().min(1).max(65535).default(4100),private_port:z.number().int().min(1).max(65535).default(4101),
 host:z.enum(['127.0.0.1','::1','0.0.0.0']).default('127.0.0.1'),
 runtime_mode:z.enum(['native','container']).default('native'),
 bootstrap_owner_login:z.string().min(1).max(320).optional(),
 private_proxy_address:z.string().ip().optional(),
 state_directory:z.string().min(1),master_key_file:z.string().min(1),installation_marker:z.string().min(1),
 allow_writes:z.boolean().default(false),allow_send:z.boolean().default(false),tailscale_binary:z.string().default('tailscale'),tailscale_status_file:z.string().optional(),
}).strict().superRefine((v,c)=>{
 if(new URL(v.public_origin).hostname!==new URL(v.private_origin).hostname||v.public_origin===v.private_origin)c.addIssue({code:'custom',message:'Separate origins on the same hostname required'});
 if(v.public_port===v.private_port)c.addIssue({code:'custom',message:'Distinct listeners required'});
 if(v.host==='0.0.0.0'&&v.runtime_mode!=='container')c.addIssue({code:'custom',message:'Native listeners must use loopback'});
});
export type AppSettings=z.infer<typeof schema>;
export function readSettings(path:string):AppSettings{
 const result=schema.parse(Bun.TOML.parse(readFileSync(path,'utf8')));
 for(const field of ['state_directory','master_key_file','installation_marker'] as const)result[field]=resolve(dirname(path),result[field]);
 if(result.tailscale_status_file)result.tailscale_status_file=resolve(dirname(path),result.tailscale_status_file);
 return result;
}
