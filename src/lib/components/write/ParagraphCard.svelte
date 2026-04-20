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
  import { makeManualAnchor, applyOverlapReplace } from '$lib/core/write/anchors';
  import { rhymeColor } from '$lib/util/rhymeColors';
  import { t } from '$lib/stores/lang.svelte';

  // ── HTML escaping for overlay rendering ─────────────────────────
  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Render a single line as HTML with anchor substrings wrapped in
   * colored `<span class="anchor-box">` elements. Uses paragraph-wide
   * offsets to align anchors to the line-local substring.
   *
   * Only called for the overlay; produces transparent-text visuals.
   * Anchors that start before or extend past this line are clipped to
   * this line's [lineStart, lineEnd) range.
   */
  function renderLineHtml(
    lineText: string,
    lineStart: number,
    lineAnchors: readonly GroupedAnchor[]
  ): string {
    const lineEnd = lineStart + lineText.length;
    const relevant = lineAnchors
      .filter((a) => a.start < lineEnd && a.end > lineStart)
      .sort((a, b) => a.start - b.start);

    if (relevant.length === 0) {
      return escapeHtml(lineText) || '&nbsp;'; // empty line needs content to hold its height
    }

    let out = '';
    let cursor = 0;
    for (const a of relevant) {
      const s = Math.max(0, a.start - lineStart);
      const e = Math.min(lineText.length, a.end - lineStart);
      if (s < cursor) continue; // anchor overlaps previous; skip (v1 — P4 overlap replace will prevent this)
      if (s > cursor) out += escapeHtml(lineText.slice(cursor, s));
      const colors = rhymeColor(a.colorIdx);
      out +=
        `<span class="anchor-box" style="box-shadow: inset 0 0 0 1.5px ${colors.border}; background: ${colors.bg}; border-radius: 4px;">` +
        escapeHtml(lineText.slice(s, e)) +
        '</span>';
      cursor = e;
    }
    if (cursor < lineText.length) out += escapeHtml(lineText.slice(cursor));
    return out || '&nbsp;';
  }

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
    /** 1-based absolute line number for this paragraph's first line.
     *  Line numbers continue across paragraphs (e.g., if paragraph 1
     *  has 4 lines, paragraph 2's startLine is 5). */
    startLine?: number;

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
    startLine = 1,
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
    // Overlap-replace: any existing MANUAL anchor whose range overlaps
    // with the new selection is dropped. Auto anchors are untouched —
    // they re-derive from text each cycle.
    const existingManuals = anchors.filter((a) => !a.auto);
    onManualAnchorsChange(applyOverlapReplace(existingManuals, newAnchor));
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

  // ── Overlay lines ───────────────────────────────────────────────
  /** Each line with its global start offset (used by the overlay to
   *  align anchor spans to the paragraph's text offsets). */
  const overlayLines = $derived.by(() => {
    const lines = text.split('\n');
    const out: { text: string; start: number }[] = [];
    let offset = 0;
    for (const line of lines) {
      out.push({ text: line, start: offset });
      offset += line.length + 1; // +1 for the '\n'
    }
    return out;
  });

  // Keep overlay's horizontal scroll in sync with textarea's.
  let overlayEl = $state<HTMLDivElement | null>(null);
  function syncScroll() {
    if (!overlayEl || !textareaEl) return;
    overlayEl.scrollLeft = textareaEl.scrollLeft;
  }
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
        <!-- Line numbers (continue across paragraphs; startLine is the
             1-based absolute index of this paragraph's first line).
             Each row matches the textarea's 28px line-height. -->
        <div class="font-mono text-[10px] text-zinc-400" style="padding-top: 8px;">
          {#each Array(lineCount) as _, i (i)}
            <div
              style="height: 28px; line-height: 28px; text-align: right; padding-right: 6px;"
            >{startLine + i}</div>
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
        <!-- Textarea zone with overlay decorations -->
        <div class="editor-body relative">
          <!-- Decoration overlay: zebra rows + colored anchor boxes.
               Sits BEHIND the textarea; text is transparent; the
               textarea's transparent bg lets the decorations show
               through. Fonts / sizes / paddings / line-heights are
               kept identical so char positions align pixel-ish. -->
          <div
            bind:this={overlayEl}
            class="decor-overlay"
            aria-hidden="true"
          >
            {#each overlayLines as line, i (i)}
              <div
                class="decor-line"
                class:decor-line-alt={i % 2 === 1}
              >{@html renderLineHtml(line.text, line.start, anchors)}</div>
            {/each}
          </div>

          <textarea
            id="paragraph-textarea-{paragraphId}"
            bind:this={textareaEl}
            value={text}
            oninput={onInput}
            onkeyup={trackSelection}
            onclick={trackSelection}
            onselect={trackSelection}
            onfocus={onFocus}
            onscroll={syncScroll}
            placeholder={t('在这里写…', 'Write here…')}
            rows={lineCount}
            spellcheck="false"
            class="editor-textarea"
          ></textarea>

          {#if hasSelection}
            <!-- Floating "+ 加为押韵锚点" button, top-right of textarea -->
            <div class="pointer-events-none absolute right-3 top-1 z-20">
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

<style>
  /* Overlay + textarea share identical text metrics so anchor spans
     align to the characters the user types. `white-space: pre` on
     both means no wrap — long lines scroll horizontally in sync. */
  .editor-body {
    position: relative;
  }

  .decor-overlay,
  .editor-textarea {
    font-family: 'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB',
                 'Microsoft YaHei', system-ui, sans-serif;
    font-size: 16px;
    line-height: 28px;
    padding: 8px 12px;
    white-space: pre;
    letter-spacing: 0;
    margin: 0;
  }

  .decor-overlay {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    user-select: none;
    color: transparent;
    z-index: 0;
  }

  .decor-line {
    height: 28px;
    box-sizing: border-box;
  }

  /* Subtle zebra — visible in both themes without competing with the
     anchor boxes. Class-based (`:global(.dark)`) so it tracks the
     site's theme toggle (Tailwind `darkMode: 'class'`), not the OS
     preference. */
  .decor-line-alt {
    background: rgba(245, 158, 11, 0.035);
  }
  :global(.dark) .decor-line-alt {
    background: rgba(245, 158, 11, 0.05);
  }

  .editor-textarea {
    position: relative;
    z-index: 1;
    display: block;
    width: 100%;
    background: transparent;
    border: 0;
    outline: none;
    resize: none;
    overflow-x: auto;
    overflow-y: hidden;
    color: rgb(24, 24, 27); /* zinc-900 */
    caret-color: rgb(24, 24, 27);
  }
  :global(.dark) .editor-textarea {
    color: rgb(244, 244, 245); /* zinc-100 */
    caret-color: rgb(244, 244, 245);
  }
  .editor-textarea::placeholder {
    color: rgb(161, 161, 170); /* zinc-400 */
  }

  /* Anchor box visuals: inline box-shadow (doesn't affect layout) +
     tinted background. Inline styles on each span set the colors. */
  :global(.decor-line .anchor-box) {
    border-radius: 4px;
  }
</style>
