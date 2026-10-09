<script lang="ts">
 import Switch from '../design-system/Switch.svelte';
 import type {HTMLInputAttributes} from 'svelte/elements';
 let {pending=false,...rest}:Omit<HTMLInputAttributes,'type'|'size'> & {label:string;pending?:boolean}=$props();
</script>
<span class="draft-switch" data-pending={pending}><Switch {...rest}/></span>
