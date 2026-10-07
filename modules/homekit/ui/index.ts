import Requirements from './Requirements.svelte';
import type{BundledModuleUi}from'../../../packages/ui/src/contracts.js';
export const moduleUi:BundledModuleUi={id:'homekit',requirement:'native',Requirements,scopeCopy:{"homekit.read": "homekitRead", "homekit.control": "homekitControl", "homekit.scenes": "homekitScenes", "homekit.automations": "homekitAutomations"},unavailableCopy:field=>field==='control'?'homekitControlDisabled':'homekitAutomationDisabled'};
