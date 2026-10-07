<script lang="ts">
 import {getContext,onMount} from 'svelte';
 import {z} from 'zod';
 import type {UiCopy} from '../contracts.js';
 const {t}=getContext<UiCopy>('copy');
 const schema=z.object({helper:z.object({ready:z.literal(true),authorized:z.literal(true),localUserId:z.number(),sourceSHA256:z.string()}),homes:z.array(z.object({id:z.string(),name:z.string()})),bindings:z.array(z.object({id:z.string(),account:z.string(),home:z.string()}))});
 let status=$state<z.infer<typeof schema>>(),accounts=$state<{id:string;label?:string;user:string}[]>([]),accountId=$state(''),homeId=$state(''),confirm=$state(false),busy=$state(false),failed=$state(false);
 async function read(){busy=true;failed=false;try{const [a,b]=await Promise.all([fetch('/icloud/admin/homekit/status'),fetch('/icloud/admin/status')]);if(!a.ok||!b.ok)throw Error();status=schema.parse(await a.json());accounts=(await b.json()).accounts;accountId=accountId||accounts[0]?.id||'';homeId=homeId||status.homes[0]?.id||'';}catch{failed=true;}finally{busy=false;}}
 async function enroll(){if(!status||!confirm)return;busy=true;failed=false;try{const response=await fetch('/icloud/admin/homekit/enroll',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,homeId,confirm:true,expectedSourceSHA256:status.helper.sourceSHA256,expectedLocalUserId:status.helper.localUserId})});if(!response.ok)throw Error();confirm=false;await read();}catch{failed=true;busy=false;}}
 async function revoke(binding:{account:string;home:string}){busy=true;failed=false;try{const response=await fetch('/icloud/admin/homekit/revoke',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:binding.account,homeId:binding.home,confirm:true})});if(!response.ok)throw Error();await read();}catch{failed=true;busy=false;}}
 onMount(()=>{void read();});
</script>
<section class="card" data-testid="homekit-setup" aria-busy={busy}>
 <header class="card-header"><h2>{t('homekitTitle')}</h2><button class="secondary" disabled={busy} onclick={read}>{t('homekitRefresh')}</button></header>
 <p>{t('homekitBackgroundHelp')}</p>
 {#if failed}<p class="error" role="alert">{t('homekitUnavailable')}</p>{/if}
 {#if status}<p>{t('homekitReady')}</p>
 <label for="homekit-account">{t('homekitAccount')}</label><select id="homekit-account" bind:value={accountId} disabled={busy}>{#each accounts as account}<option value={account.id}>{account.label||account.user}</option>{/each}</select>
 <label for="homekit-home">{t('homekitHome')}</label><select id="homekit-home" bind:value={homeId} disabled={busy}>{#each status.homes as home}<option value={home.id}>{home.name}</option>{/each}</select>
 <label><input type="checkbox" bind:checked={confirm} disabled={busy}/>{t('homekitConfirm')}</label>
 <div class="actions"><button class="primary" disabled={busy||!confirm||!accountId||!homeId} onclick={enroll}>{t('homekitBind')}</button></div>
 {#if status.bindings.length}<h3>{t('homekitBindings')}</h3>{#each status.bindings as binding}<p>{status.homes.find(h=>h.id===binding.home)?.name||t('homekitHome')} <button class="secondary" disabled={busy} onclick={()=>revoke(binding)}>{t('homekitUnbind')}</button></p>{/each}{/if}
 <p class="muted">{t('homekitConsentHelp')}</p>
 {/if}
</section>
