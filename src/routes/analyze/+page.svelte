<script lang="ts">
  import { strictScheme, TONE_MODE_LABEL } from '$lib/core/rhyme';
  import type { ToneMode } from '$lib/core/rhyme';
  import { reverseAnalyze } from '$lib/core/analyze';
  import { base } from '$app/paths';
  import { t } from '$lib/stores/lang.svelte';

  // Default text — the famous three-line "年轻的国王们" passage.
  const DEFAULT_TEXT = `观众们拍手叫好剪裁的相对华丽
都喜欢动画片儿看不懂姜维的戏
都是同龄人我本来没想降维打击`;

  let text = $state(DEFAULT_TEXT);
  let toneMode = $state<ToneMode>('none');

  const scheme = strictScheme; // only 严式 exposed
  const analysis = $derived(reverseAnalyze(text, scheme, toneMode));

  const TONE_MODES: ToneMode[] = ['none', 'pingze', 'exact'];

  // Soft pastel palette — matched syllables in the same rhyme group get
  // the same background tint. Cycle through these 6 colors.
  const GROUP_TINTS: Array<{ bg: string; ring: string; text: string }> = [
    { bg: 'bg-sky-100',     ring: 'ring-sky-300',     text: 'text-sky-900' },
    { bg: 'bg-emerald-100', ring: 'ring-emerald-300', text: 'text-emerald-900' },
    { bg: 'bg-amber-100',   ring: 'ring-amber-300',   text: 'text-amber-900' },
    { bg: 'bg-rose-100',    ring: 'ring-rose-300',    text: 'text-rose-900' },
    { bg: 'bg-violet-100',  ring: 'ring-violet-300',  text: 'text-violet-900' },
    { bg: 'bg-cyan-100',    ring: 'ring-cyan-300',    text: 'text-cyan-900' }
  ];

  // ── Cross-line positional rhyme detection ──────────────────────────
  // For each syllable, check if its rhyme key at the same RIGHT-ALIGNED
  // position matches any other line. This catches not just tail rhymes
  // but also mid-line rhymes (e.g., position 3 from the right in line 1
  // rhymes with position 3 from the right in line 2).

  /** Set of rhyme keys that participate in any cross-line positional match. */
  const keyColorMap = $derived(
    (() => {
      const map = new Map<string, number>();
      let colorIdx = 0;
      const maxLen = Math.max(...analysis.lines.map((l) => l.keys.length), 0);

      // Scan each right-aligned position; group lines by key at that position.
      for (let R = 0; R < maxLen; R++) {
        const groups = new Map<string, number[]>();
        for (const line of analysis.lines) {
          const pos = line.keys.length - 1 - R;
          if (pos < 0) continue;
          const key = line.keys[pos];
          if (!key) continue;
          let g = groups.get(key);
          if (!g) { g = []; groups.set(key, g); }
          g.push(line.index);
        }
        // Keys appearing in ≥2 lines at this position → assign a color.
        for (const [key, lines] of groups) {
          if (lines.length >= 2 && !map.has(key)) {
            map.set(key, colorIdx % GROUP_TINTS.length);
            colorIdx++;
          }
        }
      }
      return map;
    })()
  );

  /** Check if a specific syllable position is in a cross-line positional match. */
  function isPositionalRhyme(lineIndex: number, sylIndex: number): boolean {
    const line = analysis.lines[lineIndex];
    const R = line.keys.length - 1 - sylIndex;
    const key = line.keys[sylIndex];
    if (!key) return false;

    for (const other of analysis.lines) {
      if (other.index === lineIndex) continue;
      const otherPos = other.keys.length - 1 - R;
      if (otherPos < 0 || otherPos >= other.keys.length) continue;
      if (other.keys[otherPos] === key) return true;
    }
    return false;
  }

  /**
   * Syllable chip styling based on cross-line positional rhyme:
   *   MATCH — this position rhymes with another line at same right-aligned
   *           position. Strong tint + ring, color by rhyme key.
   *   ECHO  — key exists in the global palette (rhymes somewhere) but this
   *           specific position doesn't match. Lighter tint.
   *   NONE  — key doesn't participate in any cross-line rhyme. Neutral.
   */
  function chipClass(lineIndex: number, sylIndex: number): string {
    const key = analysis.lines[lineIndex].keys[sylIndex];
    if (!key) return 'bg-zinc-100 text-zinc-700 dark:text-zinc-300 dark:bg-zinc-800';

    const colorIdx = keyColorMap.get(key);
    if (colorIdx === undefined) {
      return 'bg-zinc-100 text-zinc-700 dark:text-zinc-300 dark:bg-zinc-800';
    }

    const tint = GROUP_TINTS[colorIdx];
    if (isPositionalRhyme(lineIndex, sylIndex)) {
      return `${tint.bg} ${tint.text} ring-1 ${tint.ring}`;
    }
    // Echo: same key rhymes elsewhere but not at this exact position.
    return `${tint.bg} ${tint.text} opacity-50`;
  }

  /**
   * Compute a per-line rhyme badge: "N押" for the deepest positional
   * match, "句内韵" if internal groups exist, "头韵" if head matches.
   * Returns {type, label} pairs so the template can color-code by type
   * in either language.
   */
  type BadgeType = 'tail' | 'head' | 'internal' | 'midline';
  function lineBadges(lineIndex: number): Array<{ type: BadgeType; label: string }> {
    const badges: Array<{ type: BadgeType; label: string }> = [];

    // Tail depth (N-push)
    let maxTailK = 0;
    for (const p of analysis.pairs) {
      if (p.indexA === lineIndex || p.indexB === lineIndex) {
        if (p.tailK > maxTailK) maxTailK = p.tailK;
      }
    }
    if (maxTailK >= 1) badges.push({ type: 'tail', label: t(`${maxTailK}押`, `${maxTailK}-rhyme`) });

    // Head rhyme
    let hasHead = false;
    for (const p of analysis.pairs) {
      if ((p.indexA === lineIndex || p.indexB === lineIndex) && p.headK >= 2) {
        hasHead = true;
        break;
      }
    }
    if (hasHead) badges.push({ type: 'head', label: t('头韵', 'head-rhyme') });

    // Internal rhyme
    const line = analysis.lines[lineIndex];
    if (line.internalGroups.size > 0) badges.push({ type: 'internal', label: t('句内韵', 'internal-rhyme') });

    // Mid-line rhyme: any non-tail, non-head position matches
    let hasMidLine = false;
    for (let i = 0; i < line.keys.length; i++) {
      const R = line.keys.length - 1 - i;
      if (R < maxTailK) continue; // already counted as tail
      if (i < 2 && hasHead) continue; // already counted as head
      if (isPositionalRhyme(lineIndex, i)) {
        hasMidLine = true;
        break;
      }
    }
    if (hasMidLine) badges.push({ type: 'midline', label: t('句中韵', 'mid-line-rhyme') });

    return badges;
  }

  const BADGE_CLS: Record<BadgeType, string> = {
    tail:     'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
    head:     'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    internal: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    midline:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  };

  const internalRhymeLineCount = $derived(
    analysis.lines.filter((l) => l.internalGroups.size > 0).length
  );

  // ── Hover highlight: when user hovers a syllable, highlight all
  // syllables with the same rhyme key across all lines.
  let hoveredKey = $state<string | null>(null);

  function onSylHover(lineIndex: number, sylIndex: number) {
    hoveredKey = analysis.lines[lineIndex]?.keys[sylIndex] || null;
  }
  function onSylLeave() {
    hoveredKey = null;
  }

  function presetExample(t: string) {
    text = t;
  }

  const PRESETS: Array<{ name: string; text: string }> = [
    {
      name: 'Capper · 年轻的国王们',
      text: DEFAULT_TEXT
    },
    {
      name: '刘夫阳 · 押韵歌（10 押）',
      text: `一二三四五六七八九十
发出必杀三次复仇计划守时
都在地下办事竖旧 hip-hop 手势
玩着 beatbox 展示户口其他首饰`
    },
    {
      name: '简单 ABAB',
      text: `你好世界
今天天气不错
我爱你哦
明天还是要工作`
    },
    {
      name: 'AABB 双押',
      text: `星辰大海
银河大队
今夜难眠
独自买醉`
    }
  ];
</script>

<svelte:head>
  <title>{t('歌词分析 · 押韵深度可视化 · 世界最强押韵', 'Lyrics Analyze · Rhyme depth visualizer · Rhyme Finder')}</title>
  <meta
    name="description"
    content={t(
      '把中文歌词或诗句粘贴进来，自动标注每行的押韵位置、类型（尾韵/头韵/句中韵/句内韵）和深度（双押/三押/四押…）。可视化展示行与行之间的押韵关系。',
      'Paste Chinese lyrics or verse to auto-label every line with rhyme positions, types (tail / head / mid-line / internal), and depth (2- to 8-rhyme). Visualizes the rhyme relationships between lines.'
    )}
  />
  <link rel="canonical" href="https://qianyangpeng.github.io/chinese-rhyme-finder/analyze/" />
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-12">
  <header class="mb-6">
    <h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{t('歌词分析', 'Analyze')}</h1>
    <p class="mt-2 text-base text-zinc-600 dark:text-zinc-400">
      {t('把歌词粘进来，看每行押什么、和哪些行相互押。', 'Paste lyrics to see what rhymes in each line and which lines rhyme together.')}
    </p>
  </header>

  <!-- Preset chips -->
  <div class="mb-3 flex flex-wrap gap-2 text-xs">
    <span class="text-zinc-500">{t('示例：', 'Examples:')}</span>
    {#each PRESETS as preset (preset.name)}
      <button
        class="rounded border border-zinc-300 dark:border-zinc-700 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        onclick={() => presetExample(preset.text)}
      >
        {preset.name}
      </button>
    {/each}
  </div>

  <!-- Tone-mode selector: how strict should声调 matter for a rhyme? -->
  <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
    <span class="text-zinc-500">{t('声调：', 'Tone:')}</span>
    {#each TONE_MODES as m (m)}
      <button
        class="rounded border px-2.5 py-1 text-xs transition {toneMode === m
          ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
          : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
        title={
          m === 'none'
            ? t('只比 韵母 — 最常见的 rap 判准', 'Only rhyme finals — the common rap standard')
            : m === 'pingze'
              ? t('韵母 + 平仄 — 平(1/2)与仄(3/4/0)不通押', 'Rhyme + ping/ze — level tones (1/2) vs oblique tones (3/4/0) do not rhyme')
              : t('韵母 + 声调数字 — 每个音节声调必须一致', 'Rhyme + exact tone number — every tone must match')
        }
        onclick={() => (toneMode = m)}
      >
        {TONE_MODE_LABEL[m]}
      </button>
    {/each}
  </div>

  <!-- Input -->
  <textarea
    bind:value={text}
    rows={6}
    class="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 font-mono text-base shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
    placeholder={t('粘贴几行歌词或诗句…', 'Paste a few lines of lyrics or poetry…')}
  ></textarea>

  <!-- Top-line stats -->
  <section class="mt-6 grid gap-3 sm:grid-cols-3">
    <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <p class="font-mono text-xs uppercase tracking-wider text-zinc-500">{t('最强尾押', 'Max tail depth')}</p>
      <p class="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        {analysis.maxTailK} <span class="text-base font-normal text-zinc-500">{t('押', '-rhyme')}</span>
      </p>
    </div>
    <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <p class="font-mono text-xs uppercase tracking-wider text-zinc-500">{t('行数', 'Lines')}</p>
      <p class="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{analysis.lines.length}</p>
    </div>
    <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <p class="font-mono text-xs uppercase tracking-wider text-zinc-500">{t('押韵组', 'Rhyme groups')}</p>
      <p class="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{analysis.groups.length}</p>
      {#if analysis.groups.length > 0}
        <p class="mt-1 text-xs text-zinc-500">
          {analysis.groups
            .map((g) => t(`${g.lineIndices.length}行同${g.rhymeKey || '?'}`, `${g.lineIndices.length} lines on ${g.rhymeKey || '?'}`))
            .join(' · ')}
        </p>
      {/if}
    </div>
  </section>

  {#if internalRhymeLineCount > 0}
    <p class="-mt-2 mb-4 text-xs text-zinc-500">
      {t(
        `其中 ${internalRhymeLineCount} 行有内部重复押韵（同行多位同韵，不只末尾）— 浅色色块标出。`,
        `${internalRhymeLineCount} line${internalRhymeLineCount === 1 ? ' has' : 's have'} internal rhyme (same rhyme at multiple positions within a line) — shown with faded chips.`
      )}
    </p>
  {/if}

  <!-- Per-line view with color-coded chips -->
  <section class="mt-6">
    <h2 class="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{t('逐行解读', 'Line-by-line')}</h2>
    {#if analysis.lines.every((l) => l.syllables.length === 0)}
      <p class="text-sm text-zinc-500">{t('输入区还没有可分析的中文音节。', 'No Chinese syllables to analyze in the input.')}</p>
    {:else}
      <div class="space-y-3">
        {#each analysis.lines as line (line.index)}
          {@const hasRhyme = lineBadges(line.index).length > 0}
          <div
            class="rounded-lg border bg-white dark:bg-zinc-900 p-4 transition {hasRhyme
              ? 'ring-1 ring-sky-300 dark:ring-sky-700'
              : 'border-zinc-200 dark:border-zinc-800'}"
          >
            <div class="mb-2 flex items-baseline gap-3">
              <span class="font-mono text-xs text-zinc-400">L{line.index + 1}</span>
              <span class="text-sm text-zinc-700 dark:text-zinc-300">{line.text || t('（空行）', '(empty line)')}</span>
            </div>
            {#if line.syllables.length > 0}
              <!-- Rhyme type badges -->
              {@const badges = lineBadges(line.index)}
              {#if badges.length > 0}
                <div class="mb-1.5 flex flex-wrap gap-1">
                  {#each badges as badge}
                    <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold {BADGE_CLS[badge.type]}">
                      {badge.label}
                    </span>
                  {/each}
                </div>
              {/if}
              <div class="flex flex-wrap gap-1.5 font-mono text-xs">
                {#each line.syllables as syl, i (i)}
                  {@const key = line.keys[i] || ''}
                  {@const isHoverMatch = hoveredKey !== null && key === hoveredKey}
                  <span
                    class="rounded px-1.5 py-1 cursor-default transition-all duration-100
                      {chipClass(line.index, i)}
                      {isHoverMatch ? 'scale-110 shadow-md brightness-110 z-10' : ''}"
                    title="{syl.char} · {syl.pinyinWithTone} · {key || '?'}"
                    onmouseenter={() => onSylHover(line.index, i)}
                    onmouseleave={onSylLeave}
                  >
                    <span class="font-sans text-sm">{syl.char}</span>
                    <span class="ml-1 opacity-70">{syl.final}</span>
                  </span>
                {/each}
              </div>
            {:else}
              <p class="text-xs text-zinc-400">{t('（无中文音节）', '(no Chinese syllables)')}</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Pair matrix (if more than one rhyming pair) -->
  {#if analysis.pairs.length > 0}
    <section class="mt-6">
      <h2 class="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{t('行对行押韵深度', 'Line-by-line rhyme depth matrix')}</h2>
      <p class="mb-3 text-xs text-zinc-500">
        {t('每格两个数：尾押 / 头押。0 表示无押韵。', 'Each cell: tail depth / head depth. 0 means no rhyme.')}
      </p>
      <div class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
              <th class="px-3 py-2 text-left font-mono">·</th>
              {#each analysis.lines as line (line.index)}
                <th class="px-3 py-2 font-mono">L{line.index + 1}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each analysis.lines as rowLine (rowLine.index)}
              <tr class="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                <td class="px-3 py-2 font-mono text-zinc-500">L{rowLine.index + 1}</td>
                {#each analysis.lines as colLine (colLine.index)}
                  {@const pair = analysis.pairs.find(
                    (p) =>
                      (p.indexA === rowLine.index && p.indexB === colLine.index) ||
                      (p.indexA === colLine.index && p.indexB === rowLine.index)
                  )}
                  <td class="px-3 py-2 text-center font-mono">
                    {#if rowLine.index === colLine.index}
                      <span class="text-zinc-300">—</span>
                    {:else if pair}
                      <span
                        class="font-semibold {pair.tailK >= 3
                          ? 'text-emerald-700'
                          : pair.tailK >= 1
                          ? 'text-amber-700'
                          : 'text-zinc-400'}"
                      >
                        {pair.tailK}
                      </span>
                      <span class="text-zinc-400">/</span>
                      <span class="text-zinc-500">{pair.headK}</span>
                    {:else}
                      <span class="text-zinc-300">0/0</span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <footer class="mt-12 border-t border-zinc-200 dark:border-zinc-800 pt-6 text-sm text-zinc-500">
    <p>
      <a href="{base}/" class="text-zinc-700 dark:text-zinc-300 underline hover:text-zinc-900 dark:text-zinc-100">
        {t('返回主页', 'Back to home')}
      </a>
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
