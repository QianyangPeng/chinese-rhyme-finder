<script lang="ts">
  // Discover page — placeholder. Real Discover UI lands in Phase 1.
</script>

<svelte:head>
  <title>中文押韵发现 · chinese-rhyme-finder</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-16">
  <header class="mb-12">
    <p class="font-mono text-xs uppercase tracking-widest text-zinc-500">
      chinese-rhyme-finder
    </p>
    <h1 class="mt-2 text-4xl font-bold tracking-tight text-zinc-900">
      中文押韵发现
    </h1>
    <p class="mt-3 text-lg text-zinc-600">不是字典，是灵感引擎。</p>
  </header>

  <section class="mb-10 rounded-lg border border-amber-200 bg-amber-50 p-5">
    <p class="font-mono text-xs uppercase tracking-wider text-amber-700">
      Status · Phase 0
    </p>
    <p class="mt-2 text-zinc-700">
      项目骨架就绪，核心引擎开发中。下一里程碑：拼音 → 韵母 → 韵组的确定性管道
      + 第一批 50k 词条语料。
    </p>
  </section>

  <section class="mb-10">
    <h2 class="text-xl font-semibold text-zinc-900">三种模式</h2>
    <ul class="mt-4 space-y-3 text-zinc-700">
      <li class="rounded-lg border border-zinc-200 bg-white p-4">
        <span class="font-semibold text-zinc-900">🔥 Discover</span>
        <span class="ml-2 rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600">
          P0 主打
        </span>
        <p class="mt-1 text-sm">
          系统主动展示算法挖掘的押韵 cluster，按巧妙度排序。打开就有灵感。
        </p>
      </li>
      <li class="rounded-lg border border-zinc-200 bg-white p-4">
        <span class="font-semibold text-zinc-900">🔍 Search</span>
        <p class="mt-1 text-sm">
          输入词组，查找多音节押韵候选。支持分级宽松（严式 → 邻韵）自动遍历。
        </p>
      </li>
      <li class="rounded-lg border border-zinc-200 bg-white p-4">
        <span class="font-semibold text-zinc-900">📖 Analyze</span>
        <p class="mt-1 text-sm">
          粘贴歌词，反向分析押韵模式 + 推荐相似 pattern。
        </p>
      </li>
    </ul>
  </section>

  <section class="mb-10">
    <h2 class="text-xl font-semibold text-zinc-900">设计原则</h2>
    <ul class="mt-4 list-inside list-disc space-y-2 text-zinc-700">
      <li>所有押韵匹配走<strong>确定性算法</strong> + 高质量语料，绝不让 LLM 生成韵脚</li>
      <li>多策略搜索 + <strong>分级宽松</strong>遍历：从严式到邻韵自动展开</li>
      <li><strong>纯静态站</strong>，浏览器内运行，零服务器，永远在线</li>
      <li>词库每条都过质量门槛 —— 不收"垃圾词"</li>
    </ul>
  </section>

  <footer class="mt-16 border-t border-zinc-200 pt-6 text-sm text-zinc-500">
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
