<script lang="ts">
 import type{Snippet}from'svelte';
 import{spacing}from'../design-system/spacing.js';
 import{borderWidth}from'../design-system/visualMetrics.js';
 import{typographyStyle}from'../design-system/typography.js';
 let{title,tools,children}:{title:string;tools?:Snippet;children?:Snippet}=$props();
</script>
<section style:--section-gap={spacing[6]} style:--row-gap={spacing[4]} style:border-top={`${borderWidth} solid var(--ui-border)`}>
 <header><h2 style={typographyStyle('label')}>{title}</h2>{#if tools}{@render tools()}{/if}</header>
 <div class="content">{@render children?.()}</div>
</section>
<style>
 section{margin-top:var(--section-gap);padding-top:var(--section-gap)}
 header{display:flex;align-items:center;justify-content:space-between;gap:var(--row-gap)}
 h2{margin:0}
 .content{display:flex;flex-direction:column;align-items:stretch;gap:var(--row-gap);margin-top:var(--row-gap)}
</style>
