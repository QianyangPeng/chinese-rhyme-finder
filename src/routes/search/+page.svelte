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
  import { SOURCES, sourceMeta, SOURCE_IDS_BY_PRIORITY } from '$lib/util/sources';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { t, lang } from '$lib/stores/lang.svelte';

  // ── Query state (URL-synced) ─────────────────────────────────
  let query = $state('降维打击');
  let toneMode = $state<ToneMode>('none');
  let requireTailMatch = $state(true);
  let windowMode = $state<'tail' | 'anywhere'>('tail');
  let urlReady = $state(false);

  // Which sources are enabled. Default ALL on; user can toggle.
  let enabledSources = $state<Record<string, boolean>>(
    Object.fromEntries(SOURCES.map((s) => [s.id, true]))
  );
  // Per-source collapsed state (separate from enable/disable).
  let collapsedSources = $state<Record<string, boolean>>({});
  function toggleSourceEnabled(id: string) {
    enabledSources = { ...enabledSources, [id]: !enabledSources[id] };
  }
  function toggleSourceCollapsed(id: string) {
    collapsedSources = { ...collapsedSources, [id]: !collapsedSources[id] };
  }
  const enabledSourceIds = $derived(
    Object.keys(enabledSources).filter((id) => enabledSources[id])
  );

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
    void query; void toneMode; void requireTailMatch; void windowMode;
    void searchClient.isReady;
    void searchClient.phrasesLoaded;
    void enabledSourceIds;

    const trimmed = query.trim();
    if (!trimmed || queryFinals.length === 0) {
      result = null;
      return;
    }
    if (searchClient.phrasesLoaded === 0) return;

    const sourcesKey = enabledSourceIds.sort().join(',');
    const key = `${trimmed}|${toneMode}|${requireTailMatch ? '1' : '0'}|${windowMode}|${searchClient.phrasesLoaded}|${sourcesKey}`;
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
          windowMode,
          enabledSources: enabledSourceIds
        });
        if (key === lastSearchKey) result = r;
      } catch (err) {
        console.error('[search]', err);
      } finally {
        searchInFlight = false;
      }
    }, 150);
  });

  // ── UI state for group expansion / chip limit ────────────────
  // Initial chip render cap. 100 chips + their spans = ~700ms re-render
  // stall on modest hardware; 30 makes even re-renders feel instant.
  // "Show all N tails" remains a click away.
  const SOURCE_CHIP_LIMIT = 30;
  let expandedGroups = $state<Set<string>>(new Set());
  let chipLimitPerKey = $state<Record<string, number>>({});
  $effect(() => {
    void query; void toneMode; void requireTailMatch; void windowMode;
    expandedGroups = new Set();
    chipLimitPerKey = {};
  });
  function toggleGroup(key: string) {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key); else next.add(key);
    expandedGroups = next;
  }
  function chipLimit(key: string | number): number {
    return chipLimitPerKey[String(key)] ?? SOURCE_CHIP_LIMIT;
  }
  function showAllChips(key: string | number, total: number) {
    chipLimitPerKey = { ...chipLimitPerKey, [String(key)]: total };
  }

  // ── Source-grouped view helpers ──────────────────────────────
  interface SourceBucket {
    sourceId: string;
    groups: TailGroup[];
    totalHits: number;
  }

  /** A tail-group's "primary source" = highest-priority source among
   *  its hits. The chip lives in that source's mini-section and is NOT
   *  repeated in other sections. When expanded, we show ALL hits in the
   *  group (regardless of their own source) — users see every phrase
   *  that rhymes this way, with each hit tagged by its own source badge. */
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

  </div>

  <!-- Source toggles -->
  <div class="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
    <span class="text-zinc-500 mr-1">{t('语料源：', 'Sources:')}</span>
    {#each SOURCES as src (src.id)}
      {@const on = enabledSources[src.id]}
      <button
        class="rounded px-2 py-1 font-mono text-[10px] transition select-none {on
          ? `${src.badgeCls} ring-1 ring-current`
          : 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 line-through'}"
        title={on ? t('点击关闭', 'click to hide') : t('点击打开', 'click to show')}
        onclick={() => toggleSourceEnabled(src.id)}
      >{lang.current === 'zh' ? src.zh : src.en}</button>
    {/each}
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
          {@const grouped = partitionGroupsBySource(levelGroup.groups)}
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div class="mb-3 flex items-baseline justify-between">
              <p class="font-semibold text-zinc-800 dark:text-zinc-200">
                Level {levelGroup.level}
                <span class="ml-2 font-normal text-zinc-500">
                  {#if levelGroup.level === 0}
                    {t('全押 · 查询的每个字都押上了', 'Full rhyme · every query char matched')}
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

            <!-- Partition groups by their primary source, then render
                 one mini-section per source in priority order. -->
            <div class="space-y-2">
            {#each grouped as sg (sg.sourceId)}
              {@const smeta = sourceMeta(sg.sourceId)}
              {@const isCollapsed = collapsedSources[`${levelGroup.level}::${sg.sourceId}`]}
              <section class="flex gap-2">
                <!-- Colored left bar -->
                <div class="w-1 shrink-0 self-stretch rounded {smeta.barCls}"></div>
                <div class="flex-1 min-w-0">
                  <header class="mb-1.5 flex items-baseline justify-between">
                    <button
                      class="inline-flex items-baseline gap-1.5 rounded px-1 py-0.5 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      onclick={() => toggleSourceCollapsed(`${levelGroup.level}::${sg.sourceId}`)}
                    >
                      <span class="text-zinc-400">{isCollapsed ? '▸' : '▾'}</span>
                      <span class="rounded px-1.5 py-0.5 {smeta.badgeCls}">{lang.current === 'zh' ? smeta.zh : smeta.en}</span>
                      <span class="font-mono font-normal text-zinc-500">
                        {t(`${sg.groups.length} 种 · ${sg.totalHits} 条`, `${sg.groups.length} tails · ${sg.totalHits} total`)}
                      </span>
                    </button>
                  </header>
                  {#if !isCollapsed}
                    {@const srcKey = `${levelGroup.level}::${sg.sourceId}`}
                    {@const limit = chipLimit(srcKey)}
                    {@const visibleGroups = sg.groups.slice(0, limit)}
                    <ul class="flex flex-wrap gap-1.5">
                      {#each visibleGroups as g, gi (g.tailText + '#' + gi)}
                        {@const perKey = g.perPosition.map((b: boolean) => b ? '1' : '0').join('')}
                        {@const groupKey = `${levelGroup.level}::${sg.sourceId}::${g.tailText}#${perKey}`}
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
                            <span class="font-mono text-[10px] text-zinc-500">{g.totalCount}</span>
                            <span class="text-zinc-400">{isOpen ? '▾' : '▸'}</span>
                          </button>

                          {#if isOpen}
                            <ul class="mt-1.5 space-y-1 rounded border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                              {#each g.hits as hit (hit.text)}
                                {@const hmeta = sourceMeta(hit.source)}
                                <li class="rounded px-1.5 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                                  <div class="flex items-baseline justify-between gap-2">
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
                                    <span class="shrink-0 rounded px-1 py-0.5 text-[9px] {hmeta.badgeCls}">
                                      {lang.current === 'zh' ? hmeta.zh : hmeta.en}
                                    </span>
                                  </div>
                                  {#if hit.pinyin && hit.pinyin.length > 0}
                                    <p class="mt-0.5 font-mono text-[10px] text-zinc-400">
                                      {hit.pinyin.join(' ')}
                                    </p>
                                  {/if}
                                </li>
                              {/each}
                              {#if g.totalCount > g.hits.length}
                                <li class="px-1.5 py-1 text-[11px] italic text-zinc-400">
                                  {t(`…还有 ${g.totalCount - g.hits.length} 条未显示`, `…and ${g.totalCount - g.hits.length} more not shown`)}
                                </li>
                              {/if}
                            </ul>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                    {#if sg.groups.length > visibleGroups.length}
                      <button
                        class="mt-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        onclick={() => showAllChips(srcKey, sg.groups.length)}
                      >
                        {t(`展开全部 ${sg.groups.length} 种`, `Show all ${sg.groups.length} tails`)}
                      </button>
                    {/if}
                  {/if}
                </div>
              </section>
            {/each}
            </div>
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
