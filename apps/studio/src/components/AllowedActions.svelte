<script lang="ts">
 import {getContext} from 'svelte';
 import type {UiCopy} from '../contracts.js';
 import type {BundledModuleUi} from '@decompozr/ui/contracts';
 import DraftSwitch from '@decompozr/ui/components/DraftSwitch.svelte';
 import AllowedAction from './AllowedAction.svelte';
 let {id,fields,definition,draft,saved,editable,dependencies,allOn,disabled,ontoggle}:{id?:string;fields:readonly {id:string;label:string;copyKey?:unknown;available?:boolean}[];definition?:BundledModuleUi;draft:Record<string,boolean>;saved:Record<string,boolean>;editable:string[];dependencies:Record<string,readonly string[]>;allOn:boolean;disabled:boolean;ontoggle:(value:boolean,key?:string)=>void}=$props();
 const {t}=getContext<UiCopy>('copy');
 const changed=$derived(editable.some(key=>!!draft[key]!==!!saved[key]));
</script>
<section class="module-actions" aria-label={t('moduleActionsShort')}>
 <header class="module-section-heading allowed-actions-heading">
  <h3>{t('moduleActionsShort')}</h3>
  <DraftSwitch label={t('allActionsShort')} aria-label={t('toggleAllActions')} pending={changed} checked={allOn} disabled={disabled||!editable.length} onchange={event=>ontoggle(event.currentTarget.checked)}/>
 </header>
 <ul class="module-action-list">
 {#each fields as field}<AllowedAction {id} {field} {definition} checked={!!draft[field.id]} pending={!!draft[field.id]!==!!saved[field.id]} disabled={disabled||field.available===false||(dependencies[field.id]??[]).some(parent=>!editable.includes(parent))} onchange={value=>ontoggle(value,field.id)}/>{:else}<li>{t('emptyValue')}</li>{/each}
 </ul>
</section>
