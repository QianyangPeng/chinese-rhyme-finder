<script lang="ts">
  import { onMount } from 'svelte';

  let open = $state(false);

  function isTypingContext(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      target.isContentEditable
    );
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      open = false;
      return;
    }
    if (e.key === '?' && !isTypingContext(e.target)) {
      e.preventDefault();
      open = !open;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  const SHORTCUTS: ReadonlyArray<{ keys: string[]; label: string }> = [
    { keys: ['h'], label: '回主页' },
    { keys: ['d'], label: 'Discover' },
    { keys: ['s'], label: 'Search' },
    { keys: ['a'], label: 'Analyze' },
    { keys: ['/'], label: '聚焦当前页的输入框' },
    { keys: ['?'], label: '显示 / 隐藏本面板' },
    { keys: ['Esc'], label: '关闭本面板' }
  ];
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
    role="presentation"
    onclick={() => (open = false)}
  >
    <div
      class="w-full max-w-sm rounded-lg border border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-800 p-5 shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="键盘快捷键"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">键盘快捷键</h2>
        <button
          class="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          aria-label="Close"
          onclick={() => (open = false)}
        >
          ✕
        </button>
      </div>
      <dl class="space-y-2 text-sm">
        {#each SHORTCUTS as { keys, label } (label)}
          <div class="flex items-center justify-between gap-3">
            <dt class="text-zinc-600 dark:text-zinc-400">{label}</dt>
            <dd class="flex gap-1">
              {#each keys as k (k)}
                <kbd
                  class="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-700 dark:text-zinc-300"
                >
                  {k}
                </kbd>
              {/each}
            </dd>
          </div>
        {/each}
      </dl>
      <p class="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-3 text-xs text-zinc-500">
        再按 <kbd class="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-xs">?</kbd> 或
        <kbd class="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-xs">Esc</kbd> 关闭。
      </p>
    </div>
  </div>
{/if}
