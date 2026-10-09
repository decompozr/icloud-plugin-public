<script lang="ts">
 import Menu from '../design-system/Menu.svelte';
 import GlobeIcon from './GlobeIcon.svelte';
 import type {MenuItem} from '../design-system/menu.js';
 let {label,items}:{label:string;items:MenuItem[]}=$props();
</script>
<span class="globe-menu" title={label}>
 <!-- Keep the pinned Menu's icon-sized trigger and keyboard/focus behavior.
      The project-owned globe overlays its hidden placeholder glyph. -->
 <Menu {label} {items} icon="circle-dot" compact/>
 <span class="globe-menu-glyph"><GlobeIcon/></span>
</span>
