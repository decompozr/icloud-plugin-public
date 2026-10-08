import Requirements from './Requirements.svelte';
import type{BundledModuleUi}from'@decompozr/ui/contracts';
export const moduleUi:BundledModuleUi={id:'mail',requirement:'credential',Requirements,scopeCopy:{"mail.read": "capabilityRead", "mail.write": "capabilityWrite", "mail.send": "capabilitySend", "mail.unsubscribe": "capabilityUnsubscribe"},presentationMetadata:true,title:'Mail'};
