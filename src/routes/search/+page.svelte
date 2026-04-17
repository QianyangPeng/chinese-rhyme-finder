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
  let urlReady = $state(false);

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const m = params.get('mode');
    const t = params.get('tone');
    const tailReq = params.get('tail_req');
    if (q) query = q;
    if (m === 'tail') mode = 'tail';
    if (t === 'exact' || t === 'pingze') toneMode = t;
    if (tailReq === '0') requireTailMatch = false;
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
          maxPerBucket: 30,
          toneMode,
          targetTones: queryTones,
          requireTailMatch
        })
      : null
  );

  const tailResult = $derived(
    mode === 'tail' && queryFinals.length > 0
      ? searchByTail(queryFinals, scheme, lexicon, {
          excludeText: query.trim(),
          minTailK: 2,
          maxPerBucket: 30,
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
  <title>{t('找押韵 · 世界最强押韵', 'Search · Rhyme Finder')}</title>
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
      <span class="text-zinc-500">{t('韵母模式：', 'Rhyme pattern:')}</span>
      {#each querySyllables as s, i (i)}
        <span
          class="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300"
          title="{s.char} · {s.pinyinWithTone} · {s.final || '?'}"
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
                {bucket.hits.length} {t('条', 'hits')}
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
                      {hit.match.matchedPositions.length}/{hit.match.comparedLength} {t('押', 'rhymed')}
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
        {t(
          `共 ${tailResult.totalHits} 条候选，按尾押深度排序（K 越大，末尾押得越深）：`,
          `${tailResult.totalHits} candidates, sorted by tail-rhyme depth (larger K = deeper tail match):`
        )}
      </p>

      <div class="space-y-4">
        {#each tailResult.buckets as bucket (bucket.tailK)}
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div class="mb-3 flex items-baseline justify-between">
              <p class="font-semibold text-zinc-800 dark:text-zinc-200">
                {bucket.tailK} {t('押', '-rhyme')}
                <span class="ml-2 font-normal text-zinc-500">{t(`末尾 ${bucket.tailK} 个音节完全押`, `last ${bucket.tailK} syllables all rhyme`)}</span>
              </p>
              <span class="font-mono text-xs text-zinc-500">
                {bucket.hits.length} {t('条', 'hits')}
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
                      {hit.phrase.length} {t('音节', 'syllables')}
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
