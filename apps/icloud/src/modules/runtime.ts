import type {Tool,CallToolResult} from '@modelcontextprotocol/sdk/types.js';
export interface ScopeDescriptor {name:string;title:string;description:string;descriptionLocales?:Readonly<Record<string,string>>;enabled:()=>boolean}
export interface RegisteredTool {
 tool:Tool&{securitySchemes?:Array<{type:'oauth2';scopes:string[]}>};requiredScopes:readonly string[];enabled:()=>boolean;
 run:(input:unknown)=>Promise<CallToolResult>;
 validateIntent?:(input:unknown)=>CallToolResult|undefined;
}
export interface RuntimeModule {id:string;scopes:readonly ScopeDescriptor[];tools:readonly RegisteredTool[];start?:()=>Promise<void>;dispose?:()=>Promise<void>}
/** Static application composition. Registration is complete before startup. */
export class ModuleRuntime {
 private readonly modules:RuntimeModule[]=[];
 private readonly tools=new Map<string,RegisteredTool>();
 private readonly scopes=new Map<string,ScopeDescriptor>();
 private state:'registering'|'starting'|'running'|'disposing'|'disposed'='registering';
 private started:RuntimeModule[]=[];
 private disposing?:Promise<void>;
 private active=0;private readonly idle=new Set<()=>void>();
 register(module:RuntimeModule):this {
  if(this.state!=='registering')throw Error('Module registration is closed');
  if(!/^[a-z][a-z0-9]*$/.test(module.id)||this.modules.some(m=>m.id===module.id))throw Error('Invalid or duplicate module ID');
  const names=new Set<string>(),toolNames=new Set<string>();
  for(const scope of module.scopes){if(!scope.name.startsWith(module.id+'.')||!new RegExp(`^${module.id}\\.[a-z][a-z0-9_.]*$`).test(scope.name)||this.scopes.has(scope.name)||names.has(scope.name))throw Error('Invalid or duplicate module scope');names.add(scope.name);}
  for(const entry of module.tools){
   if(!new RegExp(`^${module.id}_[a-z][a-z0-9_]*$`).test(entry.tool.name)||this.tools.has(entry.tool.name)||toolNames.has(entry.tool.name))throw Error('Invalid or duplicate module tool');
   if(entry.requiredScopes.length===0||entry.requiredScopes.some(scope=>scope!=='offline_access'&&!names.has(scope)))throw Error('Tool scope must be owned by its module');
   toolNames.add(entry.tool.name);
  }
  this.modules.push(module);for(const scope of module.scopes)this.scopes.set(scope.name,scope);for(const entry of module.tools)this.tools.set(entry.tool.name,entry);return this;
 }
 get scopeDescriptors():readonly ScopeDescriptor[]{return [...this.scopes.values()];}
 get declaredScopes():string[]{return [...this.scopes.keys(),'offline_access'];}
 get allowedScopes():string[]{return [...this.scopes.values()].filter(s=>s.enabled()).map(s=>s.name).concat('offline_access');}
 listTools():Tool[]{return [...this.tools.values()].filter(entry=>this.available(entry)).map(entry=>entry.tool);}
 tool(name:string):RegisteredTool|undefined{const entry=this.tools.get(name);return entry&&this.available(entry)?entry:undefined;}
 private available(entry:RegisteredTool){return entry.enabled()&&entry.requiredScopes.every(scope=>scope==='offline_access'||this.scopes.get(scope)?.enabled());}
 async invoke(entry:RegisteredTool,input:unknown):Promise<CallToolResult>{
  if(this.state==='disposing'||this.state==='disposed')throw Error('Runtime draining');
  this.active++;try{return await entry.run(input);}finally{this.active--;if(this.active===0){for(const resolve of this.idle)resolve();this.idle.clear();}}
 }
 async start():Promise<void>{
  if(this.state!=='registering')throw Error('Runtime already started');this.state='starting';
  try{for(const module of this.modules){this.started.push(module);await module.start?.();}this.state='running';}catch(error){try{await this.dispose();}catch{}throw error;}
 }
 dispose():Promise<void>{
  if(this.disposing)return this.disposing;
  this.state='disposing';
  this.disposing=(async()=>{if(this.active)await new Promise<void>(resolve=>this.idle.add(resolve));const errors:unknown[]=[];for(const module of this.started.splice(0).reverse())try{await module.dispose?.();}catch(error){errors.push(error);}this.state='disposed';if(errors.length)throw new AggregateError(errors,'Module disposal failed');})();return this.disposing;
 }
}
