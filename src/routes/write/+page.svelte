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
    detectAutoAnchors,
    mergeAutoAnchors,
    revalidateManualAnchors,
    assignRhymeGroups,
    type Anchor,
    type GroupedAnchor,
    type ToneMode
  } from '$lib/core/write/anchors';
  import { drafts, type Paragraph } from '$lib/stores/drafts.svelte';
  import { t } from '$lib/stores/lang.svelte';
  import { searchClient } from '$lib/workers/searchClient.svelte';
  import ParagraphCard from '$lib/components/write/ParagraphCard.svelte';
  import AnchorCard from '$lib/components/write/AnchorCard.svelte';
  import DraftsPanel from '$lib/components/write/DraftsPanel.svelte';

  // ── Dict set for auto-anchor detection ───────────────────────────
  // Main thread doesn't load the 800k lexicon. The worker owns it and
  // ships back a 130k-entry text set (dictionary sources only, 2–4
  // chars) once ready. Until ready, dict is empty → auto-anchor falls
  // back to last-2-char heuristic, which is a reasonable starting
  // state while phrases stream in.
  const dictSet = $derived(searchClient.dictSet);

  // ── Working copy of the current draft's paragraphs ─────────────
  // Kept as local $state so typing is fast; synced back to the drafts
  // store with a 500ms debounce.
  let paragraphs = $state<Paragraph[]>([]);
  /** Which paragraph is currently focused (candidates render only for
   *  this paragraph's anchors to save work). */
  let focusedParagraphId = $state<string | null>(null);
  /** Legacy cross-chip final-key hover (used inside AnchorCard's
   *  target-finals strip). */
  let hoveredKey = $state<string | null>(null);
  /** Cross-anchor rhyme hover: when set, every anchor (in editor AND
   *  panel) whose `rhymeKey` matches lights up. */
  let hoveredRhymeKey = $state<string | null>(null);
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
    // Kick off worker init if it hasn't been already (e.g. when the
    // user lands on /write first without visiting /search). Idempotent.
    searchClient.init(base);
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

  const paragraphAnchors = $derived.by<Record<string, GroupedAnchor[]>>(() => {
    const dict = dictSet; // force dep
    const out: Record<string, GroupedAnchor[]> = {};
    // Shared rhymeKey → colorIdx so the same rhyme across paragraphs
    // gets the same color (instead of each paragraph re-starting at
    // colorIdx 0). Fed through assignRhymeGroups by reference —
    // subsequent calls see keys added by prior calls.
    const sharedColorMap = new Map<string, number>();
    for (const p of paragraphs) {
      const fresh = detectAutoAnchors(p.text, dict);
      const merged = mergeAutoAnchors(autoAnchorMemo[p.id] ?? [], fresh);
      const validatedManual = revalidateManualAnchors(p.text, p.manualAnchors);
      const combined = [...merged, ...validatedManual];
      out[p.id] = assignRhymeGroups(combined, sharedColorMap);
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

  // ── Insert candidate into the focused paragraph's textarea ────────
  // Candidates live in the right panel (not inside each paragraph),
  // so the insert helper here routes by focused paragraph id and
  // reaches the textarea via its DOM id. Cursor is placed after the
  // inserted text.
  function insertIntoFocused(insertion: string) {
    if (!focusedParagraphId) return;
    const el = document.getElementById(
      `paragraph-textarea-${focusedParagraphId}`
    ) as HTMLTextAreaElement | null;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const newText = before + insertion + after;
    handleTextChange(focusedParagraphId, newText);
    // Reposition cursor after the flush.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + insertion.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // ── Derived view: focused paragraph's panel-worthy anchors ───────
  const focusedAnchors = $derived(
    focusedParagraphId ? (paragraphAnchors[focusedParagraphId] ?? []) : []
  );
  // Anchors shown in the right panel: only the group "reps", and
  // ordered by their appearance in the paragraph (spec 2026-04-20
  // addendum §2 — "按文章中的顺序来，而不是添加顺序").
  const panelAnchors = $derived.by(() => {
    return focusedAnchors
      .filter((a) => a.showsPanel)
      .slice()
      .sort((a, b) => a.start - b.start);
  });
  const focusedIndex = $derived(
    focusedParagraphId ? paragraphs.findIndex((p) => p.id === focusedParagraphId) : -1
  );

  // ── Cumulative line numbers across paragraphs ────────────────────
  // P2 originally numbered each paragraph from 1. Per addendum §3,
  // line numbers continue: paragraph 2's first line = paragraph 1's
  // last line + 1.
  const paragraphStartLines = $derived.by<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    let cum = 1;
    for (const p of paragraphs) {
      out[p.id] = cum;
      cum += Math.max(1, p.text.split('\n').length);
    }
    return out;
  });
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

<div class="mx-auto max-w-[104rem]">
  <!-- Title bar -->
  <header class="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
    <div class="min-w-0">
      <h1 class="font-serif text-xl font-bold tracking-wide text-zinc-900 dark:text-zinc-100">
        {t('写作', 'Write')}
      </h1>
      <p class="text-xs text-zinc-500 truncate">{currentTitle}</p>
    </div>
    <div class="flex shrink-0 items-center gap-1.5 text-xs">
      <button
        class="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        onclick={() => (draftsOpen = true)}
      >
        {t('草稿', 'Drafts')} ({drafts.drafts.length})
      </button>
      <button
        class="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        onclick={handleCopy}
      >
        {#if copiedAt && Date.now() - copiedAt < 2000}
          ✓ {t('已复制', 'Copied')}
        {:else}
          {t('复制', 'Copy')}
        {/if}
      </button>
      <button
        class="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        onclick={handleDownload}
      >
        {t('下载', 'Download')}
      </button>
    </div>
  </header>

  <!-- Grid: editor takes 20–42rem, panel takes the rest of horizontal
       space (no fixed 22rem width). On wide screens the panel shows
       multiple anchors side-by-side via flex-wrap below; on narrow
       screens the whole thing stacks. -->
  <div class="grid grid-cols-1 md:grid-cols-[minmax(20rem,42rem)_1fr]">
    <!-- LEFT: paragraph stack -->
    <div class="md:border-r md:border-zinc-100 md:dark:border-zinc-800">
      {#each paragraphs as para, idx (para.id)}
        <ParagraphCard
          paragraphId={para.id}
          text={para.text}
          anchors={paragraphAnchors[para.id] ?? []}
          focused={focusedParagraphId === para.id}
          index={idx}
          startLine={paragraphStartLines[para.id] ?? 1}
          hoveredRhymeKey={hoveredRhymeKey}
          onTextChange={(txt) => handleTextChange(para.id, txt)}
          onFocus={() => (focusedParagraphId = para.id)}
          onManualAnchorsChange={(manual) => handleManualAnchorsChange(para.id, manual)}
          onDelete={() => deleteParagraph(para.id)}
          onHoverRhymeKey={(k) => (hoveredRhymeKey = k)}
        />
      {/each}

      <!-- New-paragraph button -->
      <div class="p-4 text-center">
        <button
          class="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-transparent px-5 py-1.5 text-xs text-zinc-500 hover:border-amber-400 hover:text-amber-600 dark:hover:border-amber-600 dark:hover:text-amber-400"
          onclick={addParagraph}
        >
          + {t('新段落', 'New paragraph')}
        </button>
      </div>
    </div>

    <!-- RIGHT: candidate panel for focused paragraph -->
    <aside class="hidden md:block">
      {#if focusedParagraphId && panelAnchors.length > 0}
        <div class="sticky top-0 max-h-screen overflow-y-auto bg-white dark:bg-zinc-950">
          <!-- Panel header -->
          <div class="flex items-baseline justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 px-3 py-2">
            <span class="text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
              {t(`段落 ${focusedIndex + 1} 的押韵`, `Paragraph ${focusedIndex + 1} rhymes`)}
            </span>
            <span class="text-[10px] text-zinc-400">
              {t(`${panelAnchors.length} 个锚点`, `${panelAnchors.length} anchors`)}
            </span>
          </div>
          <!-- Anchors flow in a multi-column wrap. Each column is ~14rem
               when expanded or 2.5rem when collapsed, so however much
               horizontal real estate the viewport gives, the panel
               fills with multiple columns rather than horizontally
               scrolling a single row. -->
          <div class="flex flex-wrap items-start gap-2 p-2">
            {#each panelAnchors as anchor (anchor.id)}
              <AnchorCard
                {anchor}
                active={true}
                hoveredKey={hoveredKey}
                hoveredRhymeKey={hoveredRhymeKey}
                onToneModeChange={(tm) => handleAnchorToneMode(focusedParagraphId ?? '', anchor.id, tm)}
                onRemove={() => {
                  // Only manual anchors are removable via the panel.
                  if (anchor.auto) return;
                  const current = paragraphs.find((p) => p.id === focusedParagraphId);
                  if (!current) return;
                  handleManualAnchorsChange(
                    focusedParagraphId ?? '',
                    current.manualAnchors.filter((a) => a.id !== anchor.id)
                  );
                }}
                onInsertCandidate={insertIntoFocused}
                onHoverKey={(k) => (hoveredKey = k)}
                onHoverRhymeKey={(k) => (hoveredRhymeKey = k)}
              />
            {/each}
          </div>
        </div>
      {:else}
        <div class="p-6 text-center text-xs text-zinc-400">
          {#if !focusedParagraphId}
            {t('点击左侧一个段落，这里会显示它的押韵候选', 'Click a paragraph on the left to see its rhyme candidates')}
          {:else}
            {t('该段落暂无押韵锚点', 'No rhyme anchors for this paragraph yet')}
          {/if}
        </div>
      {/if}
    </aside>
  </div>

  <!-- Footer hint -->
  <footer class="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 text-[11px] text-zinc-400">
    {t(
      '每行末尾的词自动成为押韵锚点；不押的行尾会成新锚点，押同韵的被同色标出。选中句中任意字段可加为额外锚点。',
      "Each line's tail auto-anchors; non-rhyming tails form new anchors while matching tails share color. Select any word to add a manual anchor."
    )}
  </footer>
</div>

<DraftsPanel
  open={draftsOpen}
  onClose={() => (draftsOpen = false)}
  onSelect={handleSelectDraft}
  onCreate={handleCreateDraft}
/>
