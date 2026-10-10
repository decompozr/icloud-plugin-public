<script lang="ts">
 import {getContext} from 'svelte';
 import type {UiCopy} from '../contracts.js';
 import type {AdminModel} from '../lib/admin-model.svelte.js';
 import {scopeCopy} from '../lib/admin-model.svelte.js';
 import {bundledModules} from '../lib/bundled-modules.js';
 import ModuleNotices from '@decompozr/ui/components/ModuleNotices.svelte';
 import Tag from '@decompozr/ui/design-system/Tag.svelte';
 import ModuleSwitch from '@decompozr/ui/components/ModuleSwitch.svelte';
 import StatusMarker from '@decompozr/ui/components/StatusMarker.svelte';
 import ActionButton from '@decompozr/ui/components/ActionButton.svelte';
 let {model,module,openModule}:{model:AdminModel;module:{id:string;title:string};openModule:(id:string,enable?:boolean)=>void}=$props();
 const {t}=getContext<UiCopy>('copy');
 const policy=$derived(model.saved[module.id]);
</script>
        <div class="module-summary">
          <div>
            <h3 class="capability-title"><StatusMarker dot state={!policy || model.dashboardFailed ? 'unknown' : Object.values(policy).some(Boolean) ? 'ready' : 'unknown'} label={t(!policy || model.dashboardFailed ? 'unknownValue' : Object.values(policy).some(Boolean) ? 'moduleEnabled' : 'moduleDisabled')}/>{module.title}</h3>
            <div class="module-statuses">
              {#each Object.entries(policy ?? {}).filter(([, enabled]) => enabled) as [key]}
                <Tag label={t(scopeCopy[module.id + "." + key] ?? key)} />
              {/each}
            </div>
            <ModuleNotices moduleId={module.id} notices={bundledModules.find(value=>value.id===module.id)?.notices??[]} />
          </div>
          <div class="actions">
            <ModuleSwitch
              label={t("moduleEnable") + " " + module.title}
              enabled={!!policy && Object.values(policy).some(Boolean)}
              disabled={!model.state.enrolled || model.busy || !policy}
              onchange={(enable) => openModule(module.id, enable)}
            />
            <ActionButton
              icon="settings"
              label={t("moduleConfigure") + " " + module.title}
              disabled={!model.state.enrolled || model.busy}
              onclick={() => openModule(module.id)}
            />
          </div>
        </div>