import Requirements from './Requirements.svelte';
import type{BundledModuleUi}from'../../../packages/ui/src/contracts.js';
export const moduleUi:BundledModuleUi={id:'photos',requirement:'native',Requirements,scopeCopy:{"photos.read": "photosRead", "photos.write": "photosWrite", "photos.delete": "photosDelete"},requirementsTitleKey:'photosPermissions',fieldHint:field=>field==='delete'?'photosDeleteHelp':undefined,unavailableCopy:()=> 'photosCapabilityUnavailable'};
