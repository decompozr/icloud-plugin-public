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
 z.object({action:z.literal('post_to_shared_album'),albumId:albumId.refine(v=>v.includes(':shared:'),'Shared Album required'),assetIds:z.array(assetId).length(1)}).strict(),
 z.object({action:z.literal('remove_from_album'),albumId,assetIds:ids}).strict(),
 z.object({action:z.literal('set_metadata'),assetIds:ids,values:z.object({title:z.string().max(1024).optional(),description:z.string().max(10000).optional(),keywords:z.array(z.string().min(1).max(128)).max(100).optional(),favorite:z.boolean().optional()}).strict().refine(v=>Object.keys(v).length>0,'No changes')}).strict(),
 z.object({action:z.literal('delete_assets'),assetIds:ids}).strict(),
]);
export type Mutation=z.infer<typeof mutationSchema>;
export const assetSchema=z.object({id:assetId,filename:z.string(),date:z.string().nullable(),mediaType:z.enum(['photo','video']),livePhoto:z.boolean().default(false),title:z.string(),description:z.string(),keywords:z.array(z.string()),favorite:z.boolean(),persons:z.array(z.string()),width:z.number(),height:z.number(),shared:z.boolean()}).strict();
export const albumSchema=z.object({id:albumId,title:z.string(),kind:z.enum(['ordinary','shared']),count:z.number().int().nonnegative()}).strict();
export type Asset=z.infer<typeof assetSchema>;
export const catalogSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('comparison'),assetIds:z.array(assetId).min(1).max(12).refine(v=>new Set(v).size===v.length),albumId}).strict(),
 z.object({kind:z.literal('cleanup'),assetIds:z.array(assetId).min(1).max(12).refine(v=>new Set(v).size===v.length).optional(),offset:z.number().int().min(0).max(1000000).default(0),limit:z.number().int().min(1).max(12).default(6)}).strict()
]);
export type CatalogRequest=z.infer<typeof catalogSchema>;
export const remoteDecisionsSchema=z.object({reviewId:z.string().uuid(),confirm:z.literal(true),decisions:z.array(z.object({assetId,decision:z.enum(['undecided','keep','share_review','delete_review'])}).strict()).min(1).max(12)}).strict();
const summaryIds=z.array(assetId).min(1).max(500).refine(v=>new Set(v).size===v.length,'Duplicate asset IDs');
export const reviewSummarySchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('comparison'),assetIds:summaryIds,albumId}).strict(),
 z.object({kind:z.literal('cleanup'),assetIds:summaryIds}).strict()
]);
export const sharedObservationSchema=z.object({operationId:z.string().uuid(),confirm:z.literal(true),albumId:albumId.refine(v=>v.includes(':shared:')),sharedAssetId:assetId,observedOn:z.enum(['service_mac','another_device']),contentReviewed:z.enum(['still','full_asset']),note:z.string().trim().min(10).max(500)}).strict();
export interface PhotosProvider {read(command:string,input:unknown):Promise<unknown>;inspect(mutation:Mutation):Promise<unknown>;apply(mutation:Mutation,expected:unknown):Promise<unknown>;openReview?(mutation:Mutation,expected:unknown,operationId:string):Promise<unknown>;reviewStatus?(operationId:string):Promise<unknown>;openCatalog?(request:CatalogRequest,operationId:string):Promise<unknown>}
export class PhotosError extends Error {constructor(readonly code:string){super(code);}}
