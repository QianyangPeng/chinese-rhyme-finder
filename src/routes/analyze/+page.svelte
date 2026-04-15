<script lang="ts">
  import { ALL_SCHEMES, getScheme, TONE_MODE_LABEL } from '$lib/core/rhyme';
  import type { RhymeSchemeId, ToneMode } from '$lib/core/rhyme';
  import { reverseAnalyze } from '$lib/core/analyze';
  import { base } from '$app/paths';

  // Default text — the famous three-line "年轻的国王们" passage.
  const DEFAULT_TEXT = `观众们拍手叫好剪裁的相对华丽
都喜欢动画片儿看不懂姜维的戏
都是同龄人我本来没想降维打击`;

  let text = $state(DEFAULT_TEXT);
  let schemeId = $state<RhymeSchemeId>('xinyun');
  let toneMode = $state<ToneMode>('none');

  const scheme = $derived(getScheme(schemeId));
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

  /** Map line index → group color index (or null if line not in any group). */
  const lineColorMap = $derived(
    (() => {
      const map: Record<number, number> = {};
      analysis.groups.forEach((group, gIdx) => {
        for (const li of group.lineIndices) {
          map[li] = gIdx % GROUP_TINTS.length;
        }
      });
      return map;
    })()
  );

  /**
   * For a given line, the depth of its tail rhyme (K) with the strongest
   * partner in the same group. Used to highlight the last K syllables.
   */
  function tailDepthForLine(lineIndex: number): number {
    let maxK = 0;
    for (const p of analysis.pairs) {
      if (p.indexA === lineIndex || p.indexB === lineIndex) {
        if (p.tailK > maxK) maxK = p.tailK;
      }
    }
    return maxK;
  }

  /**
   * A syllable's chip styling has three levels:
   *   TAIL — in the cross-line tail rhyme (last K positions). Strong tint + ring.
   *   INTERNAL — elsewhere in the line but shares the line's end-rhyme key
   *              (internal rhyme). Lighter tint (opacity reduced).
   *   NONE — doesn't match the end key / no group. Neutral gray.
   */
  function chipClass(lineIndex: number, sylIndex: number, totalSyls: number): string {
    const colorIdx = lineColorMap[lineIndex];
    if (colorIdx === undefined) {
      return 'bg-zinc-100 text-zinc-700 dark:text-zinc-300 dark:bg-zinc-800';
    }
    const tint = GROUP_TINTS[colorIdx];
    const tailDepth = tailDepthForLine(lineIndex);
    const isInTail = sylIndex >= totalSyls - tailDepth && tailDepth > 0;
    if (isInTail) {
      return `${tint.bg} ${tint.text} ring-1 ${tint.ring}`;
    }
    // Internal rhyme: syllable matches the line's end-rhyme key but isn't
    // in the cross-line tail window.
    const line = analysis.lines[lineIndex];
    const endKey = line.keys[line.keys.length - 1];
    if (endKey && line.keys[sylIndex] === endKey) {
      return `${tint.bg} ${tint.text} opacity-70`;
    }
    return 'bg-zinc-100 text-zinc-700 dark:text-zinc-300 dark:bg-zinc-800';
  }

  const internalRhymeLineCount = $derived(
    analysis.lines.filter((l) => l.internalGroups.size > 0).length
  );

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
  <title>反向分析 · 中文押韵发现</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-12">
  <header class="mb-6">
    <h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">反向分析</h1>
    <p class="mt-2 text-base text-zinc-600 dark:text-zinc-400">
      把歌词粘进来，看每行押什么、和哪些行相互押。
    </p>
  </header>

  <!-- Preset chips -->
  <div class="mb-3 flex flex-wrap gap-2 text-xs">
    <span class="text-zinc-500">示例：</span>
    {#each PRESETS as preset (preset.name)}
      <button
        class="rounded border border-zinc-300 dark:border-zinc-700 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        onclick={() => presetExample(preset.text)}
      >
        {preset.name}
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
          : 'border-zinc-300 dark:border-zinc-700 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
        onclick={() => (schemeId = s.id)}
      >
        {s.name}
      </button>
    {/each}
  </div>

  <!-- Tone-mode selector: how strict should声调 matter for a rhyme? -->
  <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
    <span class="text-zinc-500">声调：</span>
    {#each TONE_MODES as m (m)}
      <button
        class="rounded border px-2.5 py-1 text-xs transition {toneMode === m
          ? 'border-zinc-900 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
          : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}"
        title={
          m === 'none'
            ? '只比 韵母 — 最常见的 rap 判准'
            : m === 'pingze'
              ? '韵母 + 平仄 — 平(1/2)与仄(3/4/0)不通押'
              : '韵母 + 声调数字 — 每个音节声调必须一致'
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
    placeholder="粘贴几行歌词或诗句…"
  ></textarea>

  <!-- Top-line stats -->
  <section class="mt-6 grid gap-3 sm:grid-cols-3">
    <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <p class="font-mono text-xs uppercase tracking-wider text-zinc-500">最强尾押</p>
      <p class="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        {analysis.maxTailK} <span class="text-base font-normal text-zinc-500">押</span>
      </p>
    </div>
    <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <p class="font-mono text-xs uppercase tracking-wider text-zinc-500">行数</p>
      <p class="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{analysis.lines.length}</p>
    </div>
    <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <p class="font-mono text-xs uppercase tracking-wider text-zinc-500">押韵组</p>
      <p class="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{analysis.groups.length}</p>
      {#if analysis.groups.length > 0}
        <p class="mt-1 text-xs text-zinc-500">
          {analysis.groups
            .map((g) => `${g.lineIndices.length}行同${g.rhymeKey || '?'}`)
            .join(' · ')}
        </p>
      {/if}
    </div>
  </section>

  {#if internalRhymeLineCount > 0}
    <p class="-mt-2 mb-4 text-xs text-zinc-500">
      其中 <span class="font-semibold text-zinc-700 dark:text-zinc-300">{internalRhymeLineCount}</span> 行有内部重复押韵（同行多位同韵，不只末尾）— 浅色色块标出。
    </p>
  {/if}

  <!-- Per-line view with color-coded chips -->
  <section class="mt-6">
    <h2 class="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">逐行解读</h2>
    {#if analysis.lines.every((l) => l.syllables.length === 0)}
      <p class="text-sm text-zinc-500">输入区还没有可分析的中文音节。</p>
    {:else}
      <div class="space-y-3">
        {#each analysis.lines as line (line.index)}
          {@const colorIdx = lineColorMap[line.index]}
          <div
            class="rounded-lg border bg-white dark:bg-zinc-900 p-4 transition {colorIdx !== undefined
              ? `${GROUP_TINTS[colorIdx].ring} ring-1`
              : 'border-zinc-200 dark:border-zinc-800'}"
          >
            <div class="mb-2 flex items-baseline gap-3">
              <span class="font-mono text-xs text-zinc-400">L{line.index + 1}</span>
              <span class="text-sm text-zinc-700 dark:text-zinc-300">{line.text || '（空行）'}</span>
            </div>
            {#if line.syllables.length > 0}
              <div class="flex flex-wrap gap-1.5 font-mono text-xs">
                {#each line.syllables as syl, i (i)}
                  <span
                    class="rounded px-1.5 py-1 {chipClass(
                      line.index,
                      i,
                      line.syllables.length
                    )}"
                    title="{syl.char} · {syl.pinyinWithTone} · {line.keys[i] || '?'}"
                  >
                    <span class="font-sans text-sm">{syl.char}</span>
                    <span class="ml-1 opacity-70">{syl.final}</span>
                  </span>
                {/each}
              </div>
            {:else}
              <p class="text-xs text-zinc-400">（无中文音节）</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Pair matrix (if more than one rhyming pair) -->
  {#if analysis.pairs.length > 0}
    <section class="mt-6">
      <h2 class="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">行对行押韵深度</h2>
      <p class="mb-3 text-xs text-zinc-500">
        每格两个数：尾押 / 头押。0 表示无押韵。
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
        返回主页
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
