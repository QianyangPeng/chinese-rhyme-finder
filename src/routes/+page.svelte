<script lang="ts">
  import { parseSyllables } from '$lib/core/pinyin';
  import { ALL_SCHEMES, matchFull } from '$lib/core/rhyme';
  import type { Syllable } from '$lib/core/pinyin';
  import { base } from '$app/paths';

  // Two phrases to analyze. Defaults are the canonical Capper example
  // ("姜维的戏" vs "降维打击") that motivated the whole project — they show
  // off how a 1-position-relaxed match works under different schemes.
  let phraseA = $state('姜维的戏');
  let phraseB = $state('降维打击');

  const sylsA = $derived(parseSyllables(phraseA));
  const sylsB = $derived(parseSyllables(phraseB));

  const finalsA = $derived(sylsA.map((s) => s.final));
  const finalsB = $derived(sylsB.map((s) => s.final));

  // For each scheme, compute the match (or null if length mismatch).
  const comparisons = $derived(
    ALL_SCHEMES.map((scheme) => ({
      scheme,
      match: matchFull(finalsA, finalsB, scheme),
      keysA: sylsA.map((s) => scheme.keyOf(s.final)),
      keysB: sylsB.map((s) => scheme.keyOf(s.final))
    }))
  );

  function presetExample(a: string, b: string) {
    phraseA = a;
    phraseB = b;
  }

  function syllableLabel(s: Syllable): string {
    return [s.initial, s.final].filter(Boolean).join(' · ');
  }
</script>

<svelte:head>
  <title>中文押韵发现 · chinese-rhyme-finder</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-12">
  <header class="mb-10">
    <p class="font-mono text-xs uppercase tracking-widest text-zinc-500">
      chinese-rhyme-finder
    </p>
    <h1 class="mt-2 text-4xl font-bold tracking-tight text-zinc-900">
      中文押韵发现
    </h1>
    <p class="mt-3 text-lg text-zinc-600">不是字典，是灵感引擎。</p>
  </header>

  <!-- Status banner -->
  <section class="mb-8 rounded-lg border border-emerald-200 bg-emerald-50 p-5">
    <p class="font-mono text-xs uppercase tracking-wider text-emerald-700">
      Status · Phase 1 进行中
    </p>
    <p class="mt-2 text-sm text-zinc-700">
      拼音 → 韵母 → 韵组管道完成（95 单元测试通过）。3 个押韵 scheme（严式 /
      十三辙 / 宽松邻韵）+ matcher + 分级宽松枚举就绪。下一里程碑：词库 + Discover 模式 UI。
    </p>
  </section>

  <!-- Live engine demo -->
  <section class="mb-12">
    <h2 class="mb-1 text-2xl font-semibold text-zinc-900">引擎实测</h2>
    <p class="mb-4 text-sm text-zinc-600">
      输入两个词组，看引擎按音节拆韵母、按 3 个 scheme 判断押韵。
    </p>

    <!-- Preset buttons -->
    <div class="mb-4 flex flex-wrap gap-2 text-xs">
      <span class="text-zinc-500">试试：</span>
      <button
        class="rounded border border-zinc-300 bg-white px-2 py-1 hover:bg-zinc-50"
        onclick={() => presetExample('姜维的戏', '降维打击')}
      >
        姜维的戏 / 降维打击
      </button>
      <button
        class="rounded border border-zinc-300 bg-white px-2 py-1 hover:bg-zinc-50"
        onclick={() => presetExample('星辰大海', '银河大队')}
      >
        星辰大海 / 银河大队
      </button>
      <button
        class="rounded border border-zinc-300 bg-white px-2 py-1 hover:bg-zinc-50"
        onclick={() => presetExample('原神芭芭拉', '哈哈哈哈哈')}
      >
        原神芭芭拉 / 哈哈哈哈哈
      </button>
      <button
        class="rounded border border-zinc-300 bg-white px-2 py-1 hover:bg-zinc-50"
        onclick={() => presetExample('北京欢迎你', '南京见面礼')}
      >
        北京欢迎你 / 南京见面礼
      </button>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block">
        <span class="text-xs uppercase tracking-wider text-zinc-500">输入 A</span>
        <input
          type="text"
          bind:value={phraseA}
          placeholder="输入一个中文短语"
          class="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-base shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
      </label>
      <label class="block">
        <span class="text-xs uppercase tracking-wider text-zinc-500">输入 B</span>
        <input
          type="text"
          bind:value={phraseB}
          placeholder="输入另一个中文短语对比"
          class="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-base shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
      </label>
    </div>

    <!-- Per-phrase syllable breakdown -->
    <div class="mt-6 grid gap-4 sm:grid-cols-2">
      {#each [{ label: 'A', sylls: sylsA }, { label: 'B', sylls: sylsB }] as col (col.label)}
        <div class="rounded-lg border border-zinc-200 bg-white p-4">
          <p class="mb-2 font-mono text-xs uppercase tracking-wider text-zinc-500">
            {col.label} · {col.sylls.length} 音节
          </p>
          {#if col.sylls.length === 0}
            <p class="text-sm text-zinc-400">（无中文音节）</p>
          {:else}
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th class="py-1">字</th>
                  <th class="py-1">拼音</th>
                  <th class="py-1">韵母</th>
                  <th class="py-1">十三辙</th>
                </tr>
              </thead>
              <tbody>
                {#each col.sylls as s, i (i)}
                  <tr class="border-b border-zinc-100 last:border-0">
                    <td class="py-1.5 text-base">{s.char}</td>
                    <td class="py-1.5 font-mono text-zinc-700">
                      {s.pinyinWithTone}
                    </td>
                    <td class="py-1.5 font-mono font-semibold text-zinc-900">
                      {s.final}
                    </td>
                    <td class="py-1.5 text-zinc-600">
                      {ALL_SCHEMES[1].keyOf(s.final) || '—'}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Cross-scheme comparison -->
    <div class="mt-6 rounded-lg border border-zinc-200 bg-white p-4">
      <p class="mb-3 font-mono text-xs uppercase tracking-wider text-zinc-500">
        押韵对比
      </p>

      {#if sylsA.length === 0 || sylsB.length === 0}
        <p class="text-sm text-zinc-500">两侧都需至少一个中文音节。</p>
      {:else if sylsA.length !== sylsB.length}
        <p class="text-sm text-amber-700">
          长度不同（{sylsA.length} vs {sylsB.length} 音节）。FULL 模式需等长 ——
          后续 Search 模式会按尾对齐 / 头对齐处理。
        </p>
      {:else}
        <div class="space-y-3">
          {#each comparisons as { scheme, match, keysA, keysB } (scheme.id)}
            <div class="rounded border border-zinc-100 p-3">
              <div class="flex items-baseline justify-between">
                <p class="text-sm font-semibold text-zinc-800">{scheme.name}</p>
                {#if match}
                  {#if match.isFullMatch}
                    <span class="text-xs font-medium text-emerald-700">
                      ✓ 全押 ({match.comparedLength}/{match.comparedLength})
                    </span>
                  {:else}
                    <span class="text-xs font-medium text-amber-700">
                      Level {match.relaxationLevel} · {match.matchedPositions
                        .length}/{match.comparedLength} 押
                    </span>
                  {/if}
                {/if}
              </div>
              {#if match}
                <div class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
                  <span class="text-zinc-500">A</span>
                  <div class="flex flex-wrap gap-1.5">
                    {#each keysA as k, i (i)}
                      <span
                        class="rounded px-1.5 py-0.5 {match.perPosition[i]
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-rose-100 text-rose-900'}"
                      >
                        {k || '?'}
                      </span>
                    {/each}
                  </div>
                  <span class="text-zinc-500">B</span>
                  <div class="flex flex-wrap gap-1.5">
                    {#each keysB as k, i (i)}
                      <span
                        class="rounded px-1.5 py-0.5 {match.perPosition[i]
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-rose-100 text-rose-900'}"
                      >
                        {k || '?'}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <!-- Modes overview (kept short) -->
  <section class="mb-10">
    <h2 class="mb-3 text-xl font-semibold text-zinc-900">三种模式</h2>
    <ul class="space-y-2 text-sm text-zinc-700">
      <li>
        <a
          href="{base}/discover"
          class="font-semibold text-zinc-900 underline hover:text-zinc-700"
        >
          🔥 Discover →
        </a>
        <span class="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs text-emerald-700">就绪</span>
        — 算法主动挖掘的押韵 cluster，按巧妙度排序（种子库版本，词库扩充后效果更显著）
      </li>
      <li>
        <a
          href="{base}/search"
          class="font-semibold text-zinc-900 underline hover:text-zinc-700"
        >
          🔍 Search →
        </a>
        <span class="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs text-emerald-700">就绪</span>
        — 输入词组，分级宽松（严式 → 邻韵）查找押韵候选（内置 200+ 词条种子库）
      </li>
      <li>
        <a
          href="{base}/analyze"
          class="font-semibold text-zinc-900 underline hover:text-zinc-700"
        >
          📖 Analyze →
        </a>
        <span class="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs text-emerald-700">就绪</span>
        — 粘贴歌词，反向分析押韵模式（多行间的 K 押深度 + 同韵分组）
      </li>
    </ul>
  </section>

  <footer class="mt-10 border-t border-zinc-200 pt-6 text-sm text-zinc-500">
    <p>
      <a
        href="https://github.com/QianyangPeng/chinese-rhyme-finder"
        class="text-zinc-700 underline hover:text-zinc-900"
      >
        GitHub
      </a>
      ·
      <a
        href="https://github.com/QianyangPeng/chinese-rhyme-finder/blob/main/docs/DECISIONS.md"
        class="text-zinc-700 underline hover:text-zinc-900"
      >
        设计决策
      </a>
      ·
      <a
        href="https://github.com/QianyangPeng/chinese-rhyme-finder/blob/main/docs/ROADMAP.md"
        class="text-zinc-700 underline hover:text-zinc-900"
      >
        路线图
      </a>
    </p>
  </footer>
</div>
