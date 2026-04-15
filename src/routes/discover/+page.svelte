<script lang="ts">
  import { ALL_SCHEMES, getScheme } from '$lib/core/rhyme';
  import type { RhymeSchemeId } from '$lib/core/rhyme';
  import { getDefaultLexicon } from '$lib/core/corpus';
  import { mineClusters } from '$lib/core/discover';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';

  let schemeId = $state<RhymeSchemeId>('shisanzhe');
  let minDepth = $state(2);
  let minMembers = $state(3);
  let tailOnly = $state(true);
  let urlReady = $state(false);

  // URL-based state overrides applied only after mount to avoid touching
  // searchParams during SvelteKit's build-time prerender.
  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('scheme');
    const d = Number.parseInt(params.get('depth') ?? '', 10);
    const m = Number.parseInt(params.get('members') ?? '', 10);
    const t = params.get('tail');
    if (s === 'strict' || s === 'shisanzhe' || s === 'loose') schemeId = s;
    if (Number.isFinite(d) && d >= 1) minDepth = d;
    if (Number.isFinite(m) && m >= 2) minMembers = m;
    if (t === 'all') tailOnly = false;
    urlReady = true;
  });

  // Mirror state → URL for sharing.
  $effect(() => {
    if (!urlReady || typeof window === 'undefined') return;
    const qp = new URLSearchParams();
    if (schemeId !== 'shisanzhe') qp.set('scheme', schemeId);
    if (minDepth !== 2) qp.set('depth', String(minDepth));
    if (minMembers !== 3) qp.set('members', String(minMembers));
    if (!tailOnly) qp.set('tail', 'all');
    const qs = qp.toString();
    const url = `${base}/discover/${qs ? '?' + qs : ''}`;
    if (window.location.pathname + window.location.search !== url) {
      history.replaceState(history.state, '', url);
    }
  });

  const lexicon = getDefaultLexicon();
  const scheme = $derived(getScheme(schemeId));

  const catalog = $derived(
    mineClusters(lexicon, scheme, {
      minPatternLength: minDepth,
      minMembers,
      tailOnly,
      maxClusters: 60
    })
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
  <title>Discover · 中文押韵发现</title>
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

  <!-- Bootstrap notice -->
  <div class="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-zinc-700 dark:text-zinc-300">
    种子词库只有 {lexicon.phrases.length} 条，cluster 数量受限。Phase 1.4
    Python 数据管道扩到 50k+ 后，Discover 才真正发挥作用。
  </div>

  <!-- Controls -->
  <div class="mb-6 grid gap-3 sm:grid-cols-4">
    <div>
      <p class="mb-1 text-xs text-zinc-500">押韵 scheme</p>
      <div class="flex flex-wrap gap-1">
        {#each ALL_SCHEMES as s (s.id)}
          <button
            class="rounded border px-2 py-1 text-xs transition {schemeId === s.id
              ? 'border-zinc-900 bg-zinc-900 text-white'
              : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:bg-zinc-900'}"
            onclick={() => (schemeId = s.id)}
          >
            {s.name}
          </button>
        {/each}
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

  <p class="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
    找到 <span class="font-semibold text-zinc-900 dark:text-zinc-100">{catalog.clusters.length}</span> 组 cluster
  </p>

  <!-- Cluster cards -->
  {#if catalog.clusters.length === 0}
    <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-6 text-center text-sm text-zinc-500">
      当前条件下没有 cluster — 试试调低"最少成员"或"押韵深度"。
    </div>
  {:else}
    <div class="space-y-3">
      {#each catalog.clusters as cluster (cluster.id)}
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
                <span>{cluster.members.length} 成员</span>
                <span>·</span>
                <span class="text-amber-500">{stars(cluster.cleverness)}</span>
                <span class="font-mono">{cluster.cleverness.toFixed(2)}</span>
                {#if cluster.distinctTags.length > 0}
                  <span>·</span>
                  <span class="text-zinc-400">
                    {cluster.distinctTags.map((t) => `#${t}`).join(' ')}
                  </span>
                {/if}
              </p>
            </div>
            <button
              class="shrink-0 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:bg-zinc-900"
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
          </header>

          <ul class="flex flex-wrap gap-2">
            {#each cluster.members as m (m.phraseId)}
              {@const phrase = catalog.lexiconRef[m.phraseId]}
              <li class="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 text-sm">
                {phrase.text}
              </li>
            {/each}
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
