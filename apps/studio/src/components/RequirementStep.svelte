<script lang="ts">
 import {getContext,type Snippet} from 'svelte';
 import type {UiCopy} from '../contracts.js';
 const {t}=getContext<UiCopy>('copy');
 let {title,state='todo',hint='',children}:{title:string;state?:'done'|'todo'|'waiting'|'checking'|'error';hint?:string;children?:Snippet}=$props();
</script>
<details class="step" class:done={state==='done'} class:waiting={state==='waiting'} open={state==='todo'||state==='error'} data-step-state={state}>
 <summary onclick={(event)=>{if(state==='waiting'||state==='checking')event.preventDefault();}} aria-disabled={state==='waiting'||state==='checking'}>
  {#if state==='checking'}<span class="marker checking" aria-hidden="true"></span>
  {:else}<span class="marker" aria-hidden="true">{state==='done'?'✓':state==='error'?'!':''}</span>{/if}
  <span class="label">{title}</span><span class="sr-only">{t("requirementState_"+state)}</span>
  {#if state==='todo'||state==='error'}<span class="chevron" aria-hidden="true">⌄</span>{/if}
 </summary>
 {#if state!=='waiting'&&state!=='checking'}<div class="body">{#if hint}<p>{hint}</p>{/if}{@render children?.()}</div>{/if}
</details>
<style>
 .step{border:0;border-bottom:1px solid var(--ui-border);padding:0;margin:0;background:transparent}
 summary{list-style:none;display:flex;align-items:center;gap:12px;min-height:54px;padding:8px 0;cursor:pointer;font-weight:600}
 summary::-webkit-details-marker{display:none}.label{flex:1}.marker{width:22px;height:22px;border:1px solid var(--ui-border);border-radius:50%;display:grid;place-items:center;flex-shrink:0;font-size:13px;color:var(--ui-text);animation:none;transform:none}
 .done .marker{background:var(--ui-selected);border-color:transparent}.waiting{opacity:.55}.waiting summary,summary[aria-disabled=true]{cursor:default}.body{padding:0 0 18px 34px}.body p{margin:0 0 12px;color:var(--ui-muted);font-size:13px;line-height:1.5}.chevron{font-size:17px;transform:rotate(180deg)}details:not([open]) .chevron{transform:none}.marker.checking{border-top-color:var(--ui-text);animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.marker.checking{animation:none}}
</style>
