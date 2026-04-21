<script lang="ts">
  /**
   * One anchor card in a paragraph's sidebar.
   *
   * v3: candidates fetched via the shared search Web Worker (same one
   * /search uses), and rendered in the same Level → source-section →
   * tail-group-chip → expand layout. The main thread never touches the
   * 800k lexicon; search runs off-thread so typing and scrolling stay
   * responsive.
   *
   * Interaction: clicking a hit inside an expanded group inserts that
   * text at the current cursor in the parent paragraph's textarea.
   */
  import { parseSyllables } from '$lib/core/pinyin';
  import type { GroupedAnchor, ToneMode } from '$lib/core/write/anchors';
  import { sourceMeta } from '$lib/util/sources';
  import { rhymeColor } from '$lib/util/rhymeColors';
  import {
    searchClient,
    type GroupedSearchResult,
    type TailGroup
  } from '$lib/workers/searchClient.svelte';
  import { t, lang } from '$lib/stores/lang.svelte';

  interface Props {
    anchor: GroupedAnchor;
    /** Whether this anchor belongs to the currently-focused paragraph.
     *  Only active anchors fetch candidates — saves worker cycles when
     *  the user has many paragraphs with many anchors. */
    active: boolean;
    onToneModeChange: (toneMode: ToneMode) => void;
    onRemove: () => void;
    onInsertCandidate: (text: string) => void;
    /** Shared hover key — hovering a final chip anywhere highlights
     *  same-key chips across the whole page. */
    hoveredKey: string | null;
    onHoverKey: (key: string | null) => void;
    /** Cross-anchor rhyme hover: any anchor whose rhymeKey matches
     *  this value gets a boosted visual state. */
    hoveredRhymeKey?: string | null;
    onHoverRhymeKey?: (key: string | null) => void;
  }
  let {
    anchor,
    active,
    onToneModeChange,
    onRemove,
    onInsertCandidate,
    hoveredKey,
    onHoverKey,
    hoveredRhymeKey = null,
    onHoverRhymeKey = () => {}
  }: Props = $props();

  // ── Derive syllables + finals from anchor text ──────────────────
  const syllables = $derived(parseSyllables(anchor.text));
  const targetFinals = $derived(syllables.map((s) => s.final));
  const targetTones = $derived(syllables.map((s) => s.tone));

  // ── Async search via shared worker ──────────────────────────────
  let result = $state<GroupedSearchResult | null>(null);
  let searching = $state(false);
  /** Stale-request guard: every effect run bumps the seq; a stale
   *  resolver that returns later must drop its result. */
  let reqSeq = 0;

  $effect(() => {
    // Establish reactive deps explicitly so toggling active / ready /
    // toneMode / anchor.text all re-fire.
    const isReady = searchClient.isReady;
    const isActive = active;
    const currentFinals = targetFinals.slice();
    const currentTones = targetTones.slice();
    const currentToneMode = anchor.toneMode;
    const currentText = anchor.text;

    if (!isActive || !isReady || currentFinals.length === 0) {
      // Supersede any in-flight so its response is dropped.
      reqSeq++;
      result = null;
      searching = false;
      return;
    }

    const mySeq = ++reqSeq;
    searching = true;

    searchClient
      .search({
        target: currentFinals,
        targetTones: currentTones,
        excludeText: currentText,
        toneMode: currentToneMode,
        requireTailMatch: true,
        windowMode: 'tail'
      })
      .then((r) => {
        if (mySeq !== reqSeq) return;
        result = r;
        searching = false;
      })
      .catch(() => {
        if (mySeq !== reqSeq) return;
        searching = false;
      });
  });

  // ── Per-chip primary source (for the badge on each tail chip) ───

  /** A tail-group's "primary source" = highest-priority source among
   *  its hits. Used here both to drive the chip's badge and to sort
   *  chips within a level (成语 first, then 词典, …). Expand still
   *  shows ALL hits in the group regardless of source. */
  function primarySourceFor(g: TailGroup): string {
    if (g.hits.length === 0) return 'wiktionary-slang';
    let bestId = g.hits[0].source;
    let bestPri = sourceMeta(bestId).priority;
    for (let i = 1; i < g.hits.length; i++) {
      const s = g.hits[i].source;
      const p = sourceMeta(s).priority;
      if (p < bestPri) { bestPri = p; bestId = s; }
    }
    return bestId;
  }

  /** Flat chip ordering: primary source priority asc (curated first),
   *  then totalCount desc, then tailText lexicographic. Replaces the
   *  old collapsible source-section UI. */
  function sortGroupsBySource(groups: readonly TailGroup[]): TailGroup[] {
    return [...groups].sort((a, b) => {
      const pa = sourceMeta(primarySourceFor(a)).priority;
      const pb = sourceMeta(primarySourceFor(b)).priority;
      if (pa !== pb) return pa - pb;
      if (a.totalCount !== b.totalCount) return b.totalCount - a.totalCount;
      return a.tailText.localeCompare(b.tailText, 'zh-Hans');
    });
  }

  // ── Per-chip expansion state ────────────────────────────────────
  /** Keyed by `${level}-${tailText}-${perPosition}` */
  let expandedChips = $state<Record<string, boolean>>({});
  function toggleChip(key: string) {
    expandedChips = { ...expandedChips, [key]: !expandedChips[key] };
  }

  // ── Derived summary ─────────────────────────────────────────────
  const totalGroupsCount = $derived(
    result ? result.levels.reduce((s, l) => s + l.groups.length, 0) : 0
  );

  // ── Level label (mirrors /search page copy) ─────────────────────
  function levelLabel(lv: number): string {
    if (lv === 0) return t('全押', 'Full');
    return t(`${lv}位放宽`, `-${lv}`);
  }

  // ── Rhyme-group colors (shared palette) ─────────────────────────
  const colors = $derived(rhymeColor(anchor.colorIdx));

  // True if THIS anchor is part of the currently hovered rhyme group
  // (hover originating from editor or another panel card).
  const isRhymeHovered = $derived(
    hoveredRhymeKey !== null && hoveredRhymeKey === anchor.rhymeKey
  );

  // ── Horizontal collapse (spec point 2) ──────────────────────────
  /** When collapsed, the column shrinks to ~2.5rem so other anchors
   *  can fit side-by-side without scrolling. Click the narrow strip
   *  (or the ▾ toggle in the header) to expand. */
  let collapsed = $state(false);
  function toggleCollapsed() {
    collapsed = !collapsed;
  }
</script>

{#if collapsed}
  <!-- Narrow collapsed strip: colored bar + vertical anchor text + expand arrow. -->
  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button
    class="flex min-h-[120px] flex-col items-center gap-2 rounded-md border border-zinc-200 px-1 py-2 text-left transition-shadow hover:border-sky-300 dark:border-zinc-700 dark:hover:border-sky-700"
    style="width: 2.5rem; flex-shrink: 0; background: {colors.bg}; {isRhymeHovered ? `box-shadow: 0 0 0 2px ${colors.border};` : ''}"
    onclick={toggleCollapsed}
    onmouseenter={() => onHoverRhymeKey(anchor.rhymeKey)}
    onmouseleave={() => onHoverRhymeKey(null)}
    title={t(`展开「${anchor.text}」的候选`, `Expand candidates for ${anchor.text}`)}
  >
    <span class="block h-6 w-1 rounded-full" style="background: {colors.border};"></span>
    <span
      class="font-sans text-[13px] font-semibold"
      style="writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 1px;"
    >{anchor.text}</span>
    <span class="text-[10px] text-zinc-400">▸</span>
  </button>
{:else}
<article
  class="group relative flex-shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-white text-xs transition-shadow dark:border-zinc-700 dark:bg-zinc-900"
  style="width: 14rem; {isRhymeHovered ? `box-shadow: 0 0 0 2px ${colors.border};` : ''}"
  onmouseenter={() => onHoverRhymeKey(anchor.rhymeKey)}
  onmouseleave={() => onHoverRhymeKey(null)}
>
  <!-- Collapse tab: small vertically-centered chip on the right edge,
       visible only on card hover. Small enough that it doesn't cover
       the body scrollbar or the header's × button. -->
  <button
    class="absolute right-0 top-1/2 z-10 hidden h-6 w-3 -translate-y-1/2 items-center justify-center rounded-l border border-r-0 border-zinc-200 bg-white/90 text-[9px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 group-hover:flex dark:border-zinc-700 dark:bg-zinc-900/90 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    title={t('收起这个锚点', 'Collapse')}
    onclick={toggleCollapsed}
    aria-label={t('收起这个锚点', 'Collapse')}
  >◀</button>
  <!-- Two-row header fits 14rem column:
       row 1 = anchor box + compact controls
       row 2 = pinyin (truncates) + location badge -->
  <header
    class="px-2 py-1.5"
    style="border-left: 4px solid {colors.border}; background: {colors.bg};"
  >
    <div class="flex items-center justify-between gap-1">
      <span
        class="font-sans text-[14px] font-semibold truncate"
        style="border: 1.5px solid {colors.border}; border-radius: 4px; padding: 0 5px; background: {colors.bg};"
      >{anchor.text}</span>
      <div class="flex shrink-0 items-center gap-0.5">
        <button
          class="rounded px-1 py-0 text-[10px] {anchor.toneMode === 'none'
            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
            : 'border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
          title={t('只比韵母', 'Rhyme only')}
          onclick={() => onToneModeChange('none')}
        >{t('韵', 'R')}</button>
        <button
          class="rounded px-1 py-0 text-[10px] {anchor.toneMode === 'exact'
            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
            : 'border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
          title={t('韵母 + 声调', 'Rhyme + tone')}
          onclick={() => onToneModeChange('exact')}
        >{t('调', 'T')}</button>
        {#if !anchor.auto}
          <button
            class="rounded p-0 text-[12px] text-zinc-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 dark:hover:text-rose-400"
            title={t('删除这个锚点', 'Remove anchor')}
            onclick={onRemove}
            aria-label={t('删除这个锚点', 'Remove anchor')}
          >×</button>
        {/if}
      </div>
    </div>
    <div class="mt-0.5 flex items-baseline justify-between gap-2 text-[9px] text-zinc-500">
      <span class="font-mono truncate">{syllables.map((s) => s.pinyinWithTone).join(' ')}</span>
      {#if anchor.auto && anchor.lineIndex !== undefined}
        <span class="shrink-0">
          {t(`L${(anchor.lineIndex ?? 0) + 1} 尾`, `L${(anchor.lineIndex ?? 0) + 1}`)}
        </span>
      {:else if !anchor.auto}
        <span class="shrink-0">
          {t('手选', 'picked')}
        </span>
      {/if}
    </div>
  </header>

  <!-- Body container. max-h + overflow-y so each anchor's candidate
       list scrolls INSIDE the card — avoids forcing the whole page
       to scroll when a card has many levels / chips. -->
  <div class="px-2 py-2 overflow-y-auto" style="max-height: 60vh;">

  <!-- Target finals chips -->
  {#if targetFinals.length > 0}
    <div class="mb-2 flex flex-wrap gap-1 font-mono">
      {#each syllables as syl, i (i)}
        {@const isHov = hoveredKey !== null && syl.final === hoveredKey}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200 px-1 py-0.5 text-[10px] transition-all {isHov ? 'ring-2 ring-sky-500 scale-110 z-10' : ''}"
          title="{syl.char} · {syl.pinyinWithTone} · {syl.final}"
          onmouseenter={() => onHoverKey(syl.final)}
          onmouseleave={() => onHoverKey(null)}
        >{syl.final}</span>
      {/each}
    </div>
  {/if}

  <!-- Candidates -->
  {#if !active}
    <p class="py-2 text-center text-zinc-400">{t('点击该段落查看候选', 'Click this paragraph to load candidates')}</p>
  {:else if !searchClient.isReady}
    <p class="py-2 text-center text-zinc-400">
      {t(`词库加载中… (${searchClient.phrasesLoaded.toLocaleString()} 条)`, `Loading lexicon… (${searchClient.phrasesLoaded.toLocaleString()})`)}
    </p>
  {:else if searching && !result}
    <p class="py-2 text-center text-zinc-400">{t('搜索中…', 'Searching…')}</p>
  {:else if result && result.totalHits === 0}
    <p class="py-2 text-center text-zinc-400">{t('没有找到押韵候选', 'No rhyme candidates')}</p>
  {:else if result}
    <p class="mb-2 text-[10px] text-zinc-500">
      {t(`${result.totalHits} 条候选 · ${totalGroupsCount} 种尾韵`, `${result.totalHits} hits · ${totalGroupsCount} tail-rhymes`)}
    </p>

    <div class="space-y-3">
      {#each result.levels as level (level.level)}
        {@const chips = sortGroupsBySource(level.groups)}
        <div>
          <!-- Level header -->
          <div class="mb-1 flex items-baseline justify-between gap-2 text-[10px]">
            <span class="font-semibold text-zinc-700 dark:text-zinc-300">
              Level {level.level}
              <span class="font-normal text-zinc-500">· {levelLabel(level.level)}</span>
            </span>
            <span class="text-zinc-500">{level.totalHits} {t('条', '')}</span>
          </div>

          <!-- Flat chip list, ordered by (primary source priority, count desc).
               Each chip carries a small source badge on its right so the
               grouping is preserved visually without a separate section. -->
          <div class="space-y-1">
            {#each chips as g (g.tailText + '#' + g.perPosition.join(','))}
              {@const chipKey = `${level.level}-${g.tailText}-${g.perPosition.join(',')}`}
              {@const isOpen = expandedChips[chipKey]}
              {@const pSrc = primarySourceFor(g)}
              {@const pMeta = sourceMeta(pSrc)}
              <div>
                <button
                  class="w-full flex items-center justify-between gap-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1.5 py-1 text-left hover:border-sky-300 dark:hover:border-sky-700"
                  onclick={() => toggleChip(chipKey)}
                >
                  <span class="flex items-center gap-0.5 font-sans text-[11px]">
                    {#each g.tailChars as ch, i (i)}
                      {@const ok = g.perPosition[i]}
                      <span class={ok
                        ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400 line-through'}
                      >{ch}</span>
                    {/each}
                  </span>
                  <span class="flex shrink-0 items-center gap-1 text-[10px]">
                    <span class="rounded px-1 py-0 text-[9px] {pMeta.badgeCls}">
                      {lang.current === 'zh' ? pMeta.zh : pMeta.en}
                    </span>
                    <span class="font-mono text-zinc-500">{g.totalCount}</span>
                    <span class="text-zinc-400">{isOpen ? '▾' : '▸'}</span>
                  </span>
                </button>

                {#if isOpen}
                  <ul class="mt-1 space-y-0.5 rounded border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-1">
                    {#each g.hits as hit (hit.text)}
                      {@const hmeta = sourceMeta(hit.source)}
                      <li>
                        <button
                          type="button"
                          class="w-full text-left rounded px-1 py-0.5 hover:bg-sky-100 dark:hover:bg-sky-950/40 cursor-pointer"
                          onclick={() => onInsertCandidate(hit.text)}
                          title={t('点击插入到编辑器', 'Click to insert')}
                        >
                          <div class="flex items-baseline justify-between gap-1">
                            <span class="text-[11px] text-zinc-800 dark:text-zinc-200">
                              {#if hit.phraseLen === g.tailText.length}
                                {hit.text}
                              {:else}
                                <span class="text-zinc-400 dark:text-zinc-600">{hit.text.slice(0, hit.matchOffset)}</span><span class="font-semibold text-emerald-700 dark:text-emerald-400">{hit.text.slice(hit.matchOffset, hit.matchOffset + g.tailText.length)}</span><span class="text-zinc-400 dark:text-zinc-600">{hit.text.slice(hit.matchOffset + g.tailText.length)}</span>
                              {/if}
                              {#if hit.properNoun}
                                <span class="ml-1 text-[9px] text-zinc-400">({t('名', 'name')})</span>
                              {/if}
                            </span>
                            <span class="shrink-0 rounded px-1 py-0 text-[9px] {hmeta.badgeCls}">
                              {lang.current === 'zh' ? hmeta.zh : hmeta.en}
                            </span>
                          </div>
                          {#if hit.pinyin && hit.pinyin.length > 0}
                            <p class="mt-0 font-mono text-[9px] text-zinc-400">{hit.pinyin.join(' ')}</p>
                          {/if}
                        </button>
                      </li>
                    {/each}
                    {#if g.totalCount > g.hits.length}
                      <li class="px-1 py-0 text-[10px] italic text-zinc-400">
                        {t(`…还有 ${g.totalCount - g.hits.length} 条`, `…+${g.totalCount - g.hits.length} more`)}
                      </li>
                    {/if}
                  </ul>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  </div><!-- /.body -->
</article>
{/if}

