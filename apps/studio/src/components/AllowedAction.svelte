<script lang="ts">
 import {getContext} from 'svelte';
 import type {UiCopy} from '../contracts.js';
 import type {BundledModuleUi} from '@decompozr/ui/contracts';
 import {scopeCopy} from '../lib/bundled-modules.js';
 import FieldLabel from '@decompozr/ui/design-system/FieldLabel.svelte';
 import DraftSwitch from '@decompozr/ui/components/DraftSwitch.svelte';
 let {id,field,definition,checked,pending,disabled,onchange}:{id?:string;field:{id:string;label:string;copyKey?:unknown;available?:boolean};definition?:BundledModuleUi;checked:boolean;pending:boolean;disabled:boolean;onchange:(value:boolean)=>void}=$props();
 const {t}=getContext<UiCopy>('copy');
 const inputId=$derived('scope-'+id+'-'+field.id);
 const label=$derived(scopeCopy[id+'.'+field.id]?t(scopeCopy[id+'.'+field.id]):typeof field.copyKey==='string'?t(field.copyKey):field.label);
 const descriptionKey=$derived(definition?.actionDescriptions?.[field.id]);
</script>
<li class="module-action-row">
 <div class="module-action-copy"><FieldLabel for={inputId}>{label}</FieldLabel>
 {#if descriptionKey}<p id={inputId+'-description'}>{t(descriptionKey)}</p>{/if}
 {#if field.available===false}<p class="module-unavailable">{t(definition?.unavailableCopy?.(field.id)??'requirementsMissing')}</p>{/if}</div>
 <DraftSwitch id={inputId} label="" aria-label={label} aria-describedby={descriptionKey?inputId+'-description':undefined} {checked} {pending} {disabled} onchange={event=>onchange(event.currentTarget.checked)}/>
</li>
