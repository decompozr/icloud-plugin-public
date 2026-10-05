import {i18n} from '../i18n/index.js';
import {z} from 'zod';
/** Explicit clicks launch settings on the server Mac; status checks never prompt. */
export function initializePhotosSetup(){
 const section=document.getElementById('photos-setup');if(!section)return;
 const status=document.getElementById('photos-status')!;
 const zh=()=>i18n.language==='zh-TW';
 let busy=false;let last:unknown;let checkedAt:string|undefined;let failed=false;let lastAttempt=0;
 const schema=z.object({libraryReadable:z.boolean(),libraryStatus:z.string(),authorization:z.enum(['not_requested','restricted','denied','authorized','limited','unavailable']),ready:z.boolean()});
 const message=(en:string,cn:string)=>status.textContent=zh()?cn:en;
 function translate(){for(const node of section!.querySelectorAll<HTMLElement>('[data-photos-en]'))node.textContent=(zh()?node.dataset.photosZh:node.dataset.photosEn)??'';render();}
 function render(){if(!last)return;const parsed=schema.safeParse(last);if(!parsed.success)return;const v=parsed.data;
  if(v.ready)message('Library read and Photos access are ready. Automation may still be requested for metadata edits.','照片庫讀取與照片存取已就緒；編輯中繼資料時仍可能要求自動化權限。');
  else if(!v.libraryReadable)message(v.libraryStatus==='permission_required'?'Library access is denied. Enable Full Disk Access, then restart the host app.':'The selected library is unavailable. Check library setup.','照片庫目前無法讀取；請檢查照片庫設定與完整磁碟存取權，授權後重開服務 App。');
  else {const en={not_requested:'Request Photos access, then choose full access.',denied:'Photos access is denied. Open Photos Privacy Settings to allow it.',limited:'Limited Photos access is insufficient. Choose full access.',restricted:'Photos access is restricted by system policy.',unavailable:'Photos helper is unavailable. Complete helper setup.',authorized:'Photos access is ready.'};const cn={not_requested:'請要求照片存取，並選擇完整存取。',denied:'照片存取遭拒絕，請開啟照片隱私設定並允許存取。',limited:'有限存取不足以管理照片庫，請選擇完整存取。',restricted:'照片存取受到系統政策限制。',unavailable:'照片 helper 尚未就緒，請先完成 helper 設定。',authorized:'照片存取已就緒。'};message(en[v.authorization],cn[v.authorization]);}
  if(checkedAt)status.textContent+=' · '+(zh()?'檢查時間：':'Checked: ')+new Date(checkedAt).toLocaleString();
  if(failed)status.textContent=(zh()?'無法重新檢查。上次結果：':'Could not refresh. Previous result: ')+status.textContent;
 }
 async function check(){const response=await fetch('/icloud/admin/photos/status',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error();last=schema.parse(await response.json());checkedAt=new Date().toISOString();failed=false;render();}
 async function run(action?:string){if(busy||document.getElementById('photos-onboarding')?.hidden)return;busy=true;lastAttempt=Date.now();for(const b of section!.querySelectorAll<HTMLButtonElement>('button'))b.disabled=true;
  try{if(action){const r=await fetch('/icloud/admin/photos/action',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action}),signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();message('Opened on the service Mac. Allow access there, then check permissions again.','已在服務所在的 Mac 開啟。請在該 Mac 允許存取，再按重新檢查權限。');}else await check();}
  catch{failed=true;if(last){render();return;}message('Could not check or open permissions. Sign in as owner and verify the helper is installed.','無法檢查或開啟權限，請確認已登入擁有者帳號且 helper 已安裝。');}
  finally{busy=false;for(const b of section!.querySelectorAll<HTMLButtonElement>('button'))b.disabled=false;}
 }
 section.querySelectorAll<HTMLElement>('[data-photos-action]').forEach(b=>b.addEventListener('click',()=>void run(b.dataset.photosAction)));
 document.getElementById('photos-recheck')?.addEventListener('click',()=>void run());
 document.getElementById('language')?.addEventListener('change',translate);
 i18n.on('languageChanged',translate);
 window.addEventListener('photos-enrolled',()=>{const wrapper=document.getElementById('photos-onboarding');if(wrapper)wrapper.hidden=false;void run();});
 window.addEventListener('focus',()=>{if(!document.hidden&&Date.now()-lastAttempt>=30000)void run();});translate();void run();
}
