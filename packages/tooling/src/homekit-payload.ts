import {cp,stat,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {inspectHomeKitHelper,HOMEKIT_PROTOCOL_VERSION,HOMEKIT_SUPPORTED_PROTOCOLS} from '../../../apps/icloud/src/homekit/preflight.js';
export const homeKitPayloadSchema=z.object({app:z.enum(['apps/homekit-helper/HomeKitProbe.app','apps/homekit-helper/HomeKitHelper.app']),protocolVersion:z.enum(HOMEKIT_SUPPORTED_PROTOCOLS),sourceSHA256:z.string().regex(/^[a-f0-9]{64}$/),signingTeam:z.string().regex(/^[A-Z0-9]{10}$/)}).strict();
export type HomeKitPayload=z.infer<typeof homeKitPayloadSchema>;
export async function verifyHomeKitPayload(root:string,payload:HomeKitPayload){const result=await inspectHomeKitHelper({native_app:join(root,payload.app),python:'/usr/bin/python3',source_sha256:payload.sourceSHA256,signing_team:payload.signingTeam});if(result.status!=='pass'||result.protocolVersion!==payload.protocolVersion)throw Error(`HomeKit payload preflight failed: ${result.stage}`);}
/** Opt-in signed bundle staging. Never installs, changes config or starts HomeKit. */
export async function stageHomeKitPayload(root:string,receiptPath:string,signingTeam:string):Promise<HomeKitPayload>{
 if((await stat(receiptPath)).size>65536)throw Error('Build receipt too large');
 const receipt=z.object({state:z.literal('succeeded'),configuration:z.literal('Release'),signatureVerified:z.literal(true),sourceUnchanged:z.literal(true),app:z.string(),sourceSHA256:z.string().regex(/^[a-f0-9]{64}$/),embeddedSourceSHA256:z.string()}).passthrough().parse(JSON.parse(await readFile(receiptPath,'utf8')));
 if(receipt.embeddedSourceSHA256!==receipt.sourceSHA256)throw Error('Build source pin mismatch');
 const payload=homeKitPayloadSchema.parse({app:'apps/homekit-helper/HomeKitHelper.app',protocolVersion:HOMEKIT_PROTOCOL_VERSION,sourceSHA256:receipt.sourceSHA256,signingTeam});
 const settings={native_app:receipt.app,python:'/usr/bin/python3',source_sha256:payload.sourceSHA256,signing_team:signingTeam};const inspected=await inspectHomeKitHelper(settings);if(inspected.status!=='pass'||inspected.protocolVersion!==HOMEKIT_PROTOCOL_VERSION)throw Error('Signed helper receipt does not pass current preflight');
 const parent=join(root,'apps/homekit-helper');await mkdir(parent,{recursive:true});
 try{await stat(join(root,payload.app));throw Error('Helper payload already exists');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 await cp(receipt.app,join(root,payload.app),{recursive:true,verbatimSymlinks:true,errorOnExist:true,force:false});await verifyHomeKitPayload(root,payload);return payload;
}
