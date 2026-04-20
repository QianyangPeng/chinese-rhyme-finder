<script lang="ts">
  /**
   * One paragraph — the editor + line-num gutter + color bar.
   *
   * Candidates used to live in a 22rem sidebar here; they were moved
   * to a page-level right panel (v3) so the editor can span the full
   * available width. The focused paragraph drives what the right panel
   * shows.
   *
   * Selection → "+ 加为押韵锚点" floating button is handled here since
   * it needs direct access to the textarea's selectionStart/End.
   */
  import type { Anchor, GroupedAnchor } from '$lib/core/write/anchors';
  import { makeManualAnchor } from '$lib/core/write/anchors';
  import { rhymeColor } from '$lib/util/rhymeColors';
  import { t } from '$lib/stores/lang.svelte';

  interface Props {
    paragraphId: string;
    text: string;
    /** Already-grouped anchors for THIS paragraph. Drives coloring. */
    anchors: readonly GroupedAnchor[];
    /** True when this paragraph is the one whose anchors fill the
     *  right candidate panel. */
    focused: boolean;
    /** 0-based index — picks a color slot for the paragraph bar. */
    index: number;

    onTextChange: (text: string) => void;
    onFocus: () => void;
    onManualAnchorsChange: (anchors: Anchor[]) => void;
    onDelete: () => void;
  }
  let {
    paragraphId,
    text,
    anchors,
    focused,
    index,
    onTextChange,
    onFocus,
    onManualAnchorsChange,
    onDelete
  }: Props = $props();

  // ── Selection tracking (for "+ add anchor" button) ─────────────
  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let selStart = $state(0);
  let selEnd = $state(0);

  const selectedText = $derived(text.slice(selStart, selEnd));
  /** Only show the "+ add" button when the selection is non-empty and
   *  entirely CJK (matches `makeManualAnchor`'s accept rule). */
  const hasSelection = $derived(
    selStart !== selEnd &&
    selectedText.trim().length > 0 &&
    /^[\u4e00-\u9fff\u3400-\u4dbf]+$/.test(selectedText)
  );

  function onInput(e: Event) {
    onTextChange((e.target as HTMLTextAreaElement).value);
  }
  function trackSelection() {
    if (!textareaEl) return;
    selStart = textareaEl.selectionStart ?? 0;
    selEnd = textareaEl.selectionEnd ?? selStart;
  }

  function addAnchorFromSelection() {
    const newAnchor = makeManualAnchor(text, selStart, selEnd, 'exact');
    if (!newAnchor) return;
    // v1 dedup only; P4 will add overlap-replace.
    const already = anchors.some(
      (a) => !a.auto && a.start === newAnchor.start && a.end === newAnchor.end
    );
    if (already) return;
    onManualAnchorsChange([
      ...anchors.filter((a) => !a.auto),
      newAnchor
    ]);
  }

  // ── Paragraph-identity color bar (reuses rhyme palette) ─────────
  const bar = $derived(rhymeColor(index));

  // ── Line count drives gutter rendering ──────────────────────────
  const lineCount = $derived(Math.max(1, text.split('\n').length));

  // ── Expand / collapse ───────────────────────────────────────────
  let expanded = $state(true);
  function toggleExpand(e: MouseEvent) {
    e.stopPropagation();
    expanded = !expanded;
  }

  /** Preview line for collapsed state (first non-empty line, up to 24 chars). */
  const preview = $derived(
    text.trim().split('\n').filter((l) => l.trim())[0]?.slice(0, 24) ?? ''
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<article
  class="border-b border-zinc-100 dark:border-zinc-800 transition-colors {focused
    ? 'bg-zinc-50/50 dark:bg-zinc-900/40'
    : ''}"
  onclick={onFocus}
>
  <div class="flex items-stretch">
    <!-- Color bar (paragraph identity) -->
    <div class="flex-shrink-0" style="width: 4px; background: {bar.border};" aria-hidden="true"></div>

    {#if expanded}
      <!-- Line-num gutter: right next to color bar -->
      <div
        class="flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800"
        style="width: 32px; background: {bar.bg};"
        aria-hidden="true"
      >
        <!-- Header-height spacer -->
        <div style="height: 32px;"></div>
        <!-- Line numbers. Each row matches the textarea's 28px line-height. -->
        <div class="font-mono text-[10px] text-zinc-400" style="padding-top: 8px;">
          {#each Array(lineCount) as _, i (i)}
            <div
              style="height: 28px; line-height: 28px; text-align: right; padding-right: 6px;"
            >{i + 1}</div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Content column -->
    <div class="min-w-0 flex-1">
      <!-- Paragraph header: expand/collapse + label + delete -->
      <div
        class="flex items-center justify-between gap-2 px-3 text-[11px]"
        style="height: 32px;"
      >
        <button
          class="flex items-center gap-1 text-left hover:text-zinc-900 dark:hover:text-zinc-100"
          onclick={toggleExpand}
          aria-label={expanded ? t('折叠段落', 'Collapse') : t('展开段落', 'Expand')}
        >
          <span class="text-[10px] text-zinc-500">{expanded ? '▾' : '▸'}</span>
          <span class="font-medium text-zinc-700 dark:text-zinc-200">
            {t(`段落 ${index + 1}`, `Paragraph ${index + 1}`)}
          </span>
          {#if !expanded}
            <span class="text-zinc-400">
              · {lineCount} {t('行', 'lines')}{#if preview} · {preview}…{/if}
            </span>
          {/if}
        </button>
        <button
          class="p-1 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400"
          title={t('删除本段', 'Delete paragraph')}
          onclick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label={t('删除本段', 'Delete paragraph')}
        >×</button>
      </div>

      {#if expanded}
        <!-- Textarea zone -->
        <div class="relative">
          <textarea
            id="paragraph-textarea-{paragraphId}"
            bind:this={textareaEl}
            value={text}
            oninput={onInput}
            onkeyup={trackSelection}
            onclick={trackSelection}
            onselect={trackSelection}
            onfocus={onFocus}
            placeholder={t('在这里写…', 'Write here…')}
            rows={lineCount}
            spellcheck="false"
            class="block w-full resize-none border-0 bg-transparent px-3 pb-2 font-sans text-[16px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            style="line-height: 28px; padding-top: 8px;"
          ></textarea>

          {#if hasSelection}
            <!-- Floating "+ 加为押韵锚点" button, top-right of textarea -->
            <div class="pointer-events-none absolute right-3 top-1 z-10">
              <button
                class="pointer-events-auto rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500"
                onclick={(e) => { e.stopPropagation(); addAnchorFromSelection(); }}
              >
                + {t(`加「${selectedText}」为锚点`, `Add "${selectedText}"`)}
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</article>
