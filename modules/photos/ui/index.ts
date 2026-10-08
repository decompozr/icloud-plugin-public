import Section from './PhotosSetup.svelte';
import type{BundledModuleUi}from'@decompozr/ui/contracts';
export const moduleUi:BundledModuleUi={id:'photos',requirement:'native',Section,operations:{"status": {"path": "/icloud/admin/photos/status", "method": "GET"}, "action": {"path": "/icloud/admin/photos/action", "method": "POST"}},scopeCopy:{"photos.read": "photosRead", "photos.write": "photosWrite", "photos.delete": "photosDelete"},requirementsTitleKey:'photosPermissions',fieldHint:field=>field==='delete'?'photosDeleteHelp':undefined,unavailableCopy:()=> 'photosCapabilityUnavailable'};
