<script lang="ts">
  import { parseSyllables } from '$lib/core/pinyin';
  import { strictScheme } from '$lib/core/rhyme';
  import type { ToneMode } from '$lib/core/rhyme';
  import {
    getCurrentLexicon,
    ensureExtendedLexicon,
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

    // Fire-and-forget: swap in the big lexicon once it loads.
    ensureExtendedLexicon(base).then((lex) => {
      lexicon = lex;
    });
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

  const fullResult = $derived(
    mode === 'full' && queryFinals.length > 0
      ? searchByFinals(queryFinals, scheme, lexicon, {
          excludeText: query.trim(),
          // No cap — keep all candidates the search finds. The render
          // layer below uses per-bucket `visibleCount` + "load more" so
          // we don't mount tens of thousands of DOM nodes at once on
          // very common patterns. Users see unlimited results on demand.
          maxPerBucket: Number.POSITIVE_INFINITY,
          toneMode,
          targetTones: queryTones,
          requireTailMatch,
          windowMode
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

  // ── Progressive disclosure ────────────────────────────────────────
  // Search returns unbounded hits per bucket; render layer caps mount
  // at PAGE_SIZE per bucket, expand on button click. Keeps the DOM
  // light on very common queries while preserving all results.
  const PAGE_SIZE = 100;
  let visiblePerBucket = $state<Record<number, number>>({});
  // Reset visible counts when query / mode / scheme changes.
  $effect(() => {
    void query; void mode; void toneMode; void requireTailMatch; void windowMode;
    visiblePerBucket = {};
  });
  function shownCount(level: number): number {
    return visiblePerBucket[level] ?? PAGE_SIZE;
  }
  function loadMore(level: number, total: number) {
    visiblePerBucket = { ...visiblePerBucket, [level]: Math.min((visiblePerBucket[level] ?? PAGE_SIZE) + PAGE_SIZE, total) };
  }
  function showAll(level: number, total: number) {
    visiblePerBucket = { ...visiblePerBucket, [level]: total };
  }

  const tailResult = $derived(
    mode === 'tail' && queryFinals.length > 0
      ? searchByTail(queryFinals, scheme, lexicon, {
          excludeText: query.trim(),
          minTailK: 2,
          maxPerBucket: Number.POSITIVE_INFINITY,
          toneMode,
          targetTones: queryTones
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
          `共 ${fullResult.totalHits} 条候选，按宽松级别分层（Level 0 = 全严格匹配；Level k = 第 k 位放宽）：`,
          `${fullResult.totalHits} candidates, grouped by loosening level (Level 0 = all positions match; Level k = k positions relaxed):`
        )}
      </p>

      <div class="space-y-4">
        {#each fullResult.buckets as bucket (bucket.level)}
          {@const visible = shownCount(bucket.level)}
          {@const renderedHits = bucket.hits.slice(0, visible)}
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
                {#if bucket.hits.length > renderedHits.length}
                  {renderedHits.length} / {bucket.hits.length} {t('条', 'hits')}
                {:else}
                  {bucket.hits.length} {t('条', 'hits')}
                {/if}
              </span>
            </div>

            <ul class="space-y-2">
              {#each renderedHits as hit (hit.phrase.text)}
                {@const winStart = hit.matchOffset}
                {@const winEnd = winStart + hit.match.perPosition.length}
                {@const phraseChars = [...hit.phrase.text].filter((ch) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch))}
                <li class="rounded border border-zinc-100 dark:border-zinc-800 p-3">
                  <div class="mb-1.5 flex items-baseline justify-between gap-3">
                    <span class="flex-1 text-base font-semibold">
                      {#each phraseChars as ch, i (i)}
                        {@const inWindow = i >= winStart && i < winEnd}
                        {@const matched = inWindow && hit.match.perPosition[i - winStart]}
                        <span class="{inWindow
                          ? matched
                            ? 'text-emerald-700 dark:text-emerald-400 underline decoration-emerald-400/60 decoration-2 underline-offset-4'
                            : 'text-rose-600 dark:text-rose-400'
                          : 'text-zinc-500 dark:text-zinc-500'}">{ch}</span>
                      {/each}
                    </span>
                    <span class="shrink-0 font-mono text-xs text-zinc-400">
                      {hit.match.matchedPositions.length}/{hit.match.comparedLength} {t('押', 'rhymed')}{winStart > 0 ? t(' · 句中', ' · mid') : ''}
                    </span>
                  </div>
                  <div class="flex flex-wrap items-center gap-1 font-mono text-xs">
                    {#each hit.phrase.finals as f, i (i)}
                      {@const inWindow = i >= winStart && i < winEnd}
                      {@const matched = inWindow && hit.match.perPosition[i - winStart]}
                      {@const isHov = hoveredKey !== null && f === hoveredKey}
                      <span
                        class="rounded px-1.5 py-0.5 transition-all {matched
                          ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                          : inWindow
                            ? 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200'
                            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'}
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
              <div class="mt-3 flex items-center justify-center gap-2">
                <button
                  class="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  onclick={() => loadMore(bucket.level, bucket.hits.length)}
                >
                  {t(
                    `再加载 ${Math.min(PAGE_SIZE, bucket.hits.length - renderedHits.length)} 条`,
                    `Load ${Math.min(PAGE_SIZE, bucket.hits.length - renderedHits.length)} more`
                  )}
                </button>
                <button
                  class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  onclick={() => showAll(bucket.level, bucket.hits.length)}
                >
                  {t(`展开全部 ${bucket.hits.length}`, `Show all ${bucket.hits.length}`)}
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
          {@const visible = shownCount(bucket.tailK)}
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
              <div class="mt-3 flex items-center justify-center gap-2">
                <button
                  class="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  onclick={() => loadMore(bucket.tailK, bucket.hits.length)}
                >
                  {t(
                    `再加载 ${Math.min(PAGE_SIZE, bucket.hits.length - renderedHits.length)} 条`,
                    `Load ${Math.min(PAGE_SIZE, bucket.hits.length - renderedHits.length)} more`
                  )}
                </button>
                <button
                  class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  onclick={() => showAll(bucket.tailK, bucket.hits.length)}
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
