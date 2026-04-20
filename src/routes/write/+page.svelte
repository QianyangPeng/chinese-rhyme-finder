<script lang="ts">
  /**
   * 押韵集 · /write — the writing workspace.
   *
   * Fuses the existing Search + Analyze engines into a single "write
   * with rhyme assist" workflow:
   *   - Multi-line editor with per-line role labels (A/B/... ✓/~/✗)
   *   - Live reverse-analysis of rhyme structure
   *   - Scheme-driven constraint (free / monorhyme / AABB / ABAB / custom)
   *   - Candidate panel pulling from searchByFinals
   *   - Tab-to-insert candidate cycle
   *   - Multi-draft localStorage persistence with auto-save
   */
  import { onMount, tick } from 'svelte';
  import { base } from '$app/paths';
  import { strictScheme } from '$lib/core/rhyme';
  import { reverseAnalyze } from '$lib/core/analyze';
  import {
    getCurrentLexicon,
    ensureExtendedLexicon,
    searchByFinals
  } from '$lib/core/corpus';
  import type { Lexicon } from '$lib/core/corpus';
  import {
    computeLetters,
    computeAnchors,
    evaluateLine,
    FREE_LETTER,
    type SchemeConfig
  } from '$lib/core/write/scheme';
  import { drafts } from '$lib/stores/drafts.svelte';
  import { t } from '$lib/stores/lang.svelte';
  import Editor from '$lib/components/write/Editor.svelte';
  import AssistPanel from '$lib/components/write/AssistPanel.svelte';
  import DraftsPanel from '$lib/components/write/DraftsPanel.svelte';

  // ── Default scheme ─────────────────────────────────────────────────
  const DEFAULT_SCHEME: SchemeConfig = { type: 'free', depth: 2, toneMode: 'none' };

  // ── Editor state (mirrors the current draft, persisted by side effect) ──
  let editorText = $state('');
  let scheme = $state<SchemeConfig>(DEFAULT_SCHEME);
  let activeLineIndex = $state(0);
  let focusMode = $state(false);
  let draftsOpen = $state(false);
  let hoveredKey = $state<string | null>(null);
  let textareaEl = $state<HTMLTextAreaElement | null>(null);

  // Tab-cycle state — we remember the cursor position before the first
  // Tab insertion so subsequent Tabs can wipe back to it and insert the
  // next candidate in the list.
  let tabCycleIndex = $state<number | null>(null);
  let tabAnchorText = $state('');          // editorText before insertion
  let tabAnchorCursor = $state(0);

  // ── Lexicon (seed on mount; extend in browser only) ────────────────
  let lexicon = $state<Lexicon>(getCurrentLexicon());

  onMount(() => {
    // If no draft exists yet (first visit), seed a blank one.
    if (!drafts.current) {
      drafts.create(DEFAULT_SCHEME);
    }
    // Hydrate editor from the current draft.
    const cur = drafts.current;
    if (cur) {
      editorText = cur.content;
      scheme = cur.scheme;
    }
    // Start fetching the full lexicon for candidate queries.
    ensureExtendedLexicon(base).then((lex) => { lexicon = lex; });
  });

  // ── Auto-save (debounced) ──────────────────────────────────────────
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const cur = drafts.current;
      if (cur) drafts.update(cur.id, { content: editorText, scheme });
    }, 2000);
  }
  // Also flush on tab blur / beforeunload
  onMount(() => {
    const flush = () => {
      const cur = drafts.current;
      if (cur && (cur.content !== editorText || JSON.stringify(cur.scheme) !== JSON.stringify(scheme))) {
        drafts.update(cur.id, { content: editorText, scheme });
      }
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flush();
    });
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
    };
  });

  // ── Derived: rhyme analysis ─────────────────────────────────────────
  const analysis = $derived(
    reverseAnalyze(editorText, strictScheme, scheme.toneMode)
  );
  const lineCount = $derived(analysis.lines.length);
  const letters = $derived(
    computeLetters(scheme.type, lineCount, scheme.customPattern)
  );
  const anchors = $derived(
    computeAnchors(letters, analysis.lines, scheme.depth)
  );
  const lineMatches = $derived(
    analysis.lines.map((_, i) =>
      evaluateLine(i, letters, analysis.lines, anchors, scheme.depth)
    )
  );

  // ── Derived: active line + candidate search ────────────────────────
  const activeLineAnalysis = $derived(
    activeLineIndex >= 0 && activeLineIndex < analysis.lines.length
      ? analysis.lines[activeLineIndex]
      : null
  );
  const activeLineMatch = $derived(
    activeLineIndex >= 0 && activeLineIndex < lineMatches.length
      ? lineMatches[activeLineIndex]
      : null
  );

  /** Target finals to search rhymes for: group anchor's tail if the
   *  active line is constrained, else the active line's own tail. Null
   *  when there's nothing to search (empty line + free mode). */
  const candidateTarget = $derived.by<readonly string[] | null>(() => {
    if (!activeLineMatch || !activeLineAnalysis) return null;
    if (activeLineMatch.state === 'anchor') {
      // Anchor row — no "target" distinct from itself; hide candidates.
      return null;
    }
    if (activeLineMatch.state !== 'free' && activeLineMatch.targetKeys.length > 0) {
      return activeLineMatch.targetKeys;
    }
    // Free mode: search based on the line's current tail (if any) so the
    // user can see what kinds of words would rhyme forward.
    if (activeLineAnalysis.keys.length >= 2) {
      const L = Math.min(scheme.depth, activeLineAnalysis.keys.length);
      return activeLineAnalysis.keys.slice(-L);
    }
    return null;
  });

  const candidates = $derived.by(() => {
    if (!candidateTarget || candidateTarget.length === 0) return null;
    return searchByFinals(candidateTarget, strictScheme, lexicon, {
      excludeText: activeLineAnalysis?.text,
      maxPerBucket: 200,
      toneMode: scheme.toneMode,
      requireTailMatch: true,
      windowMode: 'tail'
    });
  });

  const flatHitsLen = $derived(
    candidates ? candidates.buckets.reduce((n, b) => n + b.hits.length, 0) : 0
  );

  // ── Mutations ───────────────────────────────────────────────────────
  function handleTextChange(newText: string) {
    editorText = newText;
    // Break out of Tab cycle on any free-form edit.
    tabCycleIndex = null;
    scheduleSave();
  }

  function handleSchemeChange(next: SchemeConfig) {
    scheme = next;
    scheduleSave();
  }

  async function insertAtCursor(insertion: string) {
    if (!textareaEl) {
      editorText = editorText + insertion;
      scheduleSave();
      return;
    }
    const start = textareaEl.selectionStart ?? editorText.length;
    const end = textareaEl.selectionEnd ?? start;
    const before = editorText.slice(0, start);
    const after = editorText.slice(end);
    editorText = before + insertion + after;
    scheduleSave();
    // Move cursor to end of inserted text after Svelte flushes.
    const newPos = start + insertion.length;
    await tick();
    if (textareaEl) {
      textareaEl.focus();
      textareaEl.setSelectionRange(newPos, newPos);
    }
  }

  // Flat candidate list mirror (we re-derive here for Tab cycling).
  const flatCandidateTexts = $derived.by(() => {
    if (!candidates) return [] as string[];
    const out: string[] = [];
    for (const b of candidates.buckets) for (const h of b.hits) out.push(h.phrase.text);
    return out;
  });

  async function handleTab(): Promise<boolean> {
    if (flatCandidateTexts.length === 0) return false;
    // First Tab → start cycle at index 0, save undo checkpoint.
    if (tabCycleIndex === null) {
      if (!textareaEl) return false;
      tabAnchorText = editorText;
      tabAnchorCursor = textareaEl.selectionStart ?? editorText.length;
      tabCycleIndex = 0;
      await insertAtCursor(flatCandidateTexts[0]);
      return true;
    }
    // Subsequent Tab → roll back to anchor, insert next candidate.
    const next = (tabCycleIndex + 1) % flatCandidateTexts.length;
    tabCycleIndex = next;
    const toInsert = flatCandidateTexts[next];
    const before = tabAnchorText.slice(0, tabAnchorCursor);
    const after = tabAnchorText.slice(tabAnchorCursor);
    editorText = before + toInsert + after;
    scheduleSave();
    await tick();
    if (textareaEl) {
      textareaEl.focus();
      const pos = tabAnchorCursor + toInsert.length;
      textareaEl.setSelectionRange(pos, pos);
    }
    return true;
  }

  function handleSpecialKey(key: 'tab' | 'escape' | 'save'): boolean {
    if (key === 'tab') {
      // handleTab is async but we need to tell the Editor to preventDefault
      // synchronously. Kick it off; the preventDefault itself only needs
      // to happen if we would insert. Check length here to answer.
      if (flatCandidateTexts.length === 0) return false;
      handleTab();
      return true;
    }
    if (key === 'escape') { tabCycleIndex = null; return false; }
    if (key === 'save') { flushSave(); return true; }
    return false;
  }

  function handleInsertCandidate(text: string) {
    tabCycleIndex = null;
    insertAtCursor(text);
  }

  function flushSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    const cur = drafts.current;
    if (cur) drafts.update(cur.id, { content: editorText, scheme });
  }

  // ── Drafts panel handlers ──────────────────────────────────────────
  function handleSelectDraft(id: string) {
    flushSave();
    drafts.setCurrent(id);
    const cur = drafts.current;
    if (cur) {
      editorText = cur.content;
      scheme = cur.scheme;
      activeLineIndex = 0;
      tabCycleIndex = null;
    }
    draftsOpen = false;
  }
  function handleCreateDraft() {
    flushSave();
    drafts.create(DEFAULT_SCHEME);
    const cur = drafts.current;
    if (cur) {
      editorText = cur.content;
      scheme = cur.scheme;
      activeLineIndex = 0;
      tabCycleIndex = null;
    }
    draftsOpen = false;
  }

  // ── Copy / download ─────────────────────────────────────────────────
  let copiedAt = $state(0);
  function handleCopy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(editorText).then(() => { copiedAt = Date.now(); });
    }
  }
  function handleDownload() {
    const title = drafts.current?.title || 'rhyme-draft';
    const blob = new Blob([editorText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Keyboard shortcuts at page level ───────────────────────────────
  function onGlobalKey(e: KeyboardEvent) {
    // ⌘/ toggles focus mode
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      focusMode = !focusMode;
    }
  }
  onMount(() => {
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  });

  // Current draft title for display
  const currentTitle = $derived(drafts.current?.title ?? t('未命名草稿', 'Untitled'));
</script>

<svelte:head>
  <title>{t('写作 · 押韵集', 'Write · Chinese Rhymes')}</title>
  <meta
    name="description"
    content={t(
      '中文歌词 / 说唱 / 诗歌写作工作台。边写边押 — 实时显示每行押韵状态、按 Tab 自动插入押韵候选词，支持 AABB / ABAB / 一韵到底等多种韵式。免费，不用 AI。',
      'A writing workspace for Chinese lyrics, rap, and poetry. Live rhyme analysis as you type — press Tab to insert rhyme candidates, supports AABB / ABAB / monorhyme schemes. Free, no AI.'
    )}
  />
  <link rel="canonical" href="https://qianyangpeng.github.io/chinese-rhyme-finder/write/" />
</svelte:head>

<div class="mx-auto flex h-[calc(100vh-3.25rem)] max-w-7xl flex-col px-4 py-4">
  <!-- Title bar -->
  <header class="mb-3 flex shrink-0 items-baseline justify-between gap-3">
    <div class="min-w-0">
      <h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
        {t('写作', 'Write')}
      </h1>
      <p class="text-xs text-zinc-500 truncate">
        {currentTitle}
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-1.5 text-xs">
      <button
        class="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        onclick={() => (draftsOpen = true)}
        title={t('草稿列表', 'Drafts')}
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
          📋 {t('复制', 'Copy')}
        {/if}
      </button>
      <button
        class="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        onclick={handleDownload}
      >
        ⬇ {t('下载', 'Download')}
      </button>
      <button
        class="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 {focusMode ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700' : ''}"
        onclick={() => (focusMode = !focusMode)}
        title={t('专注模式 (⌘/)', 'Focus mode (⌘/)')}
      >
        {focusMode ? '🔆' : '🌙'} {focusMode ? t('专注中', 'Focused') : t('专注', 'Focus')}
      </button>
    </div>
  </header>

  <!-- Main split: editor + assist panel -->
  <div class="flex min-h-0 flex-1 gap-4 {focusMode ? '' : 'lg:grid lg:grid-cols-[1fr_22rem]'}">
    <!-- Editor -->
    <div class="flex min-h-0 flex-1 flex-col">
      <Editor
        text={editorText}
        lineMatches={lineMatches}
        activeLineIndex={activeLineIndex}
        focusMode={focusMode}
        onTextChange={handleTextChange}
        onActiveLineChange={(i) => {
          if (i !== activeLineIndex) tabCycleIndex = null;
          activeLineIndex = i;
        }}
        onSpecialKey={handleSpecialKey}
        bind:textareaRef={textareaEl}
      />
    </div>

    <!-- Assist panel (hidden in focus mode) -->
    {#if !focusMode}
      <AssistPanel
        scheme={scheme}
        onSchemeChange={handleSchemeChange}
        activeLineIndex={activeLineIndex}
        activeLineAnalysis={activeLineAnalysis}
        activeLineMatch={activeLineMatch}
        candidates={candidates}
        tabCycleIndex={tabCycleIndex}
        onInsertCandidate={handleInsertCandidate}
        onHoverKey={(k) => { hoveredKey = k; }}
        hoveredKey={hoveredKey}
      />
    {/if}
  </div>

  <!-- Bottom hint bar -->
  <footer class="mt-2 shrink-0 font-mono text-[10px] text-zinc-400 dark:text-zinc-600">
    <span class="mr-3">{t('Tab 插入候选', 'Tab: insert candidate')}</span>
    <span class="mr-3">{t('Esc 退出候选循环', 'Esc: exit cycle')}</span>
    <span class="mr-3">{t('⌘/ 专注模式', '⌘/: focus mode')}</span>
    <span class="mr-3">{t('⌘S 保存', '⌘S: save')}</span>
    {#if flatHitsLen > 0}
      <span class="ml-auto text-emerald-500">{t(`${flatHitsLen} 条候选`, `${flatHitsLen} candidates`)}</span>
    {/if}
  </footer>
</div>

<!-- Drafts drawer -->
<DraftsPanel
  open={draftsOpen}
  onClose={() => (draftsOpen = false)}
  onSelect={handleSelectDraft}
  onCreate={handleCreateDraft}
/>
