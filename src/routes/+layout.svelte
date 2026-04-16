<script lang="ts">
  import '../app.css';
  import { navigating } from '$app/stores';
  import TopNav from '$lib/components/TopNav.svelte';
  import GlobalKeyboard from '$lib/components/GlobalKeyboard.svelte';
  import KeyboardHelp from '$lib/components/KeyboardHelp.svelte';
  let { children } = $props();
</script>

<GlobalKeyboard />
<KeyboardHelp />
<TopNav />

<!-- Page-transition loading bar: thin line at top during navigation -->
{#if $navigating}
  <div class="fixed top-0 left-0 right-0 z-50 h-0.5 bg-zinc-900 dark:bg-zinc-100 animate-pulse"></div>
{/if}

{@render children()}
