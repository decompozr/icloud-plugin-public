import {z} from 'zod';
export const assetId=z.string().regex(/^asset:[a-f0-9]{16}:[A-Fa-f0-9-]{36}$/);
export const albumId=z.string().regex(/^album:[a-f0-9]{16}:(ordinary|shared):[A-Fa-f0-9-]{36}$/);
export const querySchema=z.object({person:z.string().trim().min(1).max(256).optional(),from:z.string().datetime({offset:true}).optional(),to:z.string().datetime({offset:true}).optional(),albumId:albumId.optional(),offset:z.number().int().min(0).max(1000000).default(0),limit:z.number().int().min(1).max(100).default(50)}).strict().refine(v=>!v.from||!v.to||Date.parse(v.from)<Date.parse(v.to),'from must precede exclusive to');
const ids=z.array(assetId).min(1).max(50).refine(v=>new Set(v).size===v.length,'Duplicate asset IDs');
const title=z.string().trim().min(1).max(256);
export const mutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create_album'),title}).strict(),
 z.object({action:z.literal('rename_album'),albumId,title}).strict(),
 z.object({action:z.literal('delete_empty_album'),albumId}).strict(),
 z.object({action:z.literal('add_to_album'),albumId,assetIds:ids}).strict(),
 z.object({action:z.literal('remove_from_album'),albumId,assetIds:ids}).strict(),
 z.object({action:z.literal('set_metadata'),assetIds:ids,values:z.object({title:z.string().max(1024).optional(),description:z.string().max(10000).optional(),keywords:z.array(z.string().min(1).max(128)).max(100).optional(),favorite:z.boolean().optional()}).strict().refine(v=>Object.keys(v).length>0,'No changes')}).strict(),
 z.object({action:z.literal('delete_assets'),assetIds:ids}).strict(),
]);
export type Mutation=z.infer<typeof mutationSchema>;
export const assetSchema=z.object({id:assetId,filename:z.string(),date:z.string().nullable(),mediaType:z.enum(['photo','video']),title:z.string(),description:z.string(),keywords:z.array(z.string()),favorite:z.boolean(),persons:z.array(z.string()),width:z.number(),height:z.number(),shared:z.boolean()}).strict();
export const albumSchema=z.object({id:albumId,title:z.string(),kind:z.enum(['ordinary','shared']),count:z.number().int().nonnegative()}).strict();
export type Asset=z.infer<typeof assetSchema>;
export interface PhotosProvider {read(command:string,input:unknown):Promise<unknown>;inspect(mutation:Mutation):Promise<unknown>;apply(mutation:Mutation,expected:unknown):Promise<unknown>}
export class PhotosError extends Error {constructor(readonly code:string){super(code);}}
