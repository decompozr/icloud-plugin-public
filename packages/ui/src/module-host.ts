import type{BundledModuleUi,ModuleUiContext,UiCopy}from'./contracts.js';
export interface UiProviderServices {copy:UiCopy;fetch(request:Request):Promise<Response>;notify(key:string,tone?:'success'|'error'|'info'):void;confirm(key:string):Promise<boolean>;accounts():ReturnType<ModuleUiContext['account']['list']>;openCredentials():void}
/** One lease per mounted contribution. No ambient shell model or automatic retries. */
export function createModuleUiContext(definition:BundledModuleUi,services:UiProviderServices,ready:(value:boolean)=>void=()=>{}){
 if(!/^[a-z][a-z0-9-]*$/.test(definition.id))throw Error('INVALID_MODULE_UI_ID');
 let mounted=true;const check=()=>{if(!mounted)throw Error('MODULE_UI_UNMOUNTED')};
 const operations=structuredClone(definition.operations??{});
 for(const operation of Object.values(operations))if(!operation.path.startsWith('/icloud/admin/'+definition.id+'/')||!new RegExp('^/icloud/admin/'+definition.id+'/[a-z0-9/_-]+$').test(operation.path)||!['GET','POST'].includes(operation.method))throw Error('INVALID_MODULE_UI_OPERATION');
 const ctx:ModuleUiContext={moduleId:definition.id,copy:services.copy,
  async request(name,input){check();const operation=Object.hasOwn(operations,name)?operations[name]:undefined;if(!operation)throw Error('UNREGISTERED_MODULE_UI_OPERATION');const origin=typeof location==='undefined'?'http://module.fixture.invalid':location.origin;const response=await services.fetch(new Request(origin+operation.path,{method:operation.method,credentials:'same-origin',cache:'no-store',...(operation.method==='POST'?{headers:{'content-type':'application/json'},body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(12000)}));if(!mounted){void response.body?.cancel();throw Error('MODULE_UI_UNMOUNTED')}return response;},
  account:{async list(){check();const rows=await services.accounts();check();return rows;},openCredentials(){check();services.openCredentials()}},
  ui:{notify(key,tone){if(mounted)services.notify(key,tone)},async confirm(key){check();const value=await services.confirm(key);check();return value;}},
  reportReady(value){if(mounted)ready(value)},
 };
 return{ctx:Object.freeze(ctx),dispose(){mounted=false}};
}
export function registeredModulePages(modules:readonly BundledModuleUi[]){
 const ids=new Set<string>(),paths=new Set<string>();const pages=[];
 for(const module of modules){if(!/^[a-z][a-z0-9-]*$/.test(module.id)||ids.has(module.id))throw Error('INVALID_MODULE_UI_ID');ids.add(module.id);
  for(const page of module.pages??[]){if(!/^[a-z][a-z0-9-]*$/.test(page.id))throw Error('INVALID_MODULE_UI_PAGE');const path='/icloud/admin/modules/'+module.id+'/'+page.id;if(paths.has(path))throw Error('DUPLICATE_MODULE_UI_PAGE');paths.add(path);pages.push({module,page,path});}
 }return pages;
}
