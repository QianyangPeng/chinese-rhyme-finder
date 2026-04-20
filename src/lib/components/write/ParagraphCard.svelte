<script lang="ts">
  /**
   * One paragraph card = self-contained editor (left) + anchor stack (right).
   *
   * Handles:
   *   - Text editing + onchange propagation
   *   - Auto-anchor detection on text change (merged with existing
   *     manual anchors by the parent)
   *   - Selection tracking so "add selection as anchor" button appears
   *   - Insert candidate into editor at current cursor position
   */
  import { tick } from 'svelte';
  import type { Anchor, GroupedAnchor, ToneMode } from '$lib/core/write/anchors';
  import { makeManualAnchor } from '$lib/core/write/anchors';
  import AnchorCard from './AnchorCard.svelte';
  import { t } from '$lib/stores/lang.svelte';

  interface Props {
    paragraphId: string;
    text: string;
    /** All anchors for this paragraph (auto + manual, already merged
     *  and assigned rhyme groups by parent). */
    anchors: readonly GroupedAnchor[];
    /** True when this paragraph has the focus (editor or clicked). Only
     *  the focused paragraph actually fetches candidates for its anchors
     *  — saves work when a draft has many paragraphs. */
    focused: boolean;
    /** Paragraph index (0-based) for display purposes. */
    index: number;
    hoveredKey: string | null;

    onTextChange: (text: string) => void;
    onFocus: () => void;
    onManualAnchorsChange: (anchors: Anchor[]) => void;
    onAnchorToneMode: (anchorId: string, toneMode: ToneMode) => void;
    onDelete: () => void;
    onHoverKey: (key: string | null) => void;
  }
  let {
    paragraphId,
    text,
    anchors,
    focused,
    index,
    hoveredKey,
    onTextChange,
    onFocus,
    onManualAnchorsChange,
    onAnchorToneMode,
    onDelete,
    onHoverKey
  }: Props = $props();

  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  /** Current selection in the textarea — used to show the "add anchor"
   *  button when there's a non-empty range. */
  let selStart = $state(0);
  let selEnd = $state(0);

  const selectedText = $derived(text.slice(selStart, selEnd));
  const hasSelection = $derived(selStart !== selEnd && selectedText.trim().length > 0);

  function onInput(e: Event) {
    const v = (e.target as HTMLTextAreaElement).value;
    onTextChange(v);
  }

  function trackSelection() {
    if (!textareaEl) return;
    selStart = textareaEl.selectionStart ?? 0;
    selEnd = textareaEl.selectionEnd ?? selStart;
  }

  function addAnchorFromSelection() {
    const newAnchor = makeManualAnchor(text, selStart, selEnd, 'exact');
    if (!newAnchor) return;
    // Dedupe: if an anchor with same text at same offsets already exists,
    // skip. Otherwise append.
    const already = anchors.some(
      (a) => !a.auto && a.start === newAnchor.start && a.end === newAnchor.end
    );
    if (already) return;
    onManualAnchorsChange([
      ...anchors.filter((a) => !a.auto),
      newAnchor
    ]);
  }

  function removeAnchor(anchorId: string) {
    onManualAnchorsChange(anchors.filter((a) => !a.auto && a.id !== anchorId));
  }

  async function insertAtCursor(insertion: string) {
    if (!textareaEl) return;
    const start = textareaEl.selectionStart ?? text.length;
    const end = textareaEl.selectionEnd ?? start;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const newText = before + insertion + after;
    onTextChange(newText);
    await tick();
    if (textareaEl) {
      const pos = start + insertion.length;
      textareaEl.focus();
      textareaEl.setSelectionRange(pos, pos);
      selStart = pos;
      selEnd = pos;
    }
  }

  /** Lightweight color palette for the paragraph's left-edge color bar.
   *  Cycles by index so consecutive paragraphs are visually distinct. */
  const BARS = [
    'bg-sky-400', 'bg-emerald-400', 'bg-amber-400',
    'bg-rose-400', 'bg-violet-400', 'bg-cyan-400',
    'bg-pink-400', 'bg-lime-400'
  ];
  const bar = $derived(BARS[index % BARS.length]);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<article
  class="relative rounded-xl border {focused
    ? 'border-sky-400 dark:border-sky-600 shadow-md ring-1 ring-sky-200 dark:ring-sky-900/50'
    : 'border-zinc-200 dark:border-zinc-800'} bg-white dark:bg-zinc-900 overflow-hidden transition"
  onclick={onFocus}
>
  <!-- Colored left edge (paragraph identity) -->
  <span class="absolute left-0 top-0 bottom-0 w-1 {bar}"></span>

  <div class="grid gap-0 md:grid-cols-[1fr_22rem]">
    <!-- ── Editor side ──────────────────────────────────────── -->
    <div class="border-b md:border-b-0 md:border-r border-zinc-100 dark:border-zinc-800 p-3 pl-5">
      <div class="mb-2 flex items-baseline justify-between gap-2">
        <span class="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
          {t(`段落 ${index + 1}`, `Paragraph ${index + 1}`)}
        </span>
        <button
          class="rounded p-1 text-zinc-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 dark:hover:text-rose-400"
          title={t('删除本段', 'Delete paragraph')}
          onclick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label={t('删除本段', 'Delete paragraph')}
        >×</button>
      </div>
      <textarea
        bind:this={textareaEl}
        value={text}
        oninput={onInput}
        onkeyup={trackSelection}
        onclick={trackSelection}
        onselect={trackSelection}
        onfocus={onFocus}
        placeholder={t('在这里写这一段歌词…', 'Write this verse here…')}
        rows={Math.max(3, text.split('\n').length)}
        spellcheck="false"
        class="w-full resize-none rounded-md border border-transparent bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 font-sans text-base leading-7 text-zinc-900 dark:text-zinc-100 outline-none focus:border-sky-400 dark:focus:border-sky-600 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
      ></textarea>

      {#if hasSelection}
        <button
          class="mt-2 rounded-md border border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/60"
          onclick={(e) => { e.stopPropagation(); addAnchorFromSelection(); }}
        >
          {t(`+ 把「${selectedText}」加为押韵锚点`, `+ Add "${selectedText}" as rhyme anchor`)}
        </button>
      {:else}
        <p class="mt-2 text-[11px] text-zinc-400">
          {t('选中句中的一个词，可以把它加为押韵锚点', 'Select a word in the line to add it as a rhyme anchor')}
        </p>
      {/if}
    </div>

    <!-- ── Anchor sidebar ───────────────────────────────────── -->
    <div class="p-3 space-y-2">
      {#if anchors.length === 0}
        <p class="py-6 text-center text-xs text-zinc-400">
          {t('开始写一行，最后一个词会自动成为押韵锚点', 'Write a line; its last word auto-anchors')}
        </p>
      {:else}
        {#each anchors as anchor (anchor.id)}
          <AnchorCard
            {anchor}
            active={focused}
            hoveredKey={hoveredKey}
            onToneModeChange={(tm) => onAnchorToneMode(anchor.id, tm)}
            onRemove={() => removeAnchor(anchor.id)}
            onInsertCandidate={insertAtCursor}
            onHoverKey={onHoverKey}
          />
        {/each}
      {/if}
    </div>
  </div>
</article>
