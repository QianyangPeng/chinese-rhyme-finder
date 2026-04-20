<script lang="ts">
  /**
   * 押韵集 · /search — rhyme lookup page.
   *
   * All heavy lifting (lexicon load + search + grouping) runs in a
   * Web Worker (`searchClient`). Main thread holds only the UI and
   * the current result object. Typing is instant; search runs off-
   * thread and populates results asynchronously.
   */
  import { parseSyllables } from '$lib/core/pinyin';
  import type { ToneMode } from '$lib/core/rhyme';
  import {
    searchClient,
    type GroupedSearchResult,
    type TailGroup
  } from '$lib/workers/searchClient.svelte';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { t } from '$lib/stores/lang.svelte';

  // ── Query state (URL-synced) ─────────────────────────────────
  let query = $state('降维打击');
  let toneMode = $state<ToneMode>('none');
  let requireTailMatch = $state(true);
  let windowMode = $state<'tail' | 'anywhere'>('tail');
  let urlReady = $state(false);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const tParam = params.get('tone');
    const tailReq = params.get('tail_req');
    const win = params.get('win');
    if (q) query = q;
    if (tParam === 'exact' || tParam === 'pingze') toneMode = tParam;
    if (tailReq === '0') requireTailMatch = false;
    if (win === 'anywhere') windowMode = 'anywhere';
    urlReady = true;
    // Kick off the worker. It will fetch the lexicon on its own thread.
    searchClient.init(base);
  });

  $effect(() => {
    if (!urlReady || typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
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
    navigator.clipboard.writeText(window.location.href)
      .then(() => { copiedAt = Date.now(); })
      .catch(() => {});
  }

  // ── Query parsing (cheap, stays on main thread) ─────────────
  const querySyllables = $derived(parseSyllables(query));
  const queryFinals = $derived(querySyllables.map((s) => s.final));
  const queryTones = $derived(querySyllables.map((s) => s.tone));

  // ── Debounced worker search ─────────────────────────────────
  let result = $state<GroupedSearchResult | null>(null);
  let searchInFlight = $state(false);
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSearchKey = '';

  $effect(() => {
    // Track everything that affects the search.
    void query; void toneMode; void requireTailMatch; void windowMode;
    // Only search when corpus is ready AND we have a query.
    const trimmed = query.trim();
    if (!trimmed || queryFinals.length === 0) {
      result = null;
      return;
    }

    const key = `${trimmed}|${toneMode}|${requireTailMatch ? '1' : '0'}|${windowMode}`;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(async () => {
      if (key === lastSearchKey) return;
      lastSearchKey = key;
      searchInFlight = true;
      try {
        const r = await searchClient.search({
          target: queryFinals,
          targetTones: queryTones,
          excludeText: trimmed,
          toneMode,
          requireTailMatch,
          windowMode
        });
        // Drop the result if a newer query has already been requested.
        if (key === lastSearchKey) result = r;
      } catch (err) {
        console.error('[search]', err);
      } finally {
        searchInFlight = false;
      }
    }, 150);
  });

  // Re-run the current query whenever the worker's readiness changes —
  // in practice this covers: initial "progress" update with some data,
  // then "ready" with full data. Results update in-place.
  $effect(() => {
    void searchClient.isReady;
    void searchClient.phrasesLoaded;
    lastSearchKey = ''; // force next effect pass to re-run search
  });

  // ── UI state for group expansion / chip limit ────────────────
  const LEVEL_CHIP_LIMIT = 100;
  let expandedGroups = $state<Set<string>>(new Set());
  let chipLimitPerLevel = $state<Record<number, number>>({});
  $effect(() => {
    // Reset expansion & chip limits when query context changes.
    void query; void toneMode; void requireTailMatch; void windowMode;
    expandedGroups = new Set();
    chipLimitPerLevel = {};
  });
  function toggleGroup(key: string) {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key); else next.add(key);
    expandedGroups = next;
  }
  function chipLimit(level: number): number {
    return chipLimitPerLevel[level] ?? LEVEL_CHIP_LIMIT;
  }
  function showAllChips(level: number, total: number) {
    chipLimitPerLevel = { ...chipLimitPerLevel, [level]: total };
  }

  function presetExample(q: string) { query = q; }
  const PRESETS = ['降维打击', '星辰大海', '春暖花开', '相对华丽', '岁月静好', '一帆风顺'];

  const totalHits = $derived(result?.totalHits ?? 0);
  const corpusLoadedText = $derived(
    searchClient.isReady
      ? t(`${searchClient.phrasesLoaded.toLocaleString()} 条 (全部加载)`, `${searchClient.phrasesLoaded.toLocaleString()} phrases (fully loaded)`)
      : t(`${searchClient.phrasesLoaded.toLocaleString()} 条 · 加载中…`, `${searchClient.phrasesLoaded.toLocaleString()} phrases · loading…`)
  );
</script>

<svelte:head>
  <title>{t('找押韵 · 中文押韵查询 · 押韵集', 'Search Rhymes · Chinese Rhymes')}</title>
  <meta
    name="description"
    content={t(
      '输入任意中文词组，从 80 万条短语里查出全部押韵候选 — 支持双押到多押，按严格到宽松分层显示。',
      'Enter any Chinese phrase to search 800k+ candidates for matching rhymes — multi-syllable depth, layered from strict to loose.'
    )}
  />
  <link rel="canonical" href="https://qianyangpeng.github.io/chinese-rhyme-finder/search/" />
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-12">
  <header class="mb-6">
    <h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{t('找押韵', 'Search')}</h1>
    <p class="mt-2 text-base text-zinc-600 dark:text-zinc-400">
      {t(
        '输入一个词组，从 80 万条短语里找出所有押韵候选。按宽松级别分层，同韵的结果聚成 chip —— 点击 chip 展开全部成员。',
        'Enter a phrase and get every rhyme candidate from 800k+ entries. Results grouped by loosening level, same-tail candidates clustered — click a chip to expand.'
      )}
    </p>
  </header>

  <!-- Preset chips -->
  <div class="mb-3 flex flex-wrap gap-2 text-xs">
    <span class="text-zinc-500">{t('试试：', 'Try:')}</span>
    {#each PRESETS as preset (preset)}
      <button
        class="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        onclick={() => presetExample(preset)}
      >{preset}</button>
    {/each}
  </div>

  <!-- Strictness + window controls -->
  <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
    <span class="text-zinc-500">{t('押韵严格度：', 'Strictness:')}</span>
    <button
      class="rounded border px-2.5 py-1 text-xs {toneMode === 'none'
        ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
      onclick={() => (toneMode = 'none')}
    >{t('韵母一致', 'Rhyme match')}</button>
    <button
      class="rounded border px-2.5 py-1 text-xs {toneMode === 'exact'
        ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
      onclick={() => (toneMode = 'exact')}
    >{t('韵母+声调', 'Rhyme + Tone')}</button>

    <span class="ml-4 text-zinc-500">{t('末位：', 'Last syllable:')}</span>
    <label class="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
      <input type="checkbox" bind:checked={requireTailMatch} class="accent-zinc-900 dark:accent-zinc-100" />
      <span>{t('必须押韵', 'must rhyme')}</span>
    </label>

    <span class="ml-4 text-zinc-500">{t('匹配位置：', 'Window:')}</span>
    <button
      class="rounded border px-2.5 py-1 text-xs {windowMode === 'tail'
        ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
      onclick={() => (windowMode = 'tail')}
    >{t('句末', 'Tail only')}</button>
    <button
      class="rounded border px-2.5 py-1 text-xs {windowMode === 'anywhere'
        ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
      onclick={() => (windowMode = 'anywhere')}
    >{t('句中+句末', 'Anywhere')}</button>
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
      class="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
    >
      {#if copiedAt && Date.now() - copiedAt < 2000}
        ✓ {t('已复制', 'Copied')}
      {:else}
        🔗 {t('分享', 'Share')}
      {/if}
    </button>
  </div>

  <!-- Query breadcrumb -->
  {#if querySyllables.length > 0}
    <div class="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-xs">
      <span class="text-zinc-500">{t('韵母模式：', 'Rhyme pattern:')}</span>
      {#each querySyllables as s, i (i)}
        <span class="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300" title="{s.char} · {s.pinyinWithTone} · {s.final || '?'}">
          <span class="font-sans text-sm">{s.char}</span>
          <span class="ml-1 opacity-60">{s.final}</span>
        </span>
      {/each}
    </div>
  {/if}

  <!-- Corpus / loading badge -->
  <p class="mt-3 text-xs text-zinc-500">
    {t('词库：', 'Corpus:')} <span class="font-mono">{corpusLoadedText}</span>
    {#if searchInFlight}
      <span class="ml-2 text-sky-500">· {t('搜索中…', 'searching…')}</span>
    {/if}
  </p>

  <!-- Results -->
  <section class="mt-6">
    {#if !result && !searchClient.isReady && searchClient.phrasesLoaded === 0}
      <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-6 text-center">
        <p class="text-sm text-zinc-500">{t('正在启动 Web Worker…', 'Starting the search worker…')}</p>
      </div>
    {:else if !result}
      <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-6 text-center">
        <p class="text-sm text-zinc-500">{t('输入一个中文词组试试。', 'Try entering a Chinese phrase.')}</p>
      </div>
    {:else if totalHits === 0}
      <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-6 text-center">
        <p class="text-sm text-zinc-700 dark:text-zinc-300">
          {t('没有找到押韵候选 — 试试换个词，或放宽严格度。', 'No rhyme candidates — try a different phrase or loosen strictness.')}
        </p>
      </div>
    {:else}
      <p class="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        {t(
          `共 ${totalHits.toLocaleString()} 条候选 · 按尾韵相同聚成一组，点击展开`,
          `${totalHits.toLocaleString()} candidates, grouped by identical rhyme tail — click to expand`
        )}
      </p>

      <div class="space-y-4">
        {#each result.levels as levelGroup (levelGroup.level)}
          {@const limit = chipLimit(levelGroup.level)}
          {@const visibleGroups = levelGroup.groups.slice(0, limit)}
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div class="mb-3 flex items-baseline justify-between">
              <p class="font-semibold text-zinc-800 dark:text-zinc-200">
                Level {levelGroup.level}
                <span class="ml-2 font-normal text-zinc-500">
                  {#if levelGroup.level === 0}
                    {t('全押 · 每个位置都匹配', 'Full rhyme · every position matches')}
                  {:else}
                    {t(`${levelGroup.level} 位放宽`, `${levelGroup.level} position${levelGroup.level === 1 ? '' : 's'} relaxed`)}
                  {/if}
                </span>
              </p>
              <span class="font-mono text-xs text-zinc-500">
                {t(
                  `${levelGroup.groups.length} 种尾韵 · ${levelGroup.totalHits} 条`,
                  `${levelGroup.groups.length} tail${levelGroup.groups.length === 1 ? '' : 's'} · ${levelGroup.totalHits} total`
                )}
              </span>
            </div>

            <ul class="flex flex-wrap gap-1.5">
              {#each visibleGroups as g, gi (g.tailText + '#' + gi)}
                {@const perKey = g.perPosition.map((b: boolean) => b ? '1' : '0').join('')}
                {@const groupKey = `${levelGroup.level}::${g.tailText}#${perKey}`}
                {@const isOpen = expandedGroups.has(groupKey)}
                <li class="flex flex-col">
                  <button
                    class="flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition {isOpen
                      ? 'border-sky-400 bg-sky-50 text-sky-900 dark:border-sky-600 dark:bg-sky-950/40 dark:text-sky-200'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 hover:border-sky-300 hover:bg-sky-50/50 dark:hover:border-sky-700 dark:hover:bg-sky-950/20'}"
                    onclick={() => toggleGroup(groupKey)}
                  >
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
                    <ul class="mt-1.5 space-y-1 rounded border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                      {#each g.hits as hit (hit.text)}
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

            {#if levelGroup.groups.length > limit}
              <div class="mt-3 text-center">
                <button
                  class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  onclick={() => showAllChips(levelGroup.level, levelGroup.groups.length)}
                >
                  {t(`显示全部 ${levelGroup.groups.length} 种尾韵`, `Show all ${levelGroup.groups.length} tails`)}
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
      <a href="{base}/" class="text-zinc-700 dark:text-zinc-300 underline">{t('主页', 'Home')}</a>
      ·
      <a href="{base}/analyze" class="text-zinc-700 dark:text-zinc-300 underline">{t('歌词分析', 'Analyze')}</a>
      ·
      <a href="https://github.com/QianyangPeng/chinese-rhyme-finder" class="text-zinc-700 dark:text-zinc-300 underline">GitHub</a>
    </p>
  </footer>
</div>
