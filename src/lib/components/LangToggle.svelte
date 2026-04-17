<script lang="ts">
  import { lang } from '$lib/stores/lang.svelte';
</script>

<button
  onclick={() => lang.toggle()}
  class="rounded px-2 py-1.5 font-mono text-[11px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
  title={lang.current === 'zh' ? 'Switch to English' : '切换到中文'}
  aria-label={lang.current === 'zh' ? 'Switch to English' : '切换到中文'}
>
  {lang.current === 'zh' ? 'EN' : '中'}
</button>
