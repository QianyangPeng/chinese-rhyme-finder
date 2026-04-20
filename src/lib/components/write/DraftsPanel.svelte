<script lang="ts">
  /**
   * Drafts drawer — opens from the right, lists all saved drafts, lets
   * the user switch / rename / delete / create new. Backdrop click to close.
   */
  import { drafts, type Draft } from '$lib/stores/drafts.svelte';
  import { t } from '$lib/stores/lang.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
    onSelect: (id: string) => void;
    onCreate: () => void;
  }
  let { open, onClose, onSelect, onCreate }: Props = $props();

  let renamingId = $state<string | null>(null);
  let renameText = $state('');

  function formatTime(ms: number): string {
    const diff = Date.now() - ms;
    const min = Math.floor(diff / 60_000);
    if (min < 1) return t('刚刚', 'just now');
    if (min < 60) return t(`${min} 分钟前`, `${min} min ago`);
    const hr = Math.floor(min / 60);
    if (hr < 24) return t(`${hr} 小时前`, `${hr} h ago`);
    const d = Math.floor(hr / 24);
    if (d < 7) return t(`${d} 天前`, `${d} d ago`);
    return new Date(ms).toLocaleDateString();
  }

  function preview(content: string): string {
    const line = content.split('\n').find((l) => l.trim()) ?? '';
    return line.length > 24 ? line.slice(0, 24) + '…' : line;
  }

  function startRename(draft: Draft) {
    renamingId = draft.id;
    renameText = draft.title;
  }
  function commitRename() {
    if (!renamingId) return;
    drafts.update(renamingId, { title: renameText.trim() || '未命名草稿' });
    renamingId = null;
  }
  function cancelRename() { renamingId = null; }

  function confirmDelete(draft: Draft) {
    if (confirm(t(`删除「${draft.title}」？无法撤销。`, `Delete "${draft.title}"? This cannot be undone.`))) {
      drafts.remove(draft.id);
    }
  }
</script>

{#if open}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
    onclick={onClose}
  ></div>

  <!-- Drawer -->
  <aside class="fixed right-0 top-0 z-50 flex h-full w-[380px] max-w-[90vw] flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
    <header class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
      <div>
        <h3 class="text-base font-bold text-zinc-900 dark:text-zinc-100">
          {t('草稿', 'Drafts')}
        </h3>
        <p class="text-xs text-zinc-500">
          {t(`${drafts.drafts.length}/20`, `${drafts.drafts.length}/20`)}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800"
          onclick={onCreate}
        >
          + {t('新建', 'New')}
        </button>
        <button
          class="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          onclick={onClose}
          aria-label="Close"
        >✕</button>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if drafts.drafts.length === 0}
        <p class="px-6 py-12 text-center text-sm text-zinc-400">
          {t('还没有草稿。', 'No drafts yet.')}
        </p>
      {:else}
        <ul class="divide-y divide-zinc-100 dark:divide-zinc-800">
          {#each drafts.sorted as d (d.id)}
            <li
              class="group flex items-start gap-3 px-4 py-3 {d.id === drafts.currentId ? 'bg-sky-50/60 dark:bg-sky-950/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}"
            >
              <!-- Current marker -->
              <span class="mt-0.5 w-4 shrink-0 text-center text-xs {d.id === drafts.currentId ? 'text-sky-500' : 'text-zinc-300 dark:text-zinc-700'}">
                {d.id === drafts.currentId ? '●' : '○'}
              </span>

              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="min-w-0 flex-1 cursor-pointer" onclick={() => onSelect(d.id)}>
                {#if renamingId === d.id}
                  <input
                    type="text"
                    bind:value={renameText}
                    onblur={commitRename}
                    onkeydown={(e) => { if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') cancelRename(); }}
                    class="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
                  />
                {:else}
                  <p class="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{d.title}</p>
                  <p class="truncate text-xs text-zinc-500">{preview(d.content) || t('（空）', '(empty)')}</p>
                  <p class="mt-0.5 font-mono text-[10px] text-zinc-400">{formatTime(d.updatedAt)}</p>
                {/if}
              </div>

              <!-- Actions -->
              <div class="flex shrink-0 flex-col gap-1 opacity-0 group-hover:opacity-100">
                {#if renamingId !== d.id}
                  <button
                    class="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    onclick={(e) => { e.stopPropagation(); startRename(d); }}
                    title={t('重命名', 'Rename')}
                    aria-label={t('重命名', 'Rename')}
                  >✎</button>
                  <button
                    class="rounded p-1 text-zinc-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 dark:hover:text-rose-400"
                    onclick={(e) => { e.stopPropagation(); confirmDelete(d); }}
                    title={t('删除', 'Delete')}
                    aria-label={t('删除', 'Delete')}
                  >✕</button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </aside>
{/if}
