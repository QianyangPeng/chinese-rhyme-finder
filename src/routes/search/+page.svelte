<script lang="ts">
  import { parseSyllables } from '$lib/core/pinyin';
  import { ALL_SCHEMES, getScheme } from '$lib/core/rhyme';
  import type { RhymeSchemeId } from '$lib/core/rhyme';
  import { getDefaultLexicon, searchByFinals, searchByTail } from '$lib/core/corpus';
  type SearchMode = 'full' | 'tail';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';

  // Defaults; URL-based overrides applied client-side in onMount so
  // prerender doesn't choke on searchParams access.
  let query = $state('降维打击');
  let schemeId = $state<RhymeSchemeId>('shisanzhe');
  let mode = $state<SearchMode>('full');
  let urlReady = $state(false);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const s = params.get('scheme');
    const m = params.get('mode');
    if (q) query = q;
    if (s === 'strict' || s === 'shisanzhe' || s === 'loose') schemeId = s;
    if (m === 'tail') mode = 'tail';
    urlReady = true;
  });

  // Mirror state back into the URL so results are shareable. Waits until
  // `urlReady` to avoid clobbering the URL during hydration.
  $effect(() => {
    if (!urlReady || typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (schemeId !== 'shisanzhe') params.set('scheme', schemeId);
    if (mode !== 'full') params.set('mode', mode);
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

  const scheme = $derived(getScheme(schemeId));
  const lexicon = getDefaultLexicon(); // built once, cached

  const querySyllables = $derived(parseSyllables(query));
  const queryFinals = $derived(querySyllables.map((s) => s.final));
  const queryKeys = $derived(querySyllables.map((s) => scheme.keyOf(s.final)));

  const fullResult = $derived(
    mode === 'full' && queryFinals.length > 0
      ? searchByFinals(queryFinals, scheme, lexicon, {
          excludeText: query.trim(),
          maxPerBucket: 30
        })
      : null
  );

  const tailResult = $derived(
    mode === 'tail' && queryFinals.length > 0
      ? searchByTail(queryFinals, scheme, lexicon, {
          excludeText: query.trim(),
          minTailK: 2,
          maxPerBucket: 30
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
  <title>查找押韵 · 中文押韵发现</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-12">
  <header class="mb-6">
    <h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">查找押韵</h1>
    <p class="mt-2 text-base text-zinc-600 dark:text-zinc-400">
      输入一个词组，从内置词库中查找等长且押韵的候选 — 按"严格 → 宽松"分层展示。
    </p>
  </header>

  <!-- Preset chips -->
  <div class="mb-3 flex flex-wrap gap-2 text-xs">
    <span class="text-zinc-500">试试：</span>
    {#each PRESETS as preset (preset)}
      <button
        class="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:bg-zinc-900"
        onclick={() => presetExample(preset)}
      >
        {preset}
      </button>
    {/each}
  </div>

  <!-- Scheme selector -->
  <div class="mb-3 flex items-center gap-2 text-sm">
    <span class="text-zinc-500">押韵 scheme：</span>
    {#each ALL_SCHEMES as s (s.id)}
      <button
        class="rounded border px-2.5 py-1 text-xs transition {schemeId === s.id
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:bg-zinc-900'}"
        onclick={() => (schemeId = s.id)}
      >
        {s.name}
      </button>
    {/each}
  </div>

  <!-- Query input -->
  <div class="flex gap-2">
    <input
      type="text"
      bind:value={query}
      placeholder="例如：降维打击"
      class="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 font-mono text-base shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
    />
    <button
      type="button"
      onclick={shareLink}
      class="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
      title="复制当前搜索的分享链接"
    >
      {#if copiedAt && Date.now() - copiedAt < 2000}
        ✓ 已复制
      {:else}
        🔗 分享
      {/if}
    </button>
  </div>

  <!-- Query analysis breadcrumb -->
  {#if querySyllables.length > 0}
    <div class="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-xs">
      <span class="text-zinc-500">韵母模式：</span>
      {#each querySyllables as s, i (i)}
        <span
          class="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300"
          title="{s.char} · {s.pinyinWithTone} · {queryKeys[i] || '?'}"
        >
          <span class="font-sans text-sm">{s.char}</span>
          <span class="ml-1 opacity-60">{s.final}</span>
        </span>
      {/each}
      <span class="text-zinc-400">·</span>
      <span class="text-zinc-500">{queryKeys.filter(Boolean).join(' / ') || '未识别'}</span>
    </div>
  {/if}

  <!-- Lexicon badge -->
  <p class="mt-3 text-xs text-zinc-500">
    词库：内置 <span class="font-mono">{lexicon.phrases.length}</span> 条 ·
    {#if mode === 'full'}
      <span class="font-mono">{lexicon.byLength.get(queryFinals.length)?.length ?? 0}</span>
      条等长候选
    {:else}
      尾押模式不限长度
    {/if}
    · 一旦 P1.4 数据管道完成将自动扩到 50k+
  </p>

  <!-- Results -->
  <section class="mt-6">
    {#if totalHits === 0}
      <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-6 text-center">
        {#if querySyllables.length === 0}
          <p class="text-sm text-zinc-500">输入一个中文词组试试。</p>
        {:else}
          <p class="text-sm text-zinc-700 dark:text-zinc-300">
            没有找到押韵候选 — 词库还小，等正式数据进来会好很多。
          </p>
          <p class="mt-1 text-xs text-zinc-500">
            提示：试试宽松邻韵 scheme，或切到尾押模式看更多候选。
          </p>
        {/if}
      </div>
    {:else if mode === 'full' && fullResult}
      <p class="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        共 <span class="font-semibold text-zinc-900 dark:text-zinc-100">{fullResult.totalHits}</span>
        条候选，按宽松级别分层（Level 0 = 全严格匹配；Level k = 第 k 位放宽）：
      </p>

      <div class="space-y-4">
        {#each fullResult.buckets as bucket (bucket.level)}
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div class="mb-3 flex items-baseline justify-between">
              <p class="font-semibold text-zinc-800 dark:text-zinc-200">
                Level {bucket.level}
                <span class="ml-2 font-normal text-zinc-500">
                  {#if bucket.level === 0}
                    全押 · 每个位置都匹配
                  {:else}
                    {bucket.level} 位放宽
                  {/if}
                </span>
              </p>
              <span class="font-mono text-xs text-zinc-500">
                {bucket.hits.length} 条
              </span>
            </div>

            <ul class="space-y-2">
              {#each bucket.hits as hit (hit.phrase.text)}
                <li class="rounded border border-zinc-100 dark:border-zinc-800 p-3">
                  <div class="mb-1.5 flex items-baseline justify-between">
                    <span class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {hit.phrase.text}
                    </span>
                    <span class="font-mono text-xs text-zinc-400">
                      {hit.match.matchedPositions.length}/{hit.match.comparedLength} 押
                    </span>
                  </div>
                  <div class="flex flex-wrap items-center gap-1 font-mono text-xs">
                    {#each hit.phrase.finals as f, i (i)}
                      <span
                        class="rounded px-1.5 py-0.5 {hit.match.perPosition[i]
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-rose-100 text-rose-900'}"
                      >
                        {f}
                      </span>
                    {/each}
                    {#if hit.phrase.tags.length > 0}
                      <span class="ml-auto text-zinc-400">
                        {hit.phrase.tags.map((t) => `#${t}`).join(' ')}
                      </span>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {:else if mode === 'tail' && tailResult}
      <p class="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        共 <span class="font-semibold text-zinc-900 dark:text-zinc-100">{tailResult.totalHits}</span>
        条候选，按尾押深度排序（K 越大，末尾押得越深）：
      </p>

      <div class="space-y-4">
        {#each tailResult.buckets as bucket (bucket.tailK)}
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div class="mb-3 flex items-baseline justify-between">
              <p class="font-semibold text-zinc-800 dark:text-zinc-200">
                {bucket.tailK} 押
                <span class="ml-2 font-normal text-zinc-500">末尾 {bucket.tailK} 个音节完全押</span>
              </p>
              <span class="font-mono text-xs text-zinc-500">
                {bucket.hits.length} 条
              </span>
            </div>

            <ul class="space-y-2">
              {#each bucket.hits as hit (hit.phrase.text)}
                <li class="rounded border border-zinc-100 dark:border-zinc-800 p-3">
                  <div class="mb-1.5 flex items-baseline justify-between">
                    <span class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {hit.phrase.text}
                    </span>
                    <span class="font-mono text-xs text-zinc-400">
                      {hit.phrase.length} 音节
                    </span>
                  </div>
                  <div class="flex flex-wrap items-center gap-1 font-mono text-xs">
                    {#each hit.phrase.finals as f, i (i)}
                      {@const inTail = i >= hit.phrase.finals.length - hit.tailK}
                      <span
                        class="rounded px-1.5 py-0.5 {inTail
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'}"
                      >
                        {f}
                      </span>
                    {/each}
                    {#if hit.phrase.tags.length > 0}
                      <span class="ml-auto text-zinc-400">
                        {hit.phrase.tags.map((t) => `#${t}`).join(' ')}
                      </span>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <footer class="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-6 text-sm text-zinc-500">
    <p>
      <a href="{base}/" class="text-zinc-700 dark:text-zinc-300 underline hover:text-zinc-900 dark:text-zinc-100">主页</a>
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
