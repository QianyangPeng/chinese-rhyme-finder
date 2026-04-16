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

<!-- Page-transition overlay: covers old content during route switch -->
{#if $navigating}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm">
    <div class="flex flex-col items-center gap-3 text-zinc-500">
      <div
        class="h-8 w-8 rounded-full border-[3px] border-zinc-200 dark:border-zinc-700 border-t-zinc-600 dark:border-t-zinc-300"
        style="animation: spin 0.7s linear infinite"
      ></div>
      <p class="text-sm">加载中…</p>
    </div>
  </div>
{/if}

{@render children()}
