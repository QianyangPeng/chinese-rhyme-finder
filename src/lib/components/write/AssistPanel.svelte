<script lang="ts">
  /**
   * Right-side assist panel: scheme selector on top, current-line analysis
   * in the middle, candidate list at the bottom.
   *
   * All three sections share the `hoveredKey` state so hovering a rhyme
   * chip anywhere (editor, line analysis, or a candidate) highlights the
   * same key across the whole UI.
   */
  import type { SchemeConfig, SchemeType, LineMatch, Anchor } from '$lib/core/write/scheme';
  import type { LineAnalysis } from '$lib/core/analyze/types';
  import type { SearchResult, SearchHit } from '$lib/core/corpus/search';
  import { t } from '$lib/stores/lang.svelte';

  interface Props {
    scheme: SchemeConfig;
    onSchemeChange: (s: SchemeConfig) => void;

    activeLineIndex: number;
    activeLineAnalysis: LineAnalysis | null;
    activeLineMatch: LineMatch | null;

    /** Computed candidates for the active line (or null if nothing to search). */
    candidates: SearchResult | null;
    /** Tab-cycle index, null when not in cycle. */
    tabCycleIndex: number | null;

    onInsertCandidate: (text: string) => void;
    onHoverKey: (key: string | null) => void;
    hoveredKey: string | null;
  }
  let {
    scheme,
    onSchemeChange,
    activeLineIndex,
    activeLineAnalysis,
    activeLineMatch,
    candidates,
    tabCycleIndex,
    onInsertCandidate,
    onHoverKey,
    hoveredKey
  }: Props = $props();

  // ── Source badge (reused palette from Discover) ──────────────────────
  const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
    'xinhua-idiom':        { label: '成语', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
    'xinhua-xiehouyu':     { label: '歇后', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' },
    'chinese-poetry/tang': { label: '唐诗', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' },
    'chinese-poetry/song': { label: '宋词', cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200' },
    'wiktionary-slang':    { label: '网络', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
    'opensubtitles-zh':    { label: '口语', cls: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200' },
    'lyrics-hiphop':       { label: '说唱', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
    'lyrics-pop':          { label: '歌词', cls: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200' },
    'moegirl-acg':         { label: 'ACG', cls: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-200' },
    'cedict':              { label: '词典', cls: 'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200' }
  };
  function sourceBadge(src: string) {
    return SOURCE_BADGES[src] ?? { label: src, cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' };
  }

  function stars(cleverness: number): string {
    const filled = Math.max(0, Math.min(3, Math.round(cleverness * 1.5)));
    return '★'.repeat(filled);
  }

  // Flatten all hits across all buckets for the candidate list. Buckets
  // are already sorted (level asc, then by tier/quality). We only take
  // hits where the last position of the match window is true — i.e.
  // target's final syllable is actually rhymed (the anchor we care about).
  const flatHits = $derived.by<SearchHit[]>(() => {
    if (!candidates) return [];
    const out: SearchHit[] = [];
    for (const bucket of candidates.buckets) {
      for (const hit of bucket.hits) out.push(hit);
    }
    return out;
  });

  // How many to render at once (infinite scroll).
  const PAGE_SIZE = 30;
  let visibleCount = $state(PAGE_SIZE);
  $effect(() => {
    // Reset when candidates set changes
    void candidates;
    visibleCount = PAGE_SIZE;
  });
  function loadMore() {
    visibleCount = Math.min(visibleCount + PAGE_SIZE, flatHits.length);
  }

  // Scheme option labels (bilingual via t())
  const SCHEME_OPTIONS: Array<{ value: SchemeType; zh: string; en: string }> = [
    { value: 'free',      zh: '自由',         en: 'Free' },
    { value: 'monorhyme', zh: '一韵到底',     en: 'Monorhyme' },
    { value: 'aabb',      zh: 'AABB',        en: 'AABB' },
    { value: 'abab',      zh: 'ABAB',        en: 'ABAB' },
    { value: 'custom',    zh: '自定义',       en: 'Custom' }
  ];

  function updateScheme(patch: Partial<SchemeConfig>) {
    onSchemeChange({ ...scheme, ...patch });
  }

  // ── Role label for the active line's analysis card ───────────────────
  function roleLabel(m: LineMatch | null): string {
    if (!m) return '';
    switch (m.state) {
      case 'free':    return t('自由行', 'Free line');
      case 'empty':   return t('空行', 'Empty');
      case 'anchor':  return t(`${m.letter} 组锚定`, `${m.letter} anchor`);
      case 'hit':     return t(`${m.letter} 组 · 押上了`, `${m.letter} · hit`);
      case 'partial': return t(`${m.letter} 组 · 部分押`, `${m.letter} · partial`);
      case 'miss':    return t(`${m.letter} 组 · 没押上`, `${m.letter} · miss`);
    }
  }
  function stateColor(s: LineMatch['state']): string {
    switch (s) {
      case 'anchor':  return 'text-violet-600 dark:text-violet-400';
      case 'hit':     return 'text-emerald-600 dark:text-emerald-400';
      case 'partial': return 'text-amber-600 dark:text-amber-400';
      case 'miss':    return 'text-rose-600 dark:text-rose-400';
      default:        return 'text-zinc-500';
    }
  }
</script>

<aside class="flex min-h-0 w-full flex-col gap-3 overflow-hidden">
  <!-- ── Section 1: Scheme bar ──────────────────────────────── -->
  <section class="shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 text-xs">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="flex items-center gap-1.5">
        <span class="text-zinc-500">{t('韵式', 'Scheme')}</span>
        <select
          value={scheme.type}
          onchange={(e) => updateScheme({ type: (e.currentTarget as HTMLSelectElement).value as SchemeType })}
          class="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
        >
          {#each SCHEME_OPTIONS as opt (opt.value)}
            <option value={opt.value}>{t(opt.zh, opt.en)}</option>
          {/each}
        </select>
      </div>

      <div class="flex items-center gap-1.5">
        <span class="text-zinc-500">{t('深度', 'Depth')}</span>
        <select
          value={scheme.depth}
          onchange={(e) => updateScheme({ depth: Number((e.currentTarget as HTMLSelectElement).value) })}
          class="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </div>

      <div class="flex items-center gap-1.5">
        <span class="text-zinc-500">{t('严格', 'Strict')}</span>
        <button
          class="rounded border px-2 py-1 text-xs {scheme.toneMode === 'none' ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100' : 'border-zinc-300 dark:border-zinc-700'}"
          onclick={() => updateScheme({ toneMode: 'none' })}
        >{t('韵母', 'Rhyme')}</button>
        <button
          class="rounded border px-2 py-1 text-xs {scheme.toneMode === 'exact' ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100' : 'border-zinc-300 dark:border-zinc-700'}"
          onclick={() => updateScheme({ toneMode: 'exact' })}
        >{t('+声调', '+Tone')}</button>
      </div>
    </div>

    {#if scheme.type === 'custom'}
      <div class="mt-2 flex items-center gap-1.5">
        <span class="text-zinc-500">{t('字母模式', 'Pattern')}</span>
        <input
          type="text"
          value={scheme.customPattern ?? ''}
          oninput={(e) => updateScheme({ customPattern: (e.currentTarget as HTMLInputElement).value.toUpperCase() })}
          placeholder="AABBA"
          maxlength="16"
          class="w-28 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 font-mono text-xs uppercase"
        />
        <span class="text-zinc-400">{t('短则循环', 'Short patterns cycle')}</span>
      </div>
    {/if}
  </section>

  <!-- ── Section 2: Current line analysis ───────────────────── -->
  <section class="shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 text-xs">
    <div class="mb-2 flex items-baseline justify-between gap-2">
      <p class="font-semibold text-zinc-700 dark:text-zinc-300">
        L{activeLineIndex + 1}
        <span class="ml-1 font-normal {stateColor(activeLineMatch?.state ?? 'free')}">
          {roleLabel(activeLineMatch)}
        </span>
      </p>
      {#if activeLineMatch && (activeLineMatch.state === 'hit' || activeLineMatch.state === 'partial' || activeLineMatch.state === 'miss')}
        <span class="font-mono text-[11px] {stateColor(activeLineMatch.state)}">
          {activeLineMatch.matchedCount}/{activeLineMatch.comparedCount} {t('押', 'rhymed')}
        </span>
      {/if}
    </div>

    {#if activeLineAnalysis && activeLineAnalysis.syllables.length > 0}
      <!-- Current line's syllable chips -->
      <div class="mb-2 flex flex-wrap gap-1 font-mono">
        {#each activeLineAnalysis.syllables as syl, i (i)}
          {@const key = activeLineAnalysis.keys[i] ?? ''}
          {@const tailStart = activeLineAnalysis.syllables.length - scheme.depth}
          {@const inTail = i >= tailStart}
          {@const isHov = hoveredKey !== null && key === hoveredKey}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span
            class="inline-flex flex-col items-center rounded px-1.5 py-0.5 text-[10px] transition-all {inTail
              ? 'bg-sky-50 dark:bg-sky-900/30'
              : 'bg-zinc-50 dark:bg-zinc-800/50'}
              {isHov ? 'ring-2 ring-sky-500 scale-110 z-10' : ''}"
            title="{syl.char} · {syl.pinyinWithTone} · {syl.final || '?'}"
            onmouseenter={() => onHoverKey(key)}
            onmouseleave={() => onHoverKey(null)}
          >
            <span class="font-sans text-sm text-zinc-900 dark:text-zinc-100">{syl.char}</span>
            <span class="text-zinc-500">{syl.final}</span>
          </span>
        {/each}
      </div>
    {:else}
      <p class="mb-2 text-zinc-400 dark:text-zinc-600">
        {t('（当前行没有中文字符）', '(no Chinese characters in current line)')}
      </p>
    {/if}

    {#if activeLineMatch && activeLineMatch.targetKeys.length > 0 && activeLineMatch.state !== 'anchor'}
      <!-- Target keys comparison -->
      <div class="mt-2 flex items-center gap-2 text-[11px]">
        <span class="text-zinc-500">{t('目标尾韵', 'Target tail')}</span>
        <div class="flex gap-1 font-mono">
          {#each activeLineMatch.targetKeys as k, i (i)}
            {@const ok = activeLineMatch.perPosition[i] ?? false}
            {@const isHov = hoveredKey !== null && k === hoveredKey}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="rounded px-1.5 py-0.5 text-[10px] transition-all {ok
                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                : 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200'}
                {isHov ? 'ring-2 ring-sky-500 scale-110 z-10' : ''}"
              onmouseenter={() => onHoverKey(k)}
              onmouseleave={() => onHoverKey(null)}
            >
              {k}
            </span>
          {/each}
        </div>
      </div>
    {/if}
  </section>

  <!-- ── Section 3: Candidate list (flex-1, scrolls) ─────────── -->
  <section class="flex min-h-0 flex-1 flex-col rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
    <header class="flex shrink-0 items-baseline justify-between border-b border-zinc-100 dark:border-zinc-800 px-3 py-2 text-xs">
      <p class="font-semibold text-zinc-700 dark:text-zinc-300">
        {t('候选词', 'Candidates')}
        {#if candidates}
          <span class="ml-1 font-normal text-zinc-500">{flatHits.length}</span>
        {/if}
      </p>
      <p class="font-mono text-[10px] text-zinc-400">
        {#if tabCycleIndex !== null}
          {t(`Tab #${tabCycleIndex + 1}`, `Tab #${tabCycleIndex + 1}`)}
        {:else}
          {t('Tab 插入', 'Tab to insert')}
        {/if}
      </p>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      {#if !candidates || flatHits.length === 0}
        <p class="py-8 text-center text-xs text-zinc-400">
          {#if activeLineMatch?.state === 'free' && (!activeLineAnalysis || activeLineAnalysis.syllables.length === 0)}
            {t('开始写一行，这里会出现押韵候选', 'Start writing a line to see rhyme candidates here')}
          {:else if activeLineMatch?.state === 'anchor'}
            {t('这是锚定行，候选会出现在后续同韵组的行里', 'This is the anchor row — candidates show up on later same-group lines')}
          {:else}
            {t('没有候选', 'No candidates')}
          {/if}
        </p>
      {:else}
        <ul class="space-y-2">
          {#each flatHits.slice(0, visibleCount) as hit, i (hit.phrase.text)}
            {@const winStart = hit.matchOffset}
            {@const winEnd = winStart + hit.match.perPosition.length}
            {@const badge = sourceBadge(hit.phrase.source)}
            {@const isTabSelected = tabCycleIndex !== null && tabCycleIndex === i}
            <li
              class="group cursor-pointer rounded border border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/30 p-2 transition hover:border-sky-300 dark:hover:border-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/20 {isTabSelected ? 'border-sky-400 bg-sky-50 dark:border-sky-600 dark:bg-sky-950/30 ring-1 ring-sky-400' : ''}"
            >
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <div onclick={() => onInsertCandidate(hit.phrase.text)} class="flex items-baseline justify-between gap-2">
                <span class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {hit.phrase.text}
                </span>
                <span class="flex shrink-0 items-center gap-1">
                  <span class="rounded px-1 py-0.5 font-mono text-[9px] {badge.cls}">{badge.label}</span>
                  <span class="font-mono text-[10px] text-zinc-400">
                    {hit.match.matchedPositions.length}/{hit.match.comparedLength}
                  </span>
                  {#if hit.phrase.length < (candidates?.targetLength ?? 0)}
                    <span class="rounded bg-lime-100 dark:bg-lime-900/40 px-1 py-0.5 text-[9px] text-lime-900 dark:text-lime-200">{t('尾', 'tail')}</span>
                  {:else if hit.phrase.length > (candidates?.targetLength ?? 0)}
                    {#if winStart > 0}
                      <span class="rounded bg-sky-100 dark:bg-sky-900/40 px-1 py-0.5 text-[9px] text-sky-900 dark:text-sky-200">{t('句中', 'mid')}</span>
                    {:else}
                      <span class="rounded bg-purple-100 dark:bg-purple-900/40 px-1 py-0.5 text-[9px] text-purple-900 dark:text-purple-200">{t('含', 'echo')}</span>
                    {/if}
                  {/if}
                </span>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-0.5 font-mono">
                {#each hit.phrase.finals as f, pi (pi)}
                  {@const inWindow = pi >= winStart && pi < winEnd}
                  {@const matched = inWindow && hit.match.perPosition[pi - winStart]}
                  {@const isHov = hoveredKey !== null && f === hoveredKey}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <span
                    class="rounded px-1 py-0.5 text-[9px] transition-all {matched
                      ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                      : inWindow
                        ? 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'}
                      {isHov ? 'ring-2 ring-sky-500 scale-110 z-10' : ''}"
                    onmouseenter={() => onHoverKey(f)}
                    onmouseleave={() => onHoverKey(null)}
                  >
                    {f}
                  </span>
                {/each}
                <span class="ml-auto font-sans text-[10px] text-amber-500">{stars(hit.phrase.quality)}</span>
              </div>
            </li>
          {/each}
        </ul>

        {#if visibleCount < flatHits.length}
          <button
            class="mx-auto mt-3 block rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            onclick={loadMore}
          >
            {t(`加载更多（${visibleCount}/${flatHits.length}）`, `Load more (${visibleCount}/${flatHits.length})`)}
          </button>
        {/if}
      {/if}
    </div>
  </section>
</aside>
