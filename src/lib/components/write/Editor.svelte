<script lang="ts">
  /**
   * Multi-line text editor with a synced left-side label column.
   *
   * Uses a plain <textarea> for bulletproof IME / paste / undo behavior.
   * A sibling <div> column on the left shows per-line role + match
   * state badges (A ★ / A ✓ / A ~ / A ✗ / —). It mirrors scroll position
   * and line-height so badges stay aligned with their lines.
   */
  import type { LineMatch } from '$lib/core/write/scheme';
  import { t } from '$lib/stores/lang.svelte';

  interface Props {
    text: string;
    placeholder?: string;
    lineMatches: readonly LineMatch[];
    /** Index of the line the cursor is on. */
    activeLineIndex: number;
    /** Hide labels / full-width editor. */
    focusMode: boolean;
    onTextChange: (newText: string) => void;
    onActiveLineChange: (i: number) => void;
    /** Special keys bubble up to the page for Tab-cycle / Esc handling. */
    onSpecialKey?: (key: 'tab' | 'escape' | 'save') => boolean;
    /** Binding to the underlying textarea (for programmatic focus / value edits). */
    textareaRef?: HTMLTextAreaElement | null;
  }
  let {
    text,
    placeholder,
    lineMatches,
    activeLineIndex,
    focusMode,
    onTextChange,
    onActiveLineChange,
    onSpecialKey,
    textareaRef = $bindable(null)
  }: Props = $props();

  // ── State ────────────────────────────────────────────────────────────
  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let labelColEl = $state<HTMLDivElement | null>(null);

  // expose the element to parent via bindable
  $effect(() => { textareaRef = textareaEl; });

  // Sync scroll between textarea and label column.
  function onScroll() {
    if (textareaEl && labelColEl) {
      labelColEl.scrollTop = textareaEl.scrollTop;
    }
  }

  // Figure out which line the cursor is on from selectionStart.
  function updateActiveLine() {
    if (!textareaEl) return;
    const pos = textareaEl.selectionStart ?? 0;
    const before = text.slice(0, pos);
    const line = before.split('\n').length - 1; // 0-based
    if (line !== activeLineIndex) onActiveLineChange(line);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Tab' && !e.shiftKey) {
      // Only intercept Tab when cursor is at line end — otherwise let
      // Tab do its native "focus out of textarea" job for a11y.
      if (textareaEl && isCursorAtLineEnd(textareaEl)) {
        const handled = onSpecialKey?.('tab');
        if (handled) e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      onSpecialKey?.('escape');
    } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      if (onSpecialKey?.('save')) e.preventDefault();
    }
  }

  function isCursorAtLineEnd(el: HTMLTextAreaElement): boolean {
    const pos = el.selectionStart ?? 0;
    // At end-of-string or next char is a newline
    return pos >= el.value.length || el.value[pos] === '\n';
  }

  function handleInput(e: Event) {
    const newText = (e.target as HTMLTextAreaElement).value;
    onTextChange(newText);
    updateActiveLine();
  }

  // Selection-change events fire on click / arrow-key / programmatic.
  function handleSelect() {
    updateActiveLine();
  }

  // ── Label rendering ──────────────────────────────────────────────────

  /** Build label for one line given its match state. */
  function labelFor(m: LineMatch): { text: string; cls: string } {
    switch (m.state) {
      case 'free':
        return { text: '—', cls: 'text-zinc-300 dark:text-zinc-700' };
      case 'empty':
        return { text: m.letter, cls: 'text-zinc-300 dark:text-zinc-700' };
      case 'anchor':
        return { text: `${m.letter} ★`, cls: 'text-violet-600 dark:text-violet-400 font-bold' };
      case 'hit':
        return { text: `${m.letter} ✓`, cls: 'text-emerald-600 dark:text-emerald-400 font-bold' };
      case 'partial':
        return { text: `${m.letter} ~`, cls: 'text-amber-600 dark:text-amber-400 font-bold' };
      case 'miss':
        return { text: `${m.letter} ✗`, cls: 'text-rose-600 dark:text-rose-400 font-bold' };
    }
  }
</script>

<!-- Editor container: label column + textarea -->
<div
  class="relative flex min-h-0 flex-1 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500"
>
  <!-- Label column (hidden in focus mode) -->
  {#if !focusMode}
    <div
      bind:this={labelColEl}
      class="shrink-0 select-none overflow-hidden border-r border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 py-4 pl-3 pr-2 font-mono text-xs leading-7"
      style="width: 3.5rem;"
      aria-hidden="true"
    >
      {#each lineMatches as m, i (i)}
        {@const lbl = labelFor(m)}
        <div
          class="h-7 flex items-center justify-end {lbl.cls} {i === activeLineIndex ? 'bg-sky-100/50 dark:bg-sky-900/30 rounded -mr-1 pr-1' : ''}"
        >
          {lbl.text}
        </div>
      {/each}
      <!-- Spacer so trailing blank line still gets a label if needed -->
      {#if lineMatches.length === 0}
        <div class="h-7 text-zinc-300 dark:text-zinc-700">—</div>
      {/if}
    </div>
  {/if}

  <!-- Textarea -->
  <textarea
    bind:this={textareaEl}
    value={text}
    oninput={handleInput}
    onkeydown={handleKeyDown}
    onclick={handleSelect}
    onkeyup={handleSelect}
    onscroll={onScroll}
    onselect={handleSelect}
    placeholder={placeholder ?? t('在这里写下第一行…', 'Start writing the first line…')}
    spellcheck="false"
    class="flex-1 min-w-0 resize-none bg-transparent px-4 py-4 font-sans text-base leading-7 text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
  ></textarea>
</div>
