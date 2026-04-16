<script lang="ts">
  import { getCurrentLexicon, ensureExtendedLexicon } from '$lib/core/corpus';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';

  let lexicon = $state(getCurrentLexicon());

  onMount(() => {
    ensureExtendedLexicon(base).then((lex) => {
      lexicon = lex;
    });
  });

  // Compute per-source counts from the loaded lexicon.
  const sourceCounts = $derived(
    (() => {
      const counts: Record<string, number> = {};
      for (const p of lexicon.phrases) {
        counts[p.source] = (counts[p.source] || 0) + 1;
      }
      return counts;
    })()
  );

  const totalPhrases = $derived(lexicon.phrases.length);

  // Source metadata for the dashboard cards.
  const SOURCES: Array<{
    id: string;
    label: string;
    desc: string;
    color: string;
    license: string;
  }> = [
    {
      id: 'xinhua-idiom',
      label: '成语',
      desc: '新华成语词典 — 四字经典，千年积淀',
      color: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30',
      license: 'MIT'
    },
    {
      id: 'opensubtitles-zh',
      label: '口语',
      desc: 'OpenSubtitles 电影字幕 — 1600万行对白中挖出的现代口语',
      color: 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/30',
      license: 'CC-BY-ND'
    },
    {
      id: 'lyrics-hiphop',
      label: '说唱歌词',
      desc: '70+ 位中文说唱歌手的歌词 — 最高创意密度的押韵素材',
      color: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30',
      license: 'MIT'
    },
    {
      id: 'lyrics-pop',
      label: '流行歌词',
      desc: '500+ 歌手、5万首歌 — 流行/摇滚/民谣/R&B',
      color: 'border-pink-300 bg-pink-50 dark:border-pink-800 dark:bg-pink-950/30',
      license: 'MIT'
    },
    {
      id: 'xinhua-xiehouyu',
      label: '歇后语',
      desc: '新华歇后语答案 — 民间智慧，口语化意象',
      color: 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30',
      license: 'MIT'
    },
    {
      id: 'chinese-poetry/tang',
      label: '唐诗',
      desc: '唐诗三百首 — 古典韵律的源头',
      color: 'border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30',
      license: 'MIT'
    },
    {
      id: 'chinese-poetry/song',
      label: '宋词',
      desc: '宋词三百首 — 婉约与豪放',
      color: 'border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30',
      license: 'MIT'
    },
    {
      id: 'wiktionary-slang',
      label: '网络用语',
      desc: '维基词典收录的汉语网络流行语',
      color: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30',
      license: 'CC-BY-SA'
    },
  ];
</script>

<svelte:head>
  <title>世界最强押韵网站</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-12">
  <!-- Hero -->
  <header class="mb-10 text-center">
    <h1 class="text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
      世界最强押韵网站
    </h1>
    <p class="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
      {totalPhrases.toLocaleString()} 条中文短语，来自 {SOURCES.length} 个开源语料库。
      从成语到说唱歌词，从唐诗到弹幕 — 算法挖掘一切押韵可能。
    </p>
    <div class="mt-6 flex flex-wrap justify-center gap-3">
      <a
        href="{base}/discover/"
        class="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Discover · 灵感发现
      </a>
      <a
        href="{base}/search/"
        class="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 shadow hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        Search · 查找押韵
      </a>
      <a
        href="{base}/analyze/"
        class="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300 shadow hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        Analyze · 反向分析
      </a>
    </div>
  </header>

  <!-- Data sources dashboard -->
  <section class="mb-10">
    <h2 class="mb-4 text-xl font-bold text-zinc-900 dark:text-zinc-100">
      语料数据源
    </h2>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each SOURCES as src (src.id)}
        {@const count = sourceCounts[src.id] ?? 0}
        <div class="rounded-lg border {src.color} p-4">
          <div class="flex items-baseline justify-between">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">{src.label}</h3>
            <span class="font-mono text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {count > 0 ? count.toLocaleString() : '—'}
            </span>
          </div>
          <p class="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{src.desc}</p>
          <p class="mt-1 font-mono text-[10px] text-zinc-400">{src.license}</p>
        </div>
      {/each}
    </div>
    <p class="mt-3 text-right text-sm text-zinc-500">
      合计 <span class="font-bold text-zinc-900 dark:text-zinc-100">{totalPhrases.toLocaleString()}</span> 条
    </p>
  </section>

  <!-- How it works -->
  <section class="mb-10">
    <h2 class="mb-4 text-xl font-bold text-zinc-900 dark:text-zinc-100">工作原理</h2>
    <div class="grid gap-4 sm:grid-cols-3">
      <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <p class="text-2xl">1</p>
        <p class="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">拼音分解</p>
        <p class="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          每个汉字 → 声母 + 韵母 + 声调。支持 apical-i 区分（只/zhi ≠ 李/li）。
        </p>
      </div>
      <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <p class="text-2xl">2</p>
        <p class="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">韵母匹配</p>
        <p class="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          多音节尾部对齐。2 押 = 最后两个韵母一致，4 押 = 最后四个。可选声调严格模式。
        </p>
      </div>
      <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <p class="text-2xl">3</p>
        <p class="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">聚类发现</p>
        <p class="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          算法扫描全库，找出所有韵母匹配的短语组合。按巧妙度、多样性、尾部独特性排序。
        </p>
      </div>
    </div>
  </section>

  <!-- Tech stack -->
  <section class="mb-10">
    <h2 class="mb-4 text-xl font-bold text-zinc-900 dark:text-zinc-100">技术栈</h2>
    <div class="flex flex-wrap gap-2 text-xs">
      {#each ['SvelteKit 2', 'Svelte 5 (runes)', 'TypeScript', 'Tailwind CSS', 'Python (jieba + pypinyin + OpenCC)', 'GitHub Pages', 'MIT License'] as tag}
        <span class="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-zinc-700 dark:text-zinc-300">
          {tag}
        </span>
      {/each}
    </div>
  </section>

  <!-- Footer -->
  <footer class="border-t border-zinc-200 dark:border-zinc-800 pt-6 text-sm text-zinc-500">
    <p>
      <a
        href="https://github.com/QianyangPeng/chinese-rhyme-finder"
        class="text-zinc-700 dark:text-zinc-300 underline hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        GitHub
      </a>
      · 所有语料均来自开源 / CC 协议数据集 · 不使用 LLM 推理
    </p>
  </footer>
</div>
