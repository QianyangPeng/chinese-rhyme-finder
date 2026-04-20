<script lang="ts">
  /**
   * One anchor card in a paragraph's sidebar.
   *
   * Shows:
   *   • the anchor's Chinese text + pinyin
   *   • tone-mode toggle (韵母 / 韵母+声调) — per-anchor
   *   • candidate list fetched from searchByFinals using the anchor's
   *     finals as the target (length = anchor's char count = rhyme depth)
   *   • insert-candidate button per row (clicking inserts at current
   *     editor cursor in the parent paragraph's textarea)
   */
  import { parseSyllables } from '$lib/core/pinyin';
  import { strictScheme } from '$lib/core/rhyme';
  import { searchByFinals } from '$lib/core/corpus';
  import type { Lexicon } from '$lib/core/corpus';
  import type { Anchor, ToneMode } from '$lib/core/write/anchors';
  import { t } from '$lib/stores/lang.svelte';

  interface Props {
    anchor: Anchor;
    lexicon: Lexicon;
    /** Whether this anchor belongs to the currently-focused paragraph.
     *  Only active anchors get full candidate lists rendered — saves
     *  work when the user has many paragraphs with many anchors. */
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
    lexicon,
    active,
    onToneModeChange,
    onRemove,
    onInsertCandidate,
    hoveredKey,
    onHoverKey
  }: Props = $props();

  // ── Derive syllables + finals from anchor text ──
  const syllables = $derived(parseSyllables(anchor.text));
  const targetFinals = $derived(syllables.map((s) => s.final));
  const targetTones = $derived(syllables.map((s) => s.tone));

  // ── Search candidates ──
  const PAGE_SIZE = 40;
  let visibleCount = $state(PAGE_SIZE);

  // Reset pagination when anchor changes identity.
  $effect(() => {
    void anchor.id; void anchor.toneMode;
    visibleCount = PAGE_SIZE;
  });

  const result = $derived.by(() => {
    if (!active) return null;
    if (targetFinals.length === 0) return null;
    return searchByFinals(targetFinals, strictScheme, lexicon, {
      excludeText: anchor.text,
      maxPerBucket: Number.POSITIVE_INFINITY,
      toneMode: anchor.toneMode,
      targetTones,
      requireTailMatch: true,
      windowMode: 'tail'
    });
  });

  const flatHits = $derived.by(() => {
    if (!result) return [] as Array<{ text: string; finals: readonly string[]; source: string; quality: number; phraseLen: number; matchOffset: number; perPosition: readonly boolean[]; matched: number; compared: number; level: number }>;
    const out = [];
    for (const b of result.buckets) {
      for (const h of b.hits) {
        out.push({
          text: h.phrase.text,
          finals: h.phrase.finals,
          source: h.phrase.source,
          quality: h.phrase.quality,
          phraseLen: h.phrase.length,
          matchOffset: h.matchOffset,
          perPosition: h.match.perPosition,
          matched: h.match.matchedPositions.length,
          compared: h.match.comparedLength,
          level: h.level
        });
      }
    }
    return out;
  });

  const totalHits = $derived(flatHits.length);

  // ── Source badge palette (matches other pages) ──
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
  {:else if totalHits === 0}
    <p class="py-2 text-center text-zinc-400">{t('没有找到押韵候选', 'No rhyme candidates')}</p>
  {:else}
    <p class="mb-1.5 text-[10px] text-zinc-500">
      {#if flatHits.length > visibleCount}
        {visibleCount} / {totalHits} {t('条', 'candidates')}
      {:else}
        {totalHits} {t('条候选', 'candidates')}
      {/if}
    </p>
    <ul class="space-y-1.5">
      {#each flatHits.slice(0, visibleCount) as hit (hit.text)}
        {@const badge = sourceBadge(hit.source)}
        {@const winStart = hit.matchOffset}
        {@const winEnd = winStart + hit.perPosition.length}
        <li>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="cursor-pointer rounded border border-zinc-100 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/60 p-1.5 hover:border-sky-300 dark:hover:border-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/30"
            onclick={() => onInsertCandidate(hit.text)}
            title={t('点击插入到编辑器', 'Click to insert')}
          >
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-sans text-sm font-semibold text-zinc-900 dark:text-zinc-100">{hit.text}</span>
              <span class="flex shrink-0 items-center gap-1">
                <span class="rounded px-1 py-0.5 font-mono text-[9px] {badge.cls}">{badge.label}</span>
                <span class="font-mono text-[9px] text-zinc-400">{hit.matched}/{hit.compared}</span>
                {#if hit.phraseLen < syllables.length}
                  <span class="rounded bg-lime-100 dark:bg-lime-900/40 px-1 py-0.5 text-[9px] text-lime-900 dark:text-lime-200">{t('尾', 'tail')}</span>
                {:else if hit.phraseLen > syllables.length}
                  <span class="rounded bg-purple-100 dark:bg-purple-900/40 px-1 py-0.5 text-[9px] text-purple-900 dark:text-purple-200">{t('含', 'echo')}</span>
                {/if}
              </span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-0.5 font-mono">
              {#each hit.finals as f, pi (pi)}
                {@const inWindow = pi >= winStart && pi < winEnd}
                {@const matched = inWindow && hit.perPosition[pi - winStart]}
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
                >{f}</span>
              {/each}
            </div>
          </div>
        </li>
      {/each}
    </ul>
    {#if flatHits.length > visibleCount}
      <button
        class="mx-auto mt-2 block rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[10px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        onclick={() => (visibleCount = Math.min(visibleCount + PAGE_SIZE, flatHits.length))}
      >
        {t(`加载更多 (${visibleCount}/${flatHits.length})`, `Load more (${visibleCount}/${flatHits.length})`)}
      </button>
    {/if}
  {/if}
</article>
