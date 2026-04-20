<script lang="ts">
  /**
   * 押韵集 · /write — v2 creative workspace.
   *
   * Paragraph-based model: each paragraph is a self-contained "stanza"
   * with its own editor and anchor sidebar. The user picks which words
   * rhyme by either
   *   - letting auto-anchoring pick the last dictionary-word of each
   *     line, or
   *   - selecting a substring in the editor and clicking "+ 把「…」
   *     加为押韵锚点".
   * Each anchor gets its own tone-mode toggle and candidate list.
   */
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import {
    getCurrentLexicon,
    ensureExtendedLexicon
  } from '$lib/core/corpus';
  import type { Lexicon } from '$lib/core/corpus';
  import {
    detectAutoAnchors,
    mergeAutoAnchors,
    revalidateManualAnchors,
    buildDictSet,
    type Anchor,
    type ToneMode
  } from '$lib/core/write/anchors';
  import { drafts, type Paragraph } from '$lib/stores/drafts.svelte';
  import { t } from '$lib/stores/lang.svelte';
  import ParagraphCard from '$lib/components/write/ParagraphCard.svelte';
  import DraftsPanel from '$lib/components/write/DraftsPanel.svelte';

  // ── Lexicon (seed first, extended streams in) ───────────────────
  let lexicon = $state<Lexicon>(getCurrentLexicon());
  const dictSet = $derived(buildDictSet(lexicon));

  // ── Working copy of the current draft's paragraphs ─────────────
  // Kept as local $state so typing is fast; synced back to the drafts
  // store with a 500ms debounce.
  let paragraphs = $state<Paragraph[]>([]);
  /** Which paragraph is currently focused (candidates render only for
   *  this paragraph's anchors to save work). */
  let focusedParagraphId = $state<string | null>(null);
  let hoveredKey = $state<string | null>(null);
  let draftsOpen = $state(false);

  // Keep paragraphs in sync with the selected draft.
  function loadFromDraft() {
    const cur = drafts.current;
    if (cur) {
      paragraphs = cur.paragraphs.map((p) => ({ ...p, manualAnchors: [...p.manualAnchors] }));
      focusedParagraphId = paragraphs[0]?.id ?? null;
    } else {
      paragraphs = [];
      focusedParagraphId = null;
    }
  }

  onMount(() => {
    if (!drafts.current) drafts.create();
    loadFromDraft();
    ensureExtendedLexicon(base).then((lex) => { lexicon = lex; });
  });

  // ── Debounced save ───────────────────────────────────────────────
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
  }
  function flushSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    const cur = drafts.current;
    if (!cur) return;
    // Persist only the paragraphs & manual anchors — auto anchors are
    // derived, not persisted.
    drafts.setParagraphs(
      cur.id,
      paragraphs.map((p) => ({
        id: p.id,
        text: p.text,
        manualAnchors: p.manualAnchors
      }))
    );
  }

  onMount(() => {
    const flush = () => flushSave();
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
    };
  });

  // ── Per-paragraph derived anchors ─────────────────────────────────
  // For each paragraph, anchors = detect-auto(text) + revalidated-manual.
  // We keep a per-paragraph "auto-anchor memo" so stable IDs are preserved
  // across keystrokes that don't change the detected word.
  let autoAnchorMemo = $state<Record<string, Anchor[]>>({});

  const paragraphAnchors = $derived.by<Record<string, Anchor[]>>(() => {
    const dict = dictSet; // force dep
    const out: Record<string, Anchor[]> = {};
    for (const p of paragraphs) {
      const fresh = detectAutoAnchors(p.text, dict);
      const merged = mergeAutoAnchors(autoAnchorMemo[p.id] ?? [], fresh);
      const validatedManual = revalidateManualAnchors(p.text, p.manualAnchors);
      // Keep auto anchors first (by lineIndex), then manual
      out[p.id] = [...merged, ...validatedManual];
    }
    return out;
  });

  // Write the merged auto-anchors back to the memo so next diff reuses IDs.
  $effect(() => {
    const dict = dictSet; void dict; // dep
    const newMemo: Record<string, Anchor[]> = {};
    for (const p of paragraphs) {
      newMemo[p.id] = (paragraphAnchors[p.id] ?? []).filter((a) => a.auto);
    }
    // Only update if actually different (avoid infinite loop).
    let changed = false;
    const oldKeys = Object.keys(autoAnchorMemo);
    const newKeys = Object.keys(newMemo);
    if (oldKeys.length !== newKeys.length) changed = true;
    else for (const k of newKeys) {
      const oldArr = autoAnchorMemo[k] ?? [];
      const newArr = newMemo[k];
      if (oldArr.length !== newArr.length) { changed = true; break; }
      for (let i = 0; i < newArr.length; i++) {
        if (oldArr[i]?.id !== newArr[i].id) { changed = true; break; }
      }
      if (changed) break;
    }
    if (changed) autoAnchorMemo = newMemo;
  });

  // ── Mutations on paragraphs ──────────────────────────────────────
  function handleTextChange(id: string, newText: string) {
    const idx = paragraphs.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const arr = [...paragraphs];
    arr[idx] = { ...arr[idx], text: newText };
    paragraphs = arr;
    scheduleSave();
  }

  function handleManualAnchorsChange(id: string, newManual: Anchor[]) {
    const idx = paragraphs.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const arr = [...paragraphs];
    arr[idx] = { ...arr[idx], manualAnchors: newManual };
    paragraphs = arr;
    scheduleSave();
  }

  function handleAnchorToneMode(paragraphId: string, anchorId: string, toneMode: ToneMode) {
    // Tone mode applies to BOTH auto and manual anchors — but only
    // manual ones are persisted. For auto anchors we persist via the
    // memo so the next detection round reuses it.
    const pIdx = paragraphs.findIndex((p) => p.id === paragraphId);
    if (pIdx < 0) return;

    // Try manual first
    const mIdx = paragraphs[pIdx].manualAnchors.findIndex((a) => a.id === anchorId);
    if (mIdx >= 0) {
      const newManual = [...paragraphs[pIdx].manualAnchors];
      newManual[mIdx] = { ...newManual[mIdx], toneMode };
      handleManualAnchorsChange(paragraphId, newManual);
      return;
    }
    // Auto — update the memo so it sticks through re-detection
    const autos = autoAnchorMemo[paragraphId] ?? [];
    const aIdx = autos.findIndex((a) => a.id === anchorId);
    if (aIdx >= 0) {
      const newAutos = [...autos];
      newAutos[aIdx] = { ...newAutos[aIdx], toneMode };
      autoAnchorMemo = { ...autoAnchorMemo, [paragraphId]: newAutos };
    }
  }

  function addParagraph() {
    const cur = drafts.current;
    if (!cur) return;
    const newId = drafts.addParagraph(cur.id);
    loadFromDraft();
    focusedParagraphId = newId;
  }

  function deleteParagraph(paragraphId: string) {
    const cur = drafts.current;
    if (!cur) return;
    if (paragraphs.length <= 1) {
      // Last paragraph — just clear
      handleTextChange(paragraphId, '');
      handleManualAnchorsChange(paragraphId, []);
      return;
    }
    if (!confirm(t('删除这一段？无法撤销。', 'Delete this paragraph? Cannot be undone.'))) return;
    drafts.removeParagraph(cur.id, paragraphId);
    loadFromDraft();
  }

  // ── Drafts panel handlers ──────────────────────────────────────
  function handleSelectDraft(id: string) {
    flushSave();
    drafts.setCurrent(id);
    loadFromDraft();
    draftsOpen = false;
  }
  function handleCreateDraft() {
    flushSave();
    drafts.create();
    loadFromDraft();
    draftsOpen = false;
  }

  // ── Copy / download ─────────────────────────────────────────────
  let copiedAt = $state(0);
  const allText = $derived(paragraphs.map((p) => p.text).join('\n\n'));

  function handleCopy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(allText).then(() => { copiedAt = Date.now(); });
    }
  }
  function handleDownload() {
    const title = drafts.current?.title || 'rhyme-draft';
    const blob = new Blob([allText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const currentTitle = $derived(drafts.current?.title ?? t('未命名草稿', 'Untitled'));
</script>

<svelte:head>
  <title>{t('写作 · 押韵集', 'Write · Chinese Rhymes')}</title>
  <meta
    name="description"
    content={t(
      '中文歌词 / 说唱 / 诗歌写作工作台。自动识别每行末尾的押韵锚点，也可选任意词作为押韵锚点，每个锚点独立显示押韵候选。',
      'A creative workspace for Chinese lyrics, rap, and poetry. Each line auto-anchors its tail word, and any selected word can become an extra rhyme anchor — candidates live next to each anchor.'
    )}
  />
  <link rel="canonical" href="https://qianyangpeng.github.io/chinese-rhyme-finder/write/" />
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-6">
  <!-- Title bar -->
  <header class="mb-5 flex items-baseline justify-between gap-3">
    <div class="min-w-0">
      <h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
        {t('写作', 'Write')}
      </h1>
      <p class="text-xs text-zinc-500 truncate">{currentTitle}</p>
    </div>
    <div class="flex shrink-0 items-center gap-1.5 text-xs">
      <button
        class="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        onclick={() => (draftsOpen = true)}
      >
        💾 {t('草稿', 'Drafts')} ({drafts.drafts.length})
      </button>
      <button
        class="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        onclick={handleCopy}
      >
        {#if copiedAt && Date.now() - copiedAt < 2000}
          ✓ {t('已复制', 'Copied')}
        {:else}
          📋 {t('复制全部', 'Copy all')}
        {/if}
      </button>
      <button
        class="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        onclick={handleDownload}
      >
        ⬇ {t('下载', 'Download')}
      </button>
    </div>
  </header>

  <!-- Paragraph stack -->
  <div class="space-y-4">
    {#each paragraphs as para, idx (para.id)}
      <ParagraphCard
        paragraphId={para.id}
        text={para.text}
        anchors={paragraphAnchors[para.id] ?? []}
        lexicon={lexicon}
        focused={focusedParagraphId === para.id}
        index={idx}
        hoveredKey={hoveredKey}
        onTextChange={(txt) => handleTextChange(para.id, txt)}
        onFocus={() => (focusedParagraphId = para.id)}
        onManualAnchorsChange={(manual) => handleManualAnchorsChange(para.id, manual)}
        onAnchorToneMode={(anchorId, tm) => handleAnchorToneMode(para.id, anchorId, tm)}
        onDelete={() => deleteParagraph(para.id)}
        onHoverKey={(k) => (hoveredKey = k)}
      />
    {/each}
  </div>

  <!-- New-paragraph button -->
  <div class="mt-4 flex justify-center">
    <button
      class="rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 py-3 text-sm text-zinc-600 dark:text-zinc-400 hover:border-sky-400 hover:text-sky-600 dark:hover:border-sky-600 dark:hover:text-sky-400"
      onclick={addParagraph}
    >
      + {t('新段落', 'New paragraph')}
    </button>
  </div>

  <!-- Footer hint -->
  <footer class="mt-8 border-t border-zinc-200 dark:border-zinc-800 pt-4 text-xs text-zinc-400">
    <p>
      {t(
        '默认：每行末尾的词（字典最长匹配）自动成为押韵锚点。选中任意字段可添加为额外锚点。每个锚点可单独选择严格度（韵母 / 韵母+声调）。',
        'Default: each line\'s last dictionary-word becomes an auto anchor. Select any text to add a manual anchor. Each anchor has its own strictness toggle (rhyme only / rhyme + tone).'
      )}
    </p>
  </footer>
</div>

<DraftsPanel
  open={draftsOpen}
  onClose={() => (draftsOpen = false)}
  onSelect={handleSelectDraft}
  onCreate={handleCreateDraft}
/>
