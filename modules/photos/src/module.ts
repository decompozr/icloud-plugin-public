import {z} from 'zod';
import {zodToJsonSchema} from 'zod-to-json-schema';
import type {RuntimeModule,RegisteredTool} from './ports.js';
import {assetId,albumId,mutationSchema,querySchema,catalogSchema,remoteDecisionsSchema,reviewSummarySchema,sharedObservationSchema,PhotosError} from './contracts.js';
import {PhotosService,type PhotosPolicy} from './service.js';

export function photosRegistration(service:PhotosService,policy:()=>PhotosPolicy):RuntimeModule{
 const enabled=(scope:string)=>{const p=policy();return p.read&&(scope==='photos.read'||p.write&&(scope!=='photos.delete'||p.delete));};
 const tools:RegisteredTool[]=[];
 function register<T>(name:string,description:string,schema:z.ZodType<T>,scope:string,run:(input:T)=>Promise<unknown>,preview=false){
  const scopes=scope==='photos.read'?[scope]:scope==='photos.delete'?['photos.read','photos.write',scope]:['photos.read',scope];
  tools.push({requiredScopes:scopes,enabled:()=>enabled(scope),tool:{name,description,inputSchema:{...zodToJsonSchema(schema),type:'object'} as RegisteredTool['tool']['inputSchema'],securitySchemes:[{type:'oauth2',scopes}],annotations:{readOnlyHint:scope==='photos.read',destructiveHint:scope==='photos.delete',openWorldHint:scope!=='photos.read',idempotentHint:name.endsWith('_apply')}},run:async(raw)=>{
   try{const result=await run(schema.parse(raw));if(preview){const p=result as {mimeType:string;data:string};return {content:[{type:'image',mimeType:p.mimeType,data:p.data}]};}return {content:[{type:'text',text:JSON.stringify(result)}]};}
   catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({status:'rejected',error:e instanceof PhotosError?e.code:e instanceof z.ZodError?'invalid_input':'photos_failed'})}]};}
  }});
 }
 const empty=z.object({}).strict();
 register('photos_health','Read Photos access and local snapshot health. Shared Album writes are unsupported.',empty,'photos.read',a=>service.read('health',a));
 register('photos_persons','Find existing person labels using normalized partial text. Does not recognize faces.',z.object({query:z.string().max(256).optional()}).strict(),'photos.read',a=>service.read('persons',a));
 register('photos_query','Query local synced assets by existing person label, album and capture dates. from is inclusive, to exclusive; timestamps require timezone offsets. Page offsets are snapshot-relative.',querySchema,'photos.read',a=>service.read('query',a));
 register('photos_albums','List ordinary and true Shared Albums separately. Use IDs, not names, for writes.',z.object({offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(100).default(50)}).strict(),'photos.read',a=>service.read('albums',a));
 register('photos_detail','Read one scoped asset and its existing annotations.',z.object({assetId}).strict(),'photos.read',a=>service.read('detail',a));
 register('photos_preview','Return a cached preview of a selected asset. Does not download original files.',z.object({assetId}).strict(),'photos.read',a=>service.read('preview',a),true);
 register('photos_compare_album','Compare up to 50 exact source assets with an album. Metadata matches are probable, not proof; missing matches do not establish failed upload.',z.object({assetIds:z.array(assetId).min(1).max(50),albumId}).strict(),'photos.read',a=>service.read('compare',a));
 register('photos_cleanup_candidates','Page through matching Photos fingerprints, screenshots and messaging filename signals for review. None establishes disposability, expiry, exact duplicate bytes or messaging origin.',z.object({offset:z.number().int().min(0).max(1000000).default(0),limit:z.number().int().min(1).max(100).default(50)}).strict(),'photos.read',a=>service.read('cleanup',a));
 register('photos_prepare','Prepare ordinary album or metadata changes for review. Shared Album writes are unsupported. Review exact changes before apply.',z.discriminatedUnion('action',[mutationSchema.options[0],mutationSchema.options[1],mutationSchema.options[2],mutationSchema.options[3],mutationSchema.options[5],mutationSchema.options[6]]),'photos.write',a=>service.prepareRemote(a));
 register('photos_apply','Apply a reviewed operation once with explicit confirmation. Unknown outcomes require reconciliation, never blind retry with a new plan.',z.object({operationId:z.string().uuid(),confirm:z.literal(true)}).strict(),'photos.write',a=>service.applyRemote(a.operationId,a.confirm));
 register('photos_delete_prepare','Prepare deletion of exact selected assets for review, including synced-library consequences. Does not delete.',mutationSchema.refine(m=>m.action==='delete_assets','Deletion only'),'photos.delete',a=>service.prepareRemote(a));
 register('photos_delete_apply','Execute the reviewed deletion plan after user confirmation. Uses Photos deletion; never empties Recently Deleted.',z.object({operationId:z.string().uuid(),confirm:z.literal(true)}).strict(),'photos.delete',a=>service.applyRemote(a.operationId,a.confirm,true));
 register('photos_operation','Read saved operation outcome and refresh native sharing review evidence. executing is reported unknown, not retried.',z.object({operationId:z.string().uuid()}).strict(),'photos.read',a=>service.operationStatus(a.operationId));
 register('photos_review_prepare','Prepare a remote conversation review for exact comparison assets or a bounded cleanup page. Return metadata and evidence; use photos_preview to show images here. Never opens a Mac window or changes photos.',catalogSchema,'photos.read',a=>service.prepareCatalog(a));
 register('photos_review_record','Save explicit owner decisions for every exact source in a prepared remote review. Keep and undecided are preserved. Share/delete choices request separate write review, never authorize a mutation.',remoteDecisionsSchema,'photos.read',async a=>service.recordCatalog(a));
 tools.at(-1)!.tool.annotations!.readOnlyHint=false;
 register('photos_review_status','Read a pending remote review or saved exact decisions; also reconciles historical native reviews. A selection requests further review, not approval to delete or upload.',z.object({reviewId:z.string().uuid()}).strict(),'photos.read',a=>service.catalogStatus(a.reviewId));
 register('photos_review_summary','Account for up to 500 exact source IDs across saved owner reviews. Separates unreviewed, undecided, keep and further-review candidates; comparison decisions are bound to the exact album. No write approval or sharing proof.',reviewSummarySchema,'photos.read',async a=>service.reviewSummary(a));
 return {id:'photos',scopes:[{name:'photos.read',title:'Read Photos',description:'Read Photos, existing people labels and albums.',enabled:()=>enabled('photos.read')},{name:'photos.write',title:'Organize Photos',description:'Apply reviewed ordinary album and metadata changes. Shared Album writes are unsupported.',enabled:()=>enabled('photos.write')},{name:'photos.delete',title:'Delete Photos',description:'Delete specifically reviewed photos from the synced Photos library.',enabled:()=>enabled('photos.delete')}],tools};
}
