<script lang="ts">
  import { strictScheme } from '$lib/core/rhyme';
  import type { ToneMode } from '$lib/core/rhyme';
  import {
    getCurrentLexicon,
    ensureExtendedLexicon
  } from '$lib/core/corpus';
  import type { Lexicon, PhraseRecord } from '$lib/core/corpus';
  import { mineClusters } from '$lib/core/discover';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { favorites } from '$lib/stores/favorites.svelte';

  // Simplified: just default (cleverness-sorted) or saved (favorites).
  // Lens tabs were removed — per-source toggles + depth selector give
  // users all the filtering they need without cognitive overhead.
  type Lens = 'featured' | 'saved';

  /**
   * Small corner badge on each member card identifying which source the
   * phrase came from. Keeps the user aware of register at a glance:
   * classical 成语 vs 歇后语 vs modern 网络词 all have different vibes.
   */
  const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
    'xinhua-idiom':        { label: '成语', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
    'xinhua-xiehouyu':     { label: '歇后', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' },
    'chinese-poetry/tang': { label: '唐诗', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' },
    'chinese-poetry/song': { label: '宋词', cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200' },
    'wiktionary-slang':    { label: '网络', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
    'opensubtitles-zh':    { label: '口语', cls: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200' },
    'lyrics-hiphop':       { label: '说唱', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' },
    'lyrics-pop':          { label: '歌词', cls: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200' }
  };

  function sourceBadge(source: string): { label: string; cls: string } {
    return SOURCE_BADGES[source] ?? {
      label: '语料',
      cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
    };
  }

  /**
   * POS-family color + label for a jieba ICTCLAS tag. The underlying
   * tagset has ~40 tags; we collapse into 7 families that matter for
   * rap-style pattern recognition.
   *   n/nr/ns/nz/nt/nl → noun (blue)
   *   v/vn/vd          → verb (red)
   *   a/ad/an/z        → adjective-ish (amber)
   *   d                → adverb (emerald)
   *   i/l              → idiom/fixed (violet)
   *   m/q              → numeral/classifier (cyan)
   *   u/r/c/p/y/e/o/k  → function word (zinc)
   */
  function posFamily(pos: string): { cls: string; label: string } {
    if (pos === 'nr' || pos === 'nrt') return { cls: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-200', label: pos };
    if (pos === 'ns')                   return { cls: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200', label: pos };
    if (pos.startsWith('n'))            return { cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200', label: pos };
    if (pos.startsWith('v'))            return { cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200', label: pos };
    if (pos.startsWith('a') || pos === 'z') return { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200', label: pos };
    if (pos === 'd')                    return { cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200', label: pos };
    if (pos === 'i' || pos === 'l')     return { cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200', label: pos };
    if (pos === 'm' || pos === 'q')     return { cls: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200', label: pos };
    // function words (particles, pronouns, conjunctions) — muted
    return { cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500', label: pos };
  }

  let toneMode = $state<ToneMode>('none');
  let minDepth = $state(2);
  let minMembers = $state(3);
  let tailOnly = $state(true);
  let lens = $state<Lens>('featured');
  // Per-source toggles: user can enable/disable each corpus independently.
  // Classical sources default off; modern sources default on.
  const SOURCE_TOGGLES: Array<{ id: string; label: string; defaultOn: boolean }> = [
    { id: 'xinhua-idiom',        label: '成语', defaultOn: true },
    { id: 'opensubtitles-zh',    label: '口语', defaultOn: true },
    { id: 'wiktionary-slang',    label: '网络', defaultOn: true },
    { id: 'lyrics-hiphop',       label: '说唱', defaultOn: true },
    { id: 'lyrics-pop',          label: '歌词', defaultOn: true },
    { id: 'chinese-poetry/tang', label: '唐诗', defaultOn: false },
    { id: 'chinese-poetry/song', label: '宋词', defaultOn: false },
    { id: 'xinhua-xiehouyu',     label: '歇后', defaultOn: false },
  ];
  let enabledSources = $state<Record<string, boolean>>(
    Object.fromEntries(SOURCE_TOGGLES.map((s) => [s.id, s.defaultOn]))
  );
  let urlReady = $state(false);
  let lexicon = $state<Lexicon>(getCurrentLexicon());
  let extendedLoading = $state(false);

  // URL-based state overrides applied only after mount to avoid touching
  // searchParams during SvelteKit's build-time prerender.
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const d = Number.parseInt(params.get('depth') ?? '', 10);
    const m = Number.parseInt(params.get('members') ?? '', 10);
    const t = params.get('tail');
    const tone = params.get('tone');
    if (Number.isFinite(d) && d >= 1) minDepth = d;
    if (Number.isFinite(m) && m >= 2) minMembers = m;
    if (t === 'all') tailOnly = false;
    if (tone === 'exact' || tone === 'pingze') toneMode = tone;
    const lensParam = params.get('lens');
    if (lensParam === 'saved') lens = lensParam;
    // Per-source overrides: ?off=xinhua-idiom,opensubtitles-zh  or  ?on=chinese-poetry/tang
    const offParam = params.get('off');
    const onParam = params.get('on');
    if (offParam) for (const s of offParam.split(',')) enabledSources[s] = false;
    if (onParam) for (const s of onParam.split(',')) enabledSources[s] = true;
    urlReady = true;

    // If not already loaded, show a loading hint and swap in when ready.
    if (lexicon.phrases.length < 5000) {
      extendedLoading = true;
      ensureExtendedLexicon(base)
        .then((lex) => {
          lexicon = lex;
        })
        .finally(() => {
          extendedLoading = false;
        });
    }
  });

  // Mirror state → URL for sharing.
  $effect(() => {
    if (!urlReady || typeof window === 'undefined') return;
    const qp = new URLSearchParams();
    if (toneMode !== 'none') qp.set('tone', toneMode);
    if (minDepth !== 2) qp.set('depth', String(minDepth));
    if (minMembers !== 3) qp.set('members', String(minMembers));
    if (!tailOnly) qp.set('tail', 'all');
    if (lens !== 'featured') qp.set('lens', lens);
    // Encode source toggles: only non-default states
    const offSources = SOURCE_TOGGLES.filter((s) => s.defaultOn && !enabledSources[s.id]).map((s) => s.id);
    const onSources = SOURCE_TOGGLES.filter((s) => !s.defaultOn && enabledSources[s.id]).map((s) => s.id);
    if (offSources.length) qp.set('off', offSources.join(','));
    if (onSources.length) qp.set('on', onSources.join(','));
    const qs = qp.toString();
    const url = `${base}/discover/${qs ? '?' + qs : ''}`;
    if (window.location.pathname + window.location.search !== url) {
      history.replaceState(history.state, '', url);
    }
  });

  const scheme = strictScheme; // UI exposes only 严式

  /** Build a derivative Lexicon keeping only phrases from enabled sources.
   *  Memoized by a cache key string so toggling one source doesn't
   *  rebuild from scratch if the same combo was seen before. */
  const _filteredLexiconCache = new Map<string, Lexicon>();
  function getFilteredLexicon(full: Lexicon, enabled: Record<string, boolean>): Lexicon {
    const key = SOURCE_TOGGLES.map((s) => (enabled[s.id] ? '1' : '0')).join('');
    const allOn = !key.includes('0');
    if (allOn) return full;
    const cached = _filteredLexiconCache.get(key);
    if (cached) return cached;
    const allowedSet = new Set(SOURCE_TOGGLES.filter((s) => enabled[s.id]).map((s) => s.id));
    const phrases = full.phrases.filter((p) => allowedSet.has(p.source));
    const byLength = new Map<number, number[]>();
    for (let id = 0; id < phrases.length; id++) {
      const L = phrases[id].length;
      let bucket = byLength.get(L);
      if (!bucket) {
        bucket = [];
        byLength.set(L, bucket);
      }
      bucket.push(id);
    }
    const out: Lexicon = { phrases, byLength };
    _filteredLexiconCache.set(key, out);
    return out;
  }

  const activeLexicon = $derived(
    getFilteredLexicon(lexicon, enabledSources)
  );

  // Mine clusters with deferred computation so the UI can show a spinner.
  // mineClusters is synchronous and blocks the main thread for 2-4s on
  // 100k+ lexicons. Using $effect + setTimeout(0) lets the spinner
  // paint before the heavy work begins.
  let rawCatalog = $state(
    mineClusters(getCurrentLexicon(), scheme, {
      minPatternLength: minDepth,
      minMembers,
      tailOnly,
      toneMode,
      maxClusters: 8000
    })
  );
  let miningInProgress = $state(false);

  $effect(() => {
    // Track all dependencies that trigger re-mining.
    const lex = activeLexicon;
    const depth = minDepth;
    const members = minMembers;
    const tail = tailOnly;
    const tone = toneMode;

    miningInProgress = true;
    // Defer to next frame so the spinner renders before computation blocks.
    const timer = setTimeout(() => {
      rawCatalog = mineClusters(lex, scheme, {
        minPatternLength: depth,
        minMembers: members,
        tailOnly: tail,
        toneMode: tone,
        maxClusters: 8000
      });
      miningInProgress = false;
    }, 20);
    return () => clearTimeout(timer);
  });

  // (Removed: specificTags, avgQuality, memberSources — lens tabs gone)

  /**
   * Collapse template-filler duplication inside a cluster. Two grouping
   * signals, a member is shelved if EITHER fires:
   *
   *   1. **Identical tail** (same last N chars, where N = cluster.patternLength).
   *      This catches `...什么名字` variants (`叫什么名字`, `你叫什么名字`,
   *      `他叫什么名字`…) and `...来的时候` variants — all share the exact
   *      same rhyming anchor text, only differ in optional prefix.
   *
   *   2. **First-word + POS pattern** (old signal).
   *      Catches `不会X`, `没有X`, `可以X` families where the prefix is the
   *      same small verb/particle but the tail word varies.
   *
   * Members survive if they're in a singleton group under both signals.
   * Top `maxPerGroup` by quality kept per group.
   */
  function stemDedupe(
    members: readonly { phraseId: number; tailOffset: number }[],
    lexiconRef: readonly PhraseRecord[],
    patternLength: number,
    maxPerGroup = 1
  ): { visible: typeof members; collapsed: number } {
    type M = { phraseId: number; tailOffset: number };
    const byTail = new Map<string, M[]>();
    const byHead = new Map<string, M[]>();
    for (const m of members) {
      const phrase = lexiconRef[m.phraseId];
      const chars = [...phrase.text];

      // Signal 1: literal tail string of length patternLength. Members of
      // the same cluster necessarily rhyme on these positions, so when the
      // LITERAL characters also coincide, they're template variants.
      const tailKey = chars.slice(Math.max(0, chars.length - patternLength)).join('');

      // Signal 2: first segment text + POS skeleton.
      const firstSeg = phrase.segments?.[0]?.text ?? chars[0] ?? '';
      const pos = phrase.segments?.map((s) => s.pos).join('|') ?? 'nosegs';
      const headKey = `${firstSeg}::${pos}`;

      let g = byTail.get(tailKey);
      if (!g) { g = []; byTail.set(tailKey, g); }
      g.push(m);

      g = byHead.get(headKey);
      if (!g) { g = []; byHead.set(headKey, g); }
      g.push(m);
    }

    const hidden = new Set<number>();
    const processGroups = (groups: Iterable<M[]>) => {
      for (const group of groups) {
        if (group.length <= maxPerGroup) continue;
        const sorted = [...group].sort(
          (a, b) => lexiconRef[b.phraseId].quality - lexiconRef[a.phraseId].quality
        );
        for (let i = maxPerGroup; i < sorted.length; i++) {
          hidden.add(sorted[i].phraseId);
        }
      }
    };
    processGroups(byTail.values());
    processGroups(byHead.values());

    if (hidden.size === 0) {
      return { visible: members, collapsed: 0 };
    }
    return {
      visible: members.filter((m) => !hidden.has(m.phraseId)),
      collapsed: hidden.size
    };
  }

  /** Catalog derivation: apply dedup per cluster, then enforce minMembers
   *  on the VISIBLE count (not raw count). Clusters where dedup collapses
   *  everything down to 1 visible member are dropped — no discovery value. */
  const catalog = $derived(
    (() => {
      const input = lens === 'saved'
        ? rawCatalog.clusters.filter((c) => favorites.has(c.id))
        : rawCatalog.clusters;

      // Apply stemDedupe to each cluster, then filter by visible >= minMembers.
      const withDedup = input
        .map((cluster) => ({
          cluster,
          deduped: stemDedupe(cluster.members, rawCatalog.lexiconRef, cluster.patternLength)
        }))
        .filter(({ deduped }) => deduped.visible.length >= minMembers);

      return {
        ...rawCatalog,
        clusters: withDedup.slice(0, 200).map(({ cluster }) => cluster),
        // Stash dedup results so render doesn't recompute.
        _deduped: new Map(withDedup.slice(0, 200).map(({ cluster, deduped }) => [cluster.id, deduped]))
      };
    })()
  );

  /** Render at most 5 stars based on cleverness (raw value rescaled). */
  function stars(cleverness: number): string {
    const filled = Math.max(1, Math.min(5, Math.round(cleverness * 2)));
    return '★'.repeat(filled) + '☆'.repeat(5 - filled);
  }

  function copyText(text: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {
        /* fail silently — clipboard not available */
      });
    }
  }
</script>

<svelte:head>
  <title>Discover · 世界最强押韵</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-12">
  <header class="mb-6">
    <h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
      Discover · 灵感发现
    </h1>
    <p class="mt-2 text-base text-zinc-600 dark:text-zinc-400">
      算法挖掘出来的押韵 cluster — 按巧妙度排序。每组里所有短语能套到同一个韵脚。
    </p>
  </header>

  <!-- Lexicon status -->
  {#if extendedLoading}
    <div class="mb-5 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-zinc-700 dark:text-zinc-300">
      正在加载完整词库（3~5 MB 的成语数据集）… 先用 {lexicon.phrases.length} 条种子渲染，一会儿会自动切到完整版。
    </div>
  {:else if lexicon.phrases.length >= 5000}
    <div class="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-zinc-700 dark:text-zinc-300">
      词库已加载 <span class="font-semibold">{lexicon.phrases.length}</span> 条
      （种子 · 新华成语 · 歇后语答案 · 唐诗/宋词三百首片段 · Wiktionary 网络用语）。
    </div>
  {:else}
    <div class="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-zinc-700 dark:text-zinc-300">
      目前只用 {lexicon.phrases.length} 条种子词库（扩展词库未加载成功）。cluster 数量受限。
    </div>
  {/if}

  <!-- Saved toggle (replaces lens tabs) -->
  <div class="mb-5">
    <button
      class="rounded-lg border px-4 py-1.5 text-xs font-semibold transition {lens === 'saved'
        ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300'
        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
      onclick={() => (lens = lens === 'saved' ? 'featured' : 'saved')}
    >
      {lens === 'saved' ? '❤️ 查看全部' : '❤️ 我的收藏'}
    </button>
  </div>

  <!-- Controls -->
  <div class="mb-6 grid gap-3 sm:grid-cols-4">
    <div>
      <p class="mb-1 text-xs text-zinc-500">严格度</p>
      <div class="flex flex-wrap gap-1">
        <button
          class="rounded border px-2 py-1 text-xs transition {toneMode === 'none'
            ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
            : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
          onclick={() => (toneMode = 'none')}
          title="仅比较韵母"
        >
          韵母
        </button>
        <button
          class="rounded border px-2 py-1 text-xs transition {toneMode === 'exact'
            ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
            : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
          onclick={() => (toneMode = 'exact')}
          title="韵母+声调都必须一致"
        >
          韵母+声调
        </button>
      </div>
    </div>
    <div>
      <p class="mb-1 text-xs text-zinc-500">最低押韵深度</p>
      <select
        bind:value={minDepth}
        class="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
      >
        <option value={1}>1 押</option>
        <option value={2}>2 押</option>
        <option value={3}>3 押</option>
        <option value={4}>4 押</option>
      </select>
    </div>
    <div>
      <p class="mb-1 text-xs text-zinc-500">最少成员</p>
      <select
        bind:value={minMembers}
        class="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
      >
        <option value={2}>2</option>
        <option value={3}>3</option>
        <option value={4}>4</option>
        <option value={5}>5</option>
      </select>
    </div>
    <div>
      <p class="mb-1 text-xs text-zinc-500">扫描位置</p>
      <div class="flex gap-1">
        <button
          class="rounded border px-2 py-1 text-xs transition {tailOnly
            ? 'border-zinc-900 bg-zinc-900 text-white'
            : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:bg-zinc-900'}"
          onclick={() => (tailOnly = true)}
        >
          仅尾部
        </button>
        <button
          class="rounded border px-2 py-1 text-xs transition {!tailOnly
            ? 'border-zinc-900 bg-zinc-900 text-white'
            : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:bg-zinc-900'}"
          onclick={() => (tailOnly = false)}
        >
          全位置
        </button>
      </div>
    </div>
  </div>

  <!-- Per-source toggles: each corpus has its own on/off badge. -->
  <div class="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
    <span class="text-zinc-500 mr-1">语料源：</span>
    {#each SOURCE_TOGGLES as src (src.id)}
      {@const badge = sourceBadge(src.id)}
      <button
        class="rounded px-2 py-1 font-mono text-[10px] transition select-none {enabledSources[src.id]
          ? `${badge.cls} ring-1 ring-current`
          : 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 line-through'}"
        title="{src.label} ({src.id}) — 点击切换"
        onclick={() => (enabledSources[src.id] = !enabledSources[src.id])}
      >
        {src.label}
      </button>
    {/each}
  </div>

  <p class="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
    找到 <span class="font-semibold text-zinc-900 dark:text-zinc-100">{catalog.clusters.length}</span> 组 cluster
  </p>

  <!-- Cluster cards -->
  {#if miningInProgress}
    <div class="flex flex-col items-center justify-center py-20 text-zinc-400">
      <svg class="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
      </svg>
      <p class="mt-3 text-sm">正在计算押韵组合…</p>
    </div>
  {:else if catalog.clusters.length === 0}
    <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-6 text-center text-sm text-zinc-500">
      {#if lens === 'saved'}
        还没有收藏的 cluster —— 去其它透镜逛一逛，看到喜欢的点 <span class="mx-1 align-middle">♡</span> 收藏它。
      {:else}
        当前条件下没有 cluster — 试试调低"最少成员"或"押韵深度"。
      {/if}
    </div>
  {:else}
    <div class="space-y-3">
      {#each catalog.clusters as cluster (cluster.id)}
        {@const deduped = catalog._deduped?.get(cluster.id) ?? { visible: cluster.members, collapsed: 0 }}
        <article class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <header class="mb-3 flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                {#each cluster.pattern as key, i (i)}
                  <span class="rounded bg-sky-100 px-1.5 py-0.5 text-sky-900">
                    {key}
                  </span>
                  {#if i < cluster.pattern.length - 1}
                    <span class="text-zinc-300">·</span>
                  {/if}
                {/each}
              </div>
              <p class="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                <span>{cluster.patternLength} 押</span>
                <span>·</span>
                <span>{cluster.members.length} 成员{deduped.collapsed > 0 ? ` (折叠 ${deduped.collapsed})` : ''}</span>
                <span>·</span>
                <span class="text-amber-500">{stars(cluster.cleverness)}</span>
                <span class="font-mono">{cluster.cleverness.toFixed(2)}</span>
                {#if cluster.distinctTags.length > 0}
                  <span>·</span>
                  <span class="text-zinc-400">
                    {cluster.distinctTags.filter((t) => !t.startsWith('freq:')).map((t) => `#${t}`).join(' ')}
                  </span>
                {/if}
              </p>
            </div>
            <div class="flex shrink-0 gap-1">
              <button
                class="rounded border px-2 py-1 text-xs transition {favorites.has(
                  cluster.id
                )
                  ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300'
                  : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
                title={favorites.has(cluster.id) ? '取消收藏' : '收藏这个 cluster'}
                aria-pressed={favorites.has(cluster.id)}
                onclick={() => favorites.toggle(cluster.id)}
              >
                {favorites.has(cluster.id) ? '❤️ 已收藏' : '♡ 收藏'}
              </button>
              <button
                class="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                title="复制成员列表"
                onclick={() =>
                  copyText(
                    cluster.members
                      .map((m) => catalog.lexiconRef[m.phraseId].text)
                      .join(' / ')
                  )}
              >
                复制
              </button>
            </div>
          </header>

          <ul class="flex flex-wrap gap-2">
            {#each deduped.visible as m (m.phraseId)}
              {@const phrase = catalog.lexiconRef[m.phraseId]}
              {@const chars = [...phrase.text].filter((ch) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch))}
              {@const matchStart = phrase.length - cluster.patternLength - m.tailOffset}
              {@const matchEnd = phrase.length - m.tailOffset}
              {@const badge = sourceBadge(phrase.source)}
              <li class="relative rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-2 pt-4">
                <span
                  class="absolute right-1 top-1 rounded px-1 py-0.5 font-mono text-[9px] leading-none {badge.cls}"
                  title="来源：{phrase.source}"
                >
                  {badge.label}
                </span>
                <div class="flex items-end gap-[3px]">
                  {#each chars as ch, i (i)}
                    {@const inMatch = i >= matchStart && i < matchEnd}
                    {@const py = phrase.pinyinWithTone?.[i] ?? ''}
                    <div
                      class="flex min-w-[2em] flex-col items-center gap-0 rounded px-[4px] py-[2px] {inMatch
                        ? 'bg-sky-100 dark:bg-sky-900/40'
                        : ''}"
                      title={phrase.finals[i] ? `${ch} · ${py} · ${phrase.finals[i]}` : ch}
                    >
                      <span
                        class="text-sm leading-tight {inMatch
                          ? 'font-semibold text-sky-900 dark:text-sky-200'
                          : 'text-zinc-600 dark:text-zinc-400'}"
                      >{ch}</span>
                      <span
                        class="font-mono text-[9px] leading-tight {inMatch
                          ? 'text-sky-700/80 dark:text-sky-300/80'
                          : 'text-zinc-400 dark:text-zinc-500'}"
                      >{py}</span>
                    </div>
                  {/each}
                </div>
                {#if phrase.segments && phrase.segments.length > 0}
                  <!-- POS-segment row: one chip per jieba word, colored by POS family.
                       Shows the grammatical skeleton so users can spot patterns like
                       nr+u+n ("姜维的戏") or d+a ("相对华丽") at a glance. -->
                  <div class="mt-1 flex flex-wrap gap-[2px]">
                    {#each phrase.segments as seg, si (si)}
                      {@const fam = posFamily(seg.pos)}
                      <span
                        class="rounded px-1 py-0 font-mono text-[9px] leading-tight {fam.cls}"
                        title="{seg.text} · {seg.pos}"
                      >
                        <span class="font-sans">{seg.text}</span><span class="ml-[2px] opacity-70">{seg.pos}</span>
                      </span>
                    {/each}
                  </div>
                {/if}
              </li>
            {/each}
            {#if deduped.collapsed > 0}
              <li class="flex items-center px-2 py-1 text-xs italic text-zinc-400 dark:text-zinc-500">
                + {deduped.collapsed} 条同根模板已折叠（首词+词性相同的变体）
              </li>
            {/if}
          </ul>
        </article>
      {/each}
    </div>
  {/if}

  <footer class="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-6 text-sm text-zinc-500">
    <p>
      <a href="{base}/" class="text-zinc-700 dark:text-zinc-300 underline hover:text-zinc-900 dark:text-zinc-100">主页</a>
      ·
      <a href="{base}/search" class="text-zinc-700 dark:text-zinc-300 underline hover:text-zinc-900 dark:text-zinc-100">查找押韵</a>
      ·
      <a href="{base}/analyze" class="text-zinc-700 dark:text-zinc-300 underline hover:text-zinc-900 dark:text-zinc-100">反向分析</a>
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
