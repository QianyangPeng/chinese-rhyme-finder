<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { t } from '$lib/stores/lang.svelte';

  // Homepage loads ONLY manifest.json (~2KB) for source counts.
  // NO lexicon download (which is 280MB across 42 files).
  interface ManifestEntry { source: string; file: string; count: number; sizeKB: number; chunk?: number }

  let sourceCounts = $state<Record<string, number>>({});
  let totalPhrases = $state(0);
  let lexiconLoading = $state(true);

  onMount(async () => {
    try {
      const res = await fetch(`${base}/data/manifest.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest: ManifestEntry[] = await res.json();
      // Sum counts per source (chunks share the same source id).
      const counts: Record<string, number> = {};
      let total = 0;
      for (const entry of manifest) {
        counts[entry.source] = (counts[entry.source] || 0) + entry.count;
        total += entry.count;
      }
      sourceCounts = counts;
      totalPhrases = total;
    } catch {
      // Manifest missing — show zeros.
    }
    lexiconLoading = false;
  });

  // ── Source detail modal (loads source file on-demand) ─────────────
  let modalSourceId = $state<string | null>(null);
  let modalPage = $state(0);
  let modalPhrases = $state<any[]>([]);
  let modalLoading = $state(false);
  const MODAL_PAGE_SIZE = 50;

  const modalTotalPages = $derived(Math.ceil(modalPhrases.length / MODAL_PAGE_SIZE));
  const modalSlice = $derived(
    modalPhrases.slice(modalPage * MODAL_PAGE_SIZE, (modalPage + 1) * MODAL_PAGE_SIZE)
  );

  async function openSourceModal(id: string) {
    modalSourceId = id;
    modalPage = 0;
    modalPhrases = [];
    modalLoading = true;
    try {
      // Fetch manifest to find files for this source
      const mRes = await fetch(`${base}/data/manifest.json`);
      const manifest: ManifestEntry[] = await mRes.json();
      const files = manifest.filter((m) => m.source === id).map((m) => m.file);
      // Fetch all chunks in parallel
      const chunks = await Promise.all(
        files.map((f) => fetch(`${base}/data/${f}`).then((r) => r.json()))
      );
      const all: any[] = [];
      for (const chunk of chunks) {
        if (chunk?.phrases) all.push(...chunk.phrases);
      }
      modalPhrases = all;
    } catch {
      modalPhrases = [];
    }
    modalLoading = false;
  }

  function closeModal() {
    modalSourceId = null;
    modalPhrases = [];
  }

  // Source metadata for the dashboard cards.
  const SOURCES: Array<{
    id: string;
    label: string;
    labelEn: string;
    desc: string;
    descEn: string;
    color: string;
    license: string;
  }> = [
    {
      id: 'xinhua-idiom',
      label: '成语', labelEn: 'Idioms',
      desc: '新华成语词典 — 四字经典，千年积淀',
      descEn: 'Xinhua Idiom Dictionary — 4-char classics refined over a millennium',
      color: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30',
      license: 'MIT'
    },
    {
      id: 'opensubtitles-zh',
      label: '口语', labelEn: 'Colloquial',
      desc: 'OpenSubtitles 电影字幕 — 1600万行对白中挖出的现代口语',
      descEn: 'Modern spoken Chinese mined from 16M lines of OpenSubtitles dialogue',
      color: 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/30',
      license: 'CC-BY-ND'
    },
    {
      id: 'lyrics-hiphop',
      label: '说唱歌词', labelEn: 'Hip-Hop Lyrics',
      desc: '70+ 位中文说唱歌手的歌词 — 最高创意密度的押韵素材',
      descEn: 'Lyrics from 70+ Chinese rappers — the densest rhyme-craft in the corpus',
      color: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30',
      license: 'MIT'
    },
    {
      id: 'lyrics-pop',
      label: '流行歌词', labelEn: 'Pop Lyrics',
      desc: '500+ 歌手、5万首歌 — 流行/摇滚/民谣/R&B',
      descEn: '500+ artists, 50k songs — Pop / Rock / Folk / R&B',
      color: 'border-pink-300 bg-pink-50 dark:border-pink-800 dark:bg-pink-950/30',
      license: 'MIT'
    },
    {
      id: 'xinhua-xiehouyu',
      label: '歇后语', labelEn: 'Xiehouyu',
      desc: '新华歇后语答案 — 民间智慧，口语化意象',
      descEn: 'Two-part folk sayings — vernacular wit and vivid imagery',
      color: 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30',
      license: 'MIT'
    },
    {
      id: 'chinese-poetry/tang',
      label: '唐诗', labelEn: 'Tang Poetry',
      desc: '唐诗三百首 — 古典韵律的源头',
      descEn: '300 Tang Dynasty Poems — the wellspring of classical Chinese prosody',
      color: 'border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30',
      license: 'MIT'
    },
    {
      id: 'chinese-poetry/song',
      label: '宋词', labelEn: 'Song Lyrics',
      desc: '宋词三百首 — 婉约与豪放',
      descEn: '300 Song Dynasty Ci — graceful and bold',
      color: 'border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30',
      license: 'MIT'
    },
    {
      id: 'moegirl-acg',
      label: 'ACG · 二次元', labelEn: 'ACG · Otaku',
      desc: '萌娘百科 ACG 用语、网络流行语、弹幕用语、萌属性',
      descEn: 'Moegirlpedia — anime/game terms, internet slang, danmaku vocabulary',
      color: 'border-fuchsia-300 bg-fuchsia-50 dark:border-fuchsia-800 dark:bg-fuchsia-950/30',
      license: 'CC-BY-NC-SA'
    },
    {
      id: 'wiktionary-slang',
      label: '网络用语', labelEn: 'Net Slang',
      desc: '维基词典收录的汉语网络流行语',
      descEn: 'Chinese internet slang curated on Wiktionary',
      color: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30',
      license: 'CC-BY-SA'
    },
    {
      id: 'cedict',
      label: '词典', labelEn: 'Dictionary',
      desc: 'CC-CEDICT 开源中英词典 — 8万+ 基础2-3字常用词',
      descEn: 'CC-CEDICT open Chinese-English dictionary — 80k+ basic 2-3 char words',
      color: 'border-lime-300 bg-lime-50 dark:border-lime-800 dark:bg-lime-950/30',
      license: 'CC-BY-SA'
    },
  ];
</script>

<svelte:head>
  <title>{t('押韵集 · Chinese Rhymes — 在线中文押韵词典', 'Chinese Rhymes 押韵集 — Free online Chinese rhyme dictionary')}</title>
  <meta
    name="description"
    content={t(
      `押韵集（Chinese Rhymes）— 收录 ${totalPhrases.toLocaleString()} 条中文短语，10 个开源语料库（成语、说唱、流行歌词、电影字幕、CC-CEDICT 等）。免费的中文押韵词典，支持双押到八押多音节押韵查询，写歌词、说唱、对联、诗词都好用。`,
      `Chinese Rhymes — ${totalPhrases.toLocaleString()} Chinese phrases across 10 open-source corpora (idioms, hip-hop & pop lyrics, movie subtitles, CC-CEDICT, more). Free Mandarin rhyme dictionary with 2- to 8-syllable multi-rhyme search. For songwriters, rappers, and poets.`
    )}
  />
  <link rel="canonical" href="https://qianyangpeng.github.io/chinese-rhyme-finder/" />
</svelte:head>

<div class="mx-auto max-w-4xl px-6 py-12">
  <!-- 主标题 -->
  <header class="mb-10 text-center">
    <h1 class="text-6xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
      {t('押韵集', 'Chinese Rhymes')}
    </h1>
    <p class="mt-3 font-mono text-xs uppercase tracking-[0.3em] text-zinc-400">
      {t('Chinese Rhymes', '押韵集')}
    </p>
    <p class="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
      {t(
        `收录 ${totalPhrases.toLocaleString()} 条中文短语 · ${SOURCES.length} 个语料库`,
        `${totalPhrases.toLocaleString()} Chinese phrases · ${SOURCES.length} corpora`
      )}
    </p>
  </header>

  <!-- 四大功能入口 -->
  <section class="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <a
      href="{base}/write/"
      class="group rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6 text-center shadow transition hover:shadow-lg hover:border-amber-500 dark:hover:border-amber-600 relative"
    >
      <span class="absolute -top-2 -right-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">NEW</span>
      <p class="text-3xl">✍</p>
      <h2 class="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">{t('写作', 'Write')}</h2>
      <p class="mt-1 text-sm text-zinc-500">{t('边写边押：实时押韵分析 + Tab 补全候选词', 'Write with live rhyme hints + Tab-to-insert candidates')}</p>
    </a>
    <a
      href="{base}/discover/"
      class="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center shadow transition hover:shadow-lg hover:border-zinc-400 dark:hover:border-zinc-600"
    >
      <p class="text-3xl">🔥</p>
      <h2 class="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">{t('押韵灵感', 'Discover')}</h2>
      <p class="mt-1 text-sm text-zinc-500">{t('浏览算法自动发现的押韵组合，找到你想不到的妙语搭配', 'Browse algorithm-mined rhyme combos you never would have thought of')}</p>
    </a>
    <a
      href="{base}/search/"
      class="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center shadow transition hover:shadow-lg hover:border-zinc-400 dark:hover:border-zinc-600"
    >
      <p class="text-3xl">🔍</p>
      <h2 class="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">{t('找押韵', 'Search')}</h2>
      <p class="mt-1 text-sm text-zinc-500">{t('输入一个词，从语料库里找出所有跟它押韵的候选词', 'Enter a phrase, get every rhyme candidate from the corpus')}</p>
    </a>
    <a
      href="{base}/analyze/"
      class="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center shadow transition hover:shadow-lg hover:border-zinc-400 dark:hover:border-zinc-600"
    >
      <p class="text-3xl">📝</p>
      <h2 class="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">{t('歌词分析', 'Analyze')}</h2>
      <p class="mt-1 text-sm text-zinc-500">{t('粘贴歌词，自动标注押韵位置、类型和深度', 'Paste lyrics to see rhyme positions, types, and depth')}</p>
    </a>
  </section>

  <!-- Data sources dashboard -->
  <section class="mb-10">
    <h2 class="mb-4 text-xl font-bold text-zinc-900 dark:text-zinc-100">
      {t('语料数据源', 'Data Sources')}
    </h2>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each SOURCES as src (src.id)}
        {@const count = sourceCounts[src.id] ?? 0}
        <button
          class="rounded-lg border {src.color} p-4 text-left transition hover:shadow-md hover:scale-[1.02] cursor-pointer"
          onclick={() => count > 0 && openSourceModal(src.id)}
          disabled={count === 0}
        >
          <div class="flex items-baseline justify-between">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t(src.label, src.labelEn)}</h3>
            <span class="font-mono text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {#if lexiconLoading}
                <span class="inline-block h-5 w-12 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700"></span>
              {:else}
                {count > 0 ? count.toLocaleString() : '—'}
              {/if}
            </span>
          </div>
          <p class="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{t(src.desc, src.descEn)}</p>
          <div class="mt-1 flex items-center justify-between">
            <span class="font-mono text-[10px] text-zinc-400">{src.license}</span>
            {#if count > 0}
              <span class="text-[10px] text-zinc-400">{t('点击查看 →', 'View →')}</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
    <p class="mt-3 text-right text-sm text-zinc-500">
      {t('合计', 'Total')} <span class="font-bold text-zinc-900 dark:text-zinc-100">{totalPhrases.toLocaleString()}</span> {t('条', 'phrases')}
    </p>
  </section>

  <!-- Star prompt -->
  <section class="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6 text-center">
    <p class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
      {t('觉得好用？给个 ⭐ 支持一下！', 'Finding this useful? Drop a ⭐!')}
    </p>
    <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
      {t('开源项目，你的 Star 是最大的鼓励', 'Open source — your star is the best encouragement')}
    </p>
    <a
      href="https://github.com/QianyangPeng/chinese-rhyme-finder"
      target="_blank"
      rel="noopener"
      class="mt-3 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      ⭐ Star on GitHub
    </a>
  </section>

  <!-- Issue / feedback prompt -->
  <section class="mb-10 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 p-6 text-center">
    <p class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
      {t('发现 bug？有好点子？欢迎提 issue', 'Found a bug? Have an idea? File an issue!')}
    </p>
    <p class="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
      {t('押韵不对、数据错漏、想加功能，都可以在 GitHub 告诉我', 'Wrong rhymes, data errors, feature requests — tell me on GitHub')}
    </p>
    <a
      href="https://github.com/QianyangPeng/chinese-rhyme-finder/issues/new"
      target="_blank"
      rel="noopener"
      class="mt-3 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-400"
    >
      {t('提一个 Issue →', 'File an Issue →')}
    </a>
  </section>

  <!-- Footer -->
  <footer class="border-t border-zinc-200 dark:border-zinc-800 pt-6 text-sm text-zinc-500">
    <p>
      {t('开源项目', 'Open source')} ·
      <a
        href="https://github.com/QianyangPeng/chinese-rhyme-finder"
        class="text-zinc-700 dark:text-zinc-300 underline hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        GitHub
      </a>
      · {t('所有语料均来自开源数据集', 'All data from open-source corpora')}
    </p>
  </footer>
</div>

<!-- Source detail modal -->
{#if modalSourceId}
  {@const srcMeta = SOURCES.find((s) => s.id === modalSourceId)}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
  >
    <div class="mx-4 flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
      <!-- Modal header -->
      <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div>
          <h3 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {srcMeta ? t(srcMeta.label, srcMeta.labelEn) : modalSourceId}
          </h3>
          <p class="text-xs text-zinc-500">
            {t(
              `${modalPhrases.length.toLocaleString()} 条 · 第 ${modalPage + 1}/${modalTotalPages} 页`,
              `${modalPhrases.length.toLocaleString()} phrases · Page ${modalPage + 1}/${modalTotalPages}`
            )}
          </p>
        </div>
        <button
          class="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          onclick={closeModal}
        >
          ✕
        </button>
      </div>

      <!-- Modal body: scrollable table -->
      <div class="flex-1 overflow-y-auto px-6 py-3">
        {#if modalLoading}
          <div class="flex items-center justify-center py-12 text-zinc-400">
            <div class="h-6 w-6 rounded-full border-2 border-zinc-200 dark:border-zinc-700 border-t-zinc-500" style="animation: spin 0.7s linear infinite"></div>
            <span class="ml-2 text-sm">{t('加载数据…', 'Loading data…')}</span>
          </div>
        {:else}
        <table class="w-full text-sm">
          <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900 [&_th]:border-b [&_th]:border-zinc-200 dark:[&_th]:border-zinc-700">
            <tr class="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs text-zinc-500">
              <th class="py-2 pr-3 w-8">#</th>
              <th class="py-2 pr-3">{t('短语', 'Phrase')}</th>
              <th class="py-2 pr-3">{t('拼音', 'Pinyin')}</th>
              <th class="py-2 pr-3">{t('词性', 'POS')}</th>
              <th class="py-2 text-right">{t('质量', 'Quality')}</th>
            </tr>
          </thead>
          <tbody>
            {#each modalSlice as phrase, i (phrase.text)}
              <tr class="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                <td class="py-1.5 pr-3 font-mono text-xs text-zinc-400">
                  {modalPage * MODAL_PAGE_SIZE + i + 1}
                </td>
                <td class="py-1.5 pr-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  {phrase.text}
                </td>
                <td class="py-1.5 pr-3 font-mono text-xs text-zinc-500">
                  {phrase.pinyinWithTone?.join(' ') ?? ''}
                </td>
                <td class="py-1.5 pr-3 font-mono text-xs text-zinc-500">
                  {phrase.segments?.map((s) => `${s.text}/${s.pos}`).join(' ') ?? ''}
                </td>
                <td class="py-1.5 text-right font-mono text-xs text-zinc-400">
                  {phrase.quality.toFixed(2)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        {/if}
      </div>

      <!-- Modal footer: pagination -->
      <div class="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 px-6 py-3">
        <button
          class="rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-xs disabled:opacity-30"
          disabled={modalPage === 0}
          onclick={() => (modalPage = Math.max(0, modalPage - 1))}
        >
          {t('上一页', 'Prev')}
        </button>
        <span class="text-xs text-zinc-500">
          {modalPage * MODAL_PAGE_SIZE + 1}–{Math.min((modalPage + 1) * MODAL_PAGE_SIZE, modalPhrases.length)} / {modalPhrases.length.toLocaleString()}
        </span>
        <button
          class="rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-xs disabled:opacity-30"
          disabled={modalPage >= modalTotalPages - 1}
          onclick={() => (modalPage = Math.min(modalTotalPages - 1, modalPage + 1))}
        >
          {t('下一页', 'Next')}
        </button>
      </div>
    </div>
  </div>
{/if}
