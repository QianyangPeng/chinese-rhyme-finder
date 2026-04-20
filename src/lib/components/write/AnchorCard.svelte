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
  import type { Anchor, ToneMode } from '$lib/core/write/anchors';
  import { sourceMeta } from '$lib/util/sources';
  import {
    searchClient,
    type GroupedSearchResult,
    type TailGroup
  } from '$lib/workers/searchClient.svelte';
  import { t, lang } from '$lib/stores/lang.svelte';

  interface Props {
    anchor: Anchor;
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
  }
  let {
    anchor,
    active,
    onToneModeChange,
    onRemove,
    onInsertCandidate,
    hoveredKey,
    onHoverKey
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

  // ── Source-grouped view helpers (parallel with /search page) ────
  interface SourceBucket {
    sourceId: string;
    groups: TailGroup[];
    totalHits: number;
  }

  /** A tail-group's "primary source" = highest-priority source among
   *  its hits. The chip lives in that source's mini-section; expand
   *  shows ALL hits in the group (each with its own source badge). */
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

  function partitionGroupsBySource(groups: readonly TailGroup[]): SourceBucket[] {
    const byId = new Map<string, TailGroup[]>();
    for (const g of groups) {
      const src = primarySourceFor(g);
      let arr = byId.get(src);
      if (!arr) { arr = []; byId.set(src, arr); }
      arr.push(g);
    }
    const out: SourceBucket[] = [];
    for (const [sid, gs] of byId) {
      const totalHits = gs.reduce((s, g) => s + g.totalCount, 0);
      out.push({ sourceId: sid, groups: gs, totalHits });
    }
    out.sort((a, b) => sourceMeta(a.sourceId).priority - sourceMeta(b.sourceId).priority);
    return out;
  }

  // ── Expansion / collapse state ──────────────────────────────────
  /** Keyed by `${level}-${tailText}-${perPosition}` */
  let expandedChips = $state<Record<string, boolean>>({});
  function toggleChip(key: string) {
    expandedChips = { ...expandedChips, [key]: !expandedChips[key] };
  }
  /** Keyed by `${level}-${sourceId}` */
  let collapsedSources = $state<Record<string, boolean>>({});
  function toggleSource(key: string) {
    collapsedSources = { ...collapsedSources, [key]: !collapsedSources[key] };
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
</script>

<article class="rounded-lg border {anchor.auto ? 'border-sky-200 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/20' : 'border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20'} p-3 text-xs">
  <!-- Header: text + tone toggle + remove -->
  <header class="mb-2 flex items-center justify-between gap-2">
    <div class="flex items-baseline gap-2 min-w-0">
      <span class="font-sans text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">{anchor.text}</span>
      <span class="font-mono text-[10px] text-zinc-500 truncate">{syllables.map((s) => s.pinyinWithTone).join(' ')}</span>
      {#if anchor.auto}
        <span class="shrink-0 rounded bg-sky-200 dark:bg-sky-900/60 px-1.5 py-0.5 text-[9px] text-sky-900 dark:text-sky-200">
          {t(`第 ${(anchor.lineIndex ?? 0) + 1} 行尾`, `L${(anchor.lineIndex ?? 0) + 1} tail`)}
        </span>
      {/if}
    </div>
    <div class="flex shrink-0 items-center gap-1">
      <button
        class="rounded border px-1.5 py-0.5 text-[10px] {anchor.toneMode === 'none'
          ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
          : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
        title={t('只比韵母', 'Rhyme only')}
        onclick={() => onToneModeChange('none')}
      >{t('韵母', 'Rhyme')}</button>
      <button
        class="rounded border px-1.5 py-0.5 text-[10px] {anchor.toneMode === 'exact'
          ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
          : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
        title={t('韵母 + 声调', 'Rhyme + tone')}
        onclick={() => onToneModeChange('exact')}
      >{t('+声调', '+Tone')}</button>
      {#if !anchor.auto}
        <button
          class="rounded p-1 text-zinc-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 dark:hover:text-rose-400"
          title={t('删除这个锚点', 'Remove anchor')}
          onclick={onRemove}
          aria-label={t('删除这个锚点', 'Remove anchor')}
        >×</button>
      {/if}
    </div>
  </header>

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
        {@const sourceBuckets = partitionGroupsBySource(level.groups)}
        <div>
          <!-- Level header -->
          <div class="mb-1 flex items-baseline justify-between gap-2 text-[10px]">
            <span class="font-semibold text-zinc-700 dark:text-zinc-300">
              Level {level.level}
              <span class="font-normal text-zinc-500">· {levelLabel(level.level)}</span>
            </span>
            <span class="text-zinc-500">{level.totalHits} {t('条', '')}</span>
          </div>

          <!-- Source sections -->
          <div class="space-y-1.5">
            {#each sourceBuckets as sg (sg.sourceId)}
              {@const meta = sourceMeta(sg.sourceId)}
              {@const srcKey = `${level.level}-${sg.sourceId}`}
              {@const isCollapsed = collapsedSources[srcKey]}
              <section class="rounded border border-zinc-100 dark:border-zinc-800 overflow-hidden bg-white/60 dark:bg-zinc-900/40">
                <div class="flex items-stretch">
                  <span class="w-1 {meta.barCls}"></span>
                  <button
                    class="flex-1 flex items-baseline gap-1.5 px-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    onclick={() => toggleSource(srcKey)}
                  >
                    <span class="text-zinc-400 text-[10px]">{isCollapsed ? '▸' : '▾'}</span>
                    <span class="rounded px-1 py-0.5 text-[10px] {meta.badgeCls}">
                      {lang.current === 'zh' ? meta.zh : meta.en}
                    </span>
                    <span class="text-[10px] text-zinc-500">
                      {t(`${sg.groups.length} 种 · ${sg.totalHits} 条`, `${sg.groups.length} · ${sg.totalHits}`)}
                    </span>
                  </button>
                </div>

                {#if !isCollapsed}
                  <div class="space-y-1 border-t border-zinc-100 dark:border-zinc-800 p-1.5">
                    {#each sg.groups as g (g.tailText + '#' + g.perPosition.join(','))}
                      {@const chipKey = `${level.level}-${g.tailText}-${g.perPosition.join(',')}`}
                      {@const isOpen = expandedChips[chipKey]}
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
                {/if}
              </section>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</article>
