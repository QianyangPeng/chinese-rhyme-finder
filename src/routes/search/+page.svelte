<script lang="ts">
  import { parseSyllables } from '$lib/core/pinyin';
  import { strictScheme } from '$lib/core/rhyme';
  import type { ToneMode } from '$lib/core/rhyme';
  import {
    getCurrentLexicon,
    ensureExtendedLexicon,
    onLexiconUpdate,
    searchByFinals,
    searchByTail
  } from '$lib/core/corpus';
  import type { Lexicon } from '$lib/core/corpus';
  type SearchMode = 'full' | 'tail';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { t } from '$lib/stores/lang.svelte';

  // Defaults; URL-based overrides applied client-side in onMount so
  // prerender doesn't choke on searchParams access.
  let query = $state('降维打击');
  let mode = $state<SearchMode>('full');
  let toneMode = $state<ToneMode>('none');
  let requireTailMatch = $state(true);
  /** Where in long candidates to look for the match window:
   *    'tail'     — only at the end (default)
   *    'anywhere' — slide across, surfaces mid-phrase rhyme groups too. */
  let windowMode = $state<'tail' | 'anywhere'>('tail');
  let urlReady = $state(false);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const m = params.get('mode');
    const tParam = params.get('tone');
    const tailReq = params.get('tail_req');
    const win = params.get('win');
    if (q) query = q;
    if (m === 'tail') mode = 'tail';
    if (tParam === 'exact' || tParam === 'pingze') toneMode = tParam;
    if (tailReq === '0') requireTailMatch = false;
    if (win === 'anywhere') windowMode = 'anywhere';
    urlReady = true;

    // Incremental lexicon: subscribe to each rebuild as files stream in,
    // so the UI doesn't block on ALL 42 files finishing. Every ~200ms
    // of loading fires a callback with the growing Lexicon.
    const unsub = onLexiconUpdate((lex) => { lexicon = lex; });
    ensureExtendedLexicon(base).then((lex) => { lexicon = lex; });
    return unsub;
  });

  // Mirror state back into the URL so results are shareable. Waits until
  // `urlReady` to avoid clobbering the URL during hydration.
  $effect(() => {
    if (!urlReady || typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (mode !== 'full') params.set('mode', mode);
    if (toneMode !== 'none') params.set('tone', toneMode);
    if (!requireTailMatch) params.set('tail_req', '0');
    if (windowMode !== 'tail') params.set('win', windowMode);
    const qs = params.toString();
    const url = `${base}/search/${qs ? '?' + qs : ''}`;
    if (window.location.pathname + window.location.search !== url) {
      history.replaceState(history.state, '', url);
    }
  });

  let copiedAt = $state<number>(0);
  function shareLink() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        copiedAt = Date.now();
      })
      .catch(() => {});
  }

  const scheme = strictScheme; // only strict supported in UI

  // Start with whatever's cached (seed on first render, extended on
  // subsequent route visits). Then kick off the async fetch+merge so
  // the big xinhua idiom corpus becomes available.
  let lexicon = $state<Lexicon>(getCurrentLexicon());

  const querySyllables = $derived(parseSyllables(query));
  const queryFinals = $derived(querySyllables.map((s) => s.final));
  const queryTones = $derived(querySyllables.map((s) => s.tone));

  // Debounced query so IME composition + fast typing doesn't kick off
  // a new 100-500ms searchByFinals pass on every intermediate keystroke.
  let debouncedQuery = $state('');
  let debouncedMode = $state<SearchMode>('full');
  let debouncedToneMode = $state<ToneMode>('none');
  let debouncedRequireTailMatch = $state(true);
  let debouncedWindowMode = $state<'tail' | 'anywhere'>('tail');
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    // Track all inputs that trigger a new search.
    void query; void mode; void toneMode; void requireTailMatch; void windowMode;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      debouncedQuery = query;
      debouncedMode = mode;
      debouncedToneMode = toneMode;
      debouncedRequireTailMatch = requireTailMatch;
      debouncedWindowMode = windowMode;
    }, 180);
  });

  const debouncedSyllables = $derived(parseSyllables(debouncedQuery));
  const debouncedFinals = $derived(debouncedSyllables.map((s) => s.final));
  const debouncedTones = $derived(debouncedSyllables.map((s) => s.tone));

  const fullResult = $derived(
    debouncedMode === 'full' && debouncedFinals.length > 0
      ? searchByFinals(debouncedFinals, scheme, lexicon, {
          excludeText: debouncedQuery.trim(),
          // No cap — the render layer groups by tail-text so visible
          // DOM stays light even with 80k+ raw candidates.
          maxPerBucket: Number.POSITIVE_INFINITY,
          toneMode: debouncedToneMode,
          targetTones: debouncedTones,
          requireTailMatch: debouncedRequireTailMatch,
          windowMode: debouncedWindowMode
        })
      : null
  );

  // ── Hover-to-highlight ─────────────────────────────────────────────
  // When the user hovers a syllable chip in the input "韵母模式" row,
  // every result card highlights matching syllables (same composed key).
  let hoveredKey = $state<string | null>(null);
  function hoverInputSyl(idx: number) {
    if (idx < 0 || idx >= queryFinals.length) { hoveredKey = null; return; }
    hoveredKey = queryFinals[idx];
  }
  function clearHover() { hoveredKey = null; }

  // ── Group-by-tail rendering ────────────────────────────────────────
  // 80k flat items is a real DOM bottleneck (AND useless — who scrolls
  // 80k rhymes?). Group hits by the actual characters of their match
  // window: all phrases ending in "了吗" group into one chip; click to
  // expand the list. Collapsed view is ~500 chips instead of 80k rows.
  //
  // For grouping we use the CHARS of the match window in the phrase
  // text — so "我吃了吗" and "好了吗" both group under tailText "了吗".

  interface TailGroup {
    tailText: string;                // e.g. "了吗"
    tailChars: string[];             // precomputed [...tailText] for render speed
    level: number;                   // relaxation level of its hits
    perPosition: readonly boolean[]; // same for all hits in the group
    hits: Array<{
      text: string;
      source: string;
      quality: number;
      phraseLen: number;
      matchOffset: number;
      finals: readonly string[];
      tags: readonly string[];
      properNoun: boolean;
    }>;
    // Derived for sorting / display
    properNounCount: number;
  }

  function groupByTail(
    fullRes: ReturnType<typeof searchByFinals> | null
  ): TailGroup[][] {
    if (!fullRes) return [];
    return fullRes.buckets.map((bucket) => {
      const byTail = new Map<string, TailGroup>();
      for (const hit of bucket.hits) {
        // tailText is precomputed on each SearchHit — no more per-hit
        // CJK filtering in the hot path.
        const tailText = hit.tailText;
        // Group key: tailText + (perPos pattern) so Level-1 partial
        // matches don't merge with Level-0 full matches under the
        // same tail.
        let perPatternKey = '';
        const per = hit.match.perPosition;
        for (let i = 0; i < per.length; i++) perPatternKey += per[i] ? '1' : '0';
        const key = tailText + '#' + perPatternKey;
        let g = byTail.get(key);
        if (!g) {
          g = {
            tailText,
            tailChars: [...tailText],
            level: bucket.level,
            perPosition: per,
            hits: [],
            properNounCount: 0
          };
          byTail.set(key, g);
        }
        const isProper = isProperFromSegments(hit.phrase.segments);
        g.hits.push({
          text: hit.phrase.text,
          source: hit.phrase.source,
          quality: hit.phrase.quality,
          phraseLen: hit.phrase.length,
          matchOffset: hit.matchOffset,
          finals: hit.phrase.finals,
          tags: hit.phrase.tags,
          properNoun: isProper
        });
        if (isProper) g.properNounCount++;
      }
      return Array.from(byTail.values()).sort((a, b) => {
        if (a.hits.length !== b.hits.length) return b.hits.length - a.hits.length;
        const aProperRatio = a.properNounCount / a.hits.length;
        const bProperRatio = b.properNounCount / b.hits.length;
        if (aProperRatio !== bProperRatio) return aProperRatio - bProperRatio;
        return a.tailText.localeCompare(b.tailText, 'zh-Hans');
      });
    });
  }

  function isProperFromSegments(segs: ReadonlyArray<{ pos: string }> | undefined): boolean {
    if (!segs || segs.length === 0) return false;
    for (const s of segs) {
      const pos = s.pos ?? '';
      if (pos.startsWith('nr') || pos === 'ns' || pos === 'nt' || pos === 'nz') return true;
    }
    return false;
  }

  const groupedFullLevels = $derived(groupByTail(fullResult));

  // Which groups are expanded.
  let expandedGroups = $state<Set<string>>(new Set());
  $effect(() => {
    // Reset expansion when query or filters change.
    void query; void mode; void toneMode; void requireTailMatch; void windowMode;
    expandedGroups = new Set();
  });
  function toggleGroup(key: string) {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key); else next.add(key);
    expandedGroups = next;
  }

  // Within each level, only mount the first N chips by default.
  // Bigger than 100 slows down weak hardware; users can "Show all" on demand.
  const LEVEL_CHIP_LIMIT = 100;
  let chipLimitPerLevel = $state<Record<number, number>>({});
  $effect(() => {
    void query; void mode; void toneMode; void requireTailMatch; void windowMode;
    chipLimitPerLevel = {};
  });
  function chipLimit(level: number): number {
    return chipLimitPerLevel[level] ?? LEVEL_CHIP_LIMIT;
  }
  function showAllChips(level: number, total: number) {
    chipLimitPerLevel = { ...chipLimitPerLevel, [level]: total };
  }

  const tailResult = $derived(
    debouncedMode === 'tail' && debouncedFinals.length > 0
      ? searchByTail(debouncedFinals, scheme, lexicon, {
          excludeText: debouncedQuery.trim(),
          minTailK: 2,
          maxPerBucket: Number.POSITIVE_INFINITY,
          toneMode: debouncedToneMode,
          targetTones: debouncedTones
        })
      : null
  );

  const totalHits = $derived(
    mode === 'full' ? fullResult?.totalHits ?? 0 : tailResult?.totalHits ?? 0
  );

  function presetExample(q: string) {
    query = q;
  }

  const PRESETS = [
    '降维打击',
    '星辰大海',
    '春暖花开',
    '相对华丽',
    '岁月静好',
    '一帆风顺'
  ];
</script>

<svelte:head>
  <title>{t('找押韵 · 中文押韵查询 · 押韵集', 'Search Rhymes · Chinese Rhymes')}</title>
  <meta
    name="description"
    content={t(
      '输入任意中文词组，从 80 万条短语里查出全部押韵候选 — 支持双押到多押，按严格到宽松分层显示。包括成语、说唱歌词、流行歌词、电影字幕、CC-CEDICT 词典等多源语料。',
      'Enter any Chinese phrase to search 800k+ candidates for matching rhymes — multi-syllable depth, layered from strict to loose, drawn from idioms, hip-hop & pop lyrics, subtitles, and the CC-CEDICT dictionary.'
    )}
  />
  <link rel="canonical" href="https://qianyangpeng.github.io/chinese-rhyme-finder/search/" />
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-12">
  <header class="mb-6">
    <h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{t('找押韵', 'Search')}</h1>
    <p class="mt-2 text-base text-zinc-600 dark:text-zinc-400">
      {t(
        '输入一个词组，从内置词库中查找押韵的候选（包括尾部匹配的长词）— 按"严格 → 宽松"分层展示。',
        'Enter a phrase and the corpus will return rhyme candidates (including tail-matched longer phrases), grouped from strict to loose.'
      )}
    </p>
  </header>

  <!-- Preset chips -->
  <div class="mb-3 flex flex-wrap gap-2 text-xs">
    <span class="text-zinc-500">{t('试试：', 'Try:')}</span>
    {#each PRESETS as preset (preset)}
      <button
        class="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:bg-zinc-900"
        onclick={() => presetExample(preset)}
      >
        {preset}
      </button>
    {/each}
  </div>

  <!-- Tone mode + tail-match -->
  <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
    <span class="text-zinc-500">{t('押韵严格度：', 'Strictness:')}</span>
    <button
      class="rounded border px-2.5 py-1 text-xs transition {toneMode === 'none'
        ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
      title={t('仅要求韵母一致（如 iang = iang）', 'Only rhyme finals must match (e.g. iang = iang)')}
      onclick={() => (toneMode = 'none')}
    >
      {t('韵母一致', 'Rhyme match')}
    </button>
    <button
      class="rounded border px-2.5 py-1 text-xs transition {toneMode === 'exact'
        ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
      title={t('韵母+声调都必须一致（jiāng 和 jiǎng 不算押韵）', 'Both rhyme and tone must match (jiāng ≠ jiǎng)')}
      onclick={() => (toneMode = 'exact')}
    >
      {t('韵母+声调', 'Rhyme + Tone')}
    </button>

    <span class="ml-4 text-zinc-500">{t('末位：', 'Last syllable:')}</span>
    <label class="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
      <input
        type="checkbox"
        bind:checked={requireTailMatch}
        class="accent-zinc-900 dark:accent-zinc-100"
      />
      <span title={t('末位（最后一个字）必须押韵，不押就不是押韵', 'The last syllable must rhyme — otherwise it is not a rhyme')}>{t('必须押韵', 'must rhyme')}</span>
    </label>

    <span class="ml-4 text-zinc-500">{t('匹配位置：', 'Window:')}</span>
    <button
      class="rounded border px-2.5 py-1 text-xs transition {windowMode === 'tail'
        ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
      title={t('只在长短语的末尾找押韵窗口', 'Only check the end of longer phrases')}
      onclick={() => (windowMode = 'tail')}
    >
      {t('句末', 'Tail only')}
    </button>
    <button
      class="rounded border px-2.5 py-1 text-xs transition {windowMode === 'anywhere'
        ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
      title={t('在长短语任意位置滑窗找押韵 — 包括句中', 'Slide the window through long phrases — finds mid-phrase rhymes too')}
      onclick={() => (windowMode = 'anywhere')}
    >
      {t('句中+句末', 'Anywhere')}
    </button>
  </div>

  <!-- Query input -->
  <div class="flex gap-2">
    <input
      type="text"
      bind:value={query}
      placeholder={t('例如：降维打击', 'e.g. 降维打击')}
      class="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 font-mono text-base shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
    />
    <button
      type="button"
      onclick={shareLink}
      class="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
      title={t('复制当前搜索的分享链接', 'Copy share link for this search')}
    >
      {#if copiedAt && Date.now() - copiedAt < 2000}
        ✓ {t('已复制', 'Copied')}
      {:else}
        🔗 {t('分享', 'Share')}
      {/if}
    </button>
  </div>

  <!-- Query analysis breadcrumb -->
  {#if querySyllables.length > 0}
    <div class="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-xs">
      <span class="text-zinc-500">{t('韵母模式：', 'Rhyme pattern:')} <span class="text-[10px] opacity-70">{t('（悬停高亮）', '(hover to highlight)')}</span></span>
      {#each querySyllables as s, i (i)}
        {@const isHov = hoveredKey !== null && s.final === hoveredKey}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="rounded border px-1.5 py-0.5 cursor-default transition-all {isHov
            ? 'border-sky-500 bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200 scale-110 shadow'
            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300'}"
          title="{s.char} · {s.pinyinWithTone} · {s.final || '?'}"
          onmouseenter={() => hoverInputSyl(i)}
          onmouseleave={clearHover}
        >
          <span class="font-sans text-sm">{s.char}</span>
          <span class="ml-1 opacity-60">{s.final}</span>
        </span>
      {/each}
      <span class="text-zinc-400">·</span>
      <span class="text-zinc-500">{queryFinals.filter(Boolean).join(' / ') || t('未识别', 'Unrecognized')}</span>
    </div>
  {/if}

  <!-- Lexicon badge -->
  <p class="mt-3 text-xs text-zinc-500">
    {t('词库：内置', 'Corpus:')} <span class="font-mono">{lexicon.phrases.length}</span> {t('条', 'phrases')} ·
    {#if mode === 'full'}
      {t('匹配等长及尾部押韵的长词', 'matches same-length phrases and tail rhymes in longer ones')}
    {:else}
      {t('尾押模式不限长度', 'tail-rhyme mode: any phrase length')}
    {/if}
  </p>

  <!-- Results -->
  <section class="mt-6">
    {#if totalHits === 0}
      <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-6 text-center">
        {#if querySyllables.length === 0}
          <p class="text-sm text-zinc-500">{t('输入一个中文词组试试。', 'Try entering a Chinese phrase.')}</p>
        {:else}
          <p class="text-sm text-zinc-700 dark:text-zinc-300">
            {t('没有找到押韵候选 — 试试换个词，或放宽严格度。', 'No rhyme candidates — try a different phrase or loosen strictness.')}
          </p>
          <p class="mt-1 text-xs text-zinc-500">
            {t('提示：试试宽松邻韵 scheme，或切到尾押模式看更多候选。', 'Tip: try a looser rhyme scheme, or switch to tail-rhyme mode for more candidates.')}
          </p>
        {/if}
      </div>
    {:else if mode === 'full' && fullResult}
      <p class="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        {t(
          `共 ${fullResult.totalHits} 条候选 · 按尾韵相同聚成一组，点击展开`,
          `${fullResult.totalHits} candidates, grouped by identical rhyme tail — click to expand`
        )}
      </p>

      <div class="space-y-4">
        {#each fullResult.buckets as bucket, bucketIdx (bucket.level)}
          {@const groups = groupedFullLevels[bucketIdx] ?? []}
          {@const limit = chipLimit(bucket.level)}
          {@const visibleGroups = groups.slice(0, limit)}
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div class="mb-3 flex items-baseline justify-between">
              <p class="font-semibold text-zinc-800 dark:text-zinc-200">
                Level {bucket.level}
                <span class="ml-2 font-normal text-zinc-500">
                  {#if bucket.level === 0}
                    {t('全押 · 每个位置都匹配', 'Full rhyme · every position matches')}
                  {:else}
                    {t(`${bucket.level} 位放宽`, `${bucket.level} position${bucket.level === 1 ? '' : 's'} relaxed`)}
                  {/if}
                </span>
              </p>
              <span class="font-mono text-xs text-zinc-500">
                {t(
                  `${groups.length} 种尾韵 · ${bucket.hits.length} 条`,
                  `${groups.length} tail${groups.length === 1 ? '' : 's'} · ${bucket.hits.length} total`
                )}
              </span>
            </div>

            <!-- Group chips -->
            <ul class="flex flex-wrap gap-1.5">
              {#each visibleGroups as g (g.tailText + '#' + g.level + g.perPosition.map(b => b ? '1' : '0').join(''))}
                {@const groupKey = `${bucket.level}::${g.tailText}#${g.perPosition.map(b => b ? '1' : '0').join('')}`}
                {@const isOpen = expandedGroups.has(groupKey)}
                <li class="flex flex-col">
                  <button
                    class="group flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition {isOpen
                      ? 'border-sky-400 bg-sky-50 text-sky-900 dark:border-sky-600 dark:bg-sky-950/40 dark:text-sky-200'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 hover:border-sky-300 hover:bg-sky-50/50 dark:hover:border-sky-700 dark:hover:bg-sky-950/20'}"
                    onclick={() => toggleGroup(groupKey)}
                  >
                    <!-- Tail text with per-position match coloring -->
                    <span class="font-sans">
                      {#each g.tailChars as ch, i (i)}
                        {@const ok = g.perPosition[i]}
                        <span class="{ok
                          ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                          : 'text-rose-600 dark:text-rose-400'}">{ch}</span>
                      {/each}
                    </span>
                    <span class="font-mono text-[10px] text-zinc-500">{g.hits.length}</span>
                    <span class="text-zinc-400">{isOpen ? '▾' : '▸'}</span>
                  </button>

                  {#if isOpen}
                    <!-- Expanded member list -->
                    <ul class="mt-1.5 space-y-1 rounded border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                      {#each g.hits as hit, hi (hit.text)}
                        <li class="flex items-baseline justify-between gap-2 rounded px-1.5 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                          <span class="flex-1 text-sm text-zinc-900 dark:text-zinc-100">
                            {#if hit.phraseLen === g.tailText.length}
                              {hit.text}
                            {:else}
                              <span class="text-zinc-400 dark:text-zinc-600">{hit.text.slice(0, hit.matchOffset)}</span><span class="text-emerald-700 dark:text-emerald-400 font-semibold">{hit.text.slice(hit.matchOffset, hit.matchOffset + g.tailText.length)}</span><span class="text-zinc-400 dark:text-zinc-600">{hit.text.slice(hit.matchOffset + g.tailText.length)}</span>
                            {/if}
                            {#if hit.properNoun}
                              <span class="ml-1 text-[9px] text-zinc-400">({t('名', 'name')})</span>
                            {/if}
                          </span>
                          <span class="shrink-0 font-mono text-[10px] text-zinc-400">{hit.source.split('-')[0]}</span>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </li>
              {/each}
            </ul>

            {#if groups.length > limit}
              <div class="mt-3 text-center">
                <button
                  class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  onclick={() => showAllChips(bucket.level, groups.length)}
                >
                  {t(`显示全部 ${groups.length} 种尾韵`, `Show all ${groups.length} tails`)}
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else if mode === 'tail' && tailResult}
      <p class="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        {t(
          `共 ${tailResult.totalHits} 条候选，按尾押深度排序（K 越大，末尾押得越深）：`,
          `${tailResult.totalHits} candidates, sorted by tail-rhyme depth (larger K = deeper tail match):`
        )}
      </p>

      <div class="space-y-4">
        {#each tailResult.buckets as bucket (bucket.tailK)}
          {@const visible = chipLimit(bucket.tailK)}
          {@const renderedHits = bucket.hits.slice(0, visible)}
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div class="mb-3 flex items-baseline justify-between">
              <p class="font-semibold text-zinc-800 dark:text-zinc-200">
                {bucket.tailK} {t('押', '-rhyme')}
                <span class="ml-2 font-normal text-zinc-500">{t(`末尾 ${bucket.tailK} 个音节完全押`, `last ${bucket.tailK} syllables all rhyme`)}</span>
              </p>
              <span class="font-mono text-xs text-zinc-500">
                {#if bucket.hits.length > renderedHits.length}
                  {renderedHits.length} / {bucket.hits.length} {t('条', 'hits')}
                {:else}
                  {bucket.hits.length} {t('条', 'hits')}
                {/if}
              </span>
            </div>

            <ul class="space-y-2">
              {#each renderedHits as hit (hit.phrase.text)}
                <li class="rounded border border-zinc-100 dark:border-zinc-800 p-3">
                  <div class="mb-1.5 flex items-baseline justify-between">
                    <span class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {hit.phrase.text}
                    </span>
                    <span class="font-mono text-xs text-zinc-400">
                      {hit.phrase.length} {t('音节', 'syllables')}
                    </span>
                  </div>
                  <div class="flex flex-wrap items-center gap-1 font-mono text-xs">
                    {#each hit.phrase.finals as f, i (i)}
                      {@const inTail = i >= hit.phrase.finals.length - hit.tailK}
                      {@const isHov = hoveredKey !== null && f === hoveredKey}
                      <span
                        class="rounded px-1.5 py-0.5 transition-all {inTail
                          ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}
                          {isHov ? 'ring-2 ring-sky-500 scale-110 z-10' : ''}"
                      >
                        {f}
                      </span>
                    {/each}
                    {#if hit.phrase.tags.length > 0}
                      <span class="ml-auto text-zinc-400">
                        {hit.phrase.tags.map((tag) => `#${tag}`).join(' ')}
                      </span>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>

            {#if bucket.hits.length > renderedHits.length}
              <div class="mt-3 text-center">
                <button
                  class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  onclick={() => showAllChips(bucket.tailK, bucket.hits.length)}
                >
                  {t(`展开全部 ${bucket.hits.length}`, `Show all ${bucket.hits.length}`)}
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <footer class="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-6 text-sm text-zinc-500">
    <p>
      <a href="{base}/" class="text-zinc-700 dark:text-zinc-300 underline hover:text-zinc-900 dark:text-zinc-100">{t('主页', 'Home')}</a>
      ·
      <a href="{base}/analyze" class="text-zinc-700 dark:text-zinc-300 underline hover:text-zinc-900 dark:text-zinc-100">{t('歌词分析', 'Analyze')}</a>
      ·
      <a
        href="https://github.com/QianyangPeng/chinese-rhyme-finder"
        class="text-zinc-700 dark:text-zinc-300 underline hover:text-zinc-900 dark:text-zinc-100"
      >
        GitHub
      </a>
    </p>
  </footer>
</div>
