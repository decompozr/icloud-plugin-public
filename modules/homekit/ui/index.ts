import Requirements from './Requirements.svelte';
import type{BundledModuleUi}from'@decompozr/ui/contracts';
export const moduleUi:BundledModuleUi={id:'homekit',requirement:'native',Requirements,scopeCopy:{"homekit.read": "homekitRead", "homekit.control": "homekitControl", "homekit.scenes": "homekitScenes", "homekit.automations": "homekitAutomations"},unavailableCopy:field=>field==='control'?'homekitControlDisabled':'homekitAutomationDisabled'};
