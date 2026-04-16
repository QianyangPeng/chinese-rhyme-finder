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

<!-- Page-transition loading bar -->
{#if $navigating}
  <div
    class="fixed top-0 left-0 z-50 h-1 bg-zinc-900 dark:bg-zinc-100"
    style="animation: loading-bar 1.5s ease-in-out infinite; width: 100%"
  ></div>
{/if}

<style>
  @keyframes loading-bar {
    0% { width: 0%; opacity: 1; }
    50% { width: 70%; opacity: 1; }
    100% { width: 100%; opacity: 0; }
  }
</style>

{@render children()}
