<script lang="ts">
  /**
   * 押韵集 · /write — Studio IDE.
   *
   * The page is now organized around the act of writing:
   *   - left: a line-aware lyric editor with rhyme role/status badges
   *   - right: a focused assistant for the current line, not a dump of
   *     every anchor's search results
   *   - bottom/right: rhyme map and keyboard-oriented workflow hints
   */
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import {
    detectAutoAnchors,
    mergeAutoAnchors,
    revalidateManualAnchors,
    assignRhymeGroups,
    detectEchoAnchors,
    type Anchor,
    type GroupedAnchor,
    type ToneMode
  } from '$lib/core/write/anchors';
  import { parseSyllables } from '$lib/core/pinyin';
  import { drafts, type Paragraph } from '$lib/stores/drafts.svelte';
  import { t, lang } from '$lib/stores/lang.svelte';
  import {
    searchClient,
    type GroupedSearchResult,
    type GroupHit
  } from '$lib/workers/searchClient.svelte';
  import { SOURCES, sourceMeta } from '$lib/util/sources';
  import { rhymeColor } from '$lib/util/rhymeColors';
  import ParagraphCard, {
    type CursorInfo,
    type LineMeta
  } from '$lib/components/write/ParagraphCard.svelte';
  import DraftsPanel from '$lib/components/write/DraftsPanel.svelte';

  type SchemeMode = 'free' | 'monorhyme' | 'aabb' | 'abab';
  type CandidateVibe = 'rap' | 'lyrics' | 'spoken' | 'classic' | 'all';
  type LengthMode = 'any' | 'same' | 'shorter' | 'longer';
  type LineState = 'empty' | 'seed' | 'hit' | 'miss' | 'free';

  interface FlatLine {
    paragraphId: string;
    paragraphIndex: number;
    lineIndex: number;
    absIndex: number;
    text: string;
    start: number;
    end: number;
    anchors: GroupedAnchor[];
    tailAnchor: GroupedAnchor | null;
  }

  interface ActiveTarget {
    anchor: GroupedAnchor;
    seedLine: FlatLine;
    currentLine: FlatLine;
    currentAnchor: GroupedAnchor | null;
    role: string | null;
    state: LineState;
  }

  interface Suggestion {
    hit: GroupHit;
    level: number;
    tailText: string;
    score: number;
  }

  interface RhymeMapGroup {
    key: string;
    colorIdx: number;
    anchors: Array<{ text: string; line: number; paragraphId: string }>;
  }

  const dictSet = $derived(searchClient.dictSet);

  let paragraphs = $state<Paragraph[]>([]);
  let focusedParagraphId = $state<string | null>(null);
  let hoveredRhymeKey = $state<string | null>(null);
  let draftsOpen = $state(false);

  let schemeMode = $state<SchemeMode>('free');
  let assistantToneMode = $state<ToneMode>('none');
  let candidateVibe = $state<CandidateVibe>('rap');
  let lengthMode = $state<LengthMode>('any');
  let maxRelaxLevel = $state(1);
  let cursorInfo = $state<CursorInfo | null>(null);
  let tabCycleIndex = $state(0);

  const schemeOptions: Array<{ id: SchemeMode; zh: string; en: string; hintZh: string; hintEn: string }> = [
    { id: 'free', zh: '自由', en: 'Free', hintZh: '随写随看韵脚', hintEn: 'write freely' },
    { id: 'monorhyme', zh: '一韵到底', en: 'Monorhyme', hintZh: 'AAAA', hintEn: 'AAAA' },
    { id: 'aabb', zh: 'AABB', en: 'AABB', hintZh: '两两成对', hintEn: 'couplets' },
    { id: 'abab', zh: 'ABAB', en: 'ABAB', hintZh: '交替押韵', hintEn: 'alternating' }
  ];

  const vibeOptions: Array<{ id: CandidateVibe; zh: string; en: string; sources: string[] }> = [
    { id: 'rap', zh: '说唱优先', en: 'Rap first', sources: ['lyrics-hiphop', 'lyrics-pop', 'opensubtitles-zh', 'wiktionary-slang'] },
    { id: 'lyrics', zh: '歌词感', en: 'Lyric', sources: ['lyrics-pop', 'lyrics-hiphop', 'chinese-poetry/song', 'opensubtitles-zh'] },
    { id: 'spoken', zh: '口语', en: 'Spoken', sources: ['opensubtitles-zh', 'wiktionary-slang', 'lyrics-hiphop', 'cedict'] },
    { id: 'classic', zh: '典雅', en: 'Classic', sources: ['xinhua-idiom', 'chinese-poetry/tang', 'chinese-poetry/song', 'xinhua-xiehouyu', 'cedict'] },
    { id: 'all', zh: '全部', en: 'All', sources: SOURCES.map((s) => s.id) }
  ];

  const schemeExamples: Record<SchemeMode, string> = {
    free: [
      '在雨夜里寻找出口',
      '把没说完的话放进胸口',
      '你说明天还会继续',
      '我把声音写成灯火继续'
    ].join('\n'),
    monorhyme: [
      '我把孤单写进微光',
      '让旧梦重新越过心墙',
      '等鼓点落下推开天窗',
      '把名字唱成滚烫的光'
    ].join('\n'),
    aabb: [
      '我在雨里慢慢寻找出口',
      '把没说完的话放进胸口',
      '等鼓点亮起穿过街巷',
      '让新的旋律照进天光'
    ].join('\n'),
    abab: [
      '我在雨里慢慢寻找出口',
      '等鼓点亮起穿过街巷',
      '把没说完的话放进胸口',
      '让新的旋律照进天光'
    ].join('\n')
  };

  const knownExampleTexts = new Set(Object.values(schemeExamples));

  function enabledSourcesForVibe(): string[] {
    return vibeOptions.find((v) => v.id === candidateVibe)?.sources ?? SOURCES.map((s) => s.id);
  }

  function normalizeExampleText(text: string): string {
    return text.replace(/\r\n/g, '\n').trim();
  }

  function paragraphsAreBlank(ps: readonly Paragraph[] = paragraphs): boolean {
    return ps.every((p) => !p.text.trim() && p.manualAnchors.length === 0);
  }

  function paragraphsAreExample(ps: readonly Paragraph[] = paragraphs): boolean {
    return (
      ps.length === 1 &&
      ps[0].manualAnchors.length === 0 &&
      knownExampleTexts.has(normalizeExampleText(ps[0].text))
    );
  }

  function focusExampleParagraph(paragraphId: string) {
    focusedParagraphId = paragraphId;
    cursorInfo = { paragraphId, lineIndex: 0, cursor: 0 };
    requestAnimationFrame(() => {
      const el = document.getElementById(`paragraph-textarea-${paragraphId}`) as HTMLTextAreaElement | null;
      if (!el) return;
      el.focus();
      el.setSelectionRange(0, 0);
    });
  }

  function applySchemeExample(mode: SchemeMode) {
    const canReplaceCurrent = paragraphsAreBlank() || paragraphsAreExample();
    if (!canReplaceCurrent) {
      flushSave();
      const reusable = drafts.drafts.find(
        (draft) =>
          draft.id !== drafts.current?.id &&
          (paragraphsAreBlank(draft.paragraphs) || paragraphsAreExample(draft.paragraphs))
      );
      if (reusable) drafts.setCurrent(reusable.id);
      else drafts.create();
      loadFromDraft();
    }

    if (!drafts.current) {
      drafts.create();
      loadFromDraft();
    }
    const cur = drafts.current;
    if (!cur) return;

    let paragraphId = paragraphs[0]?.id ?? cur.paragraphs[0]?.id ?? '';
    if (!paragraphId) {
      paragraphId = drafts.addParagraph(cur.id);
      loadFromDraft();
    }
    if (!paragraphId) return;

    const exampleParagraph: Paragraph = {
      id: paragraphId,
      text: schemeExamples[mode],
      manualAnchors: []
    };
    drafts.setParagraphs(cur.id, [exampleParagraph]);
    paragraphs = [exampleParagraph];
    autoAnchorMemo = {};
    focusExampleParagraph(paragraphId);
  }

  function syncFocusedTextarea() {
    if (!focusedParagraphId) return;
    const el = document.getElementById(`paragraph-textarea-${focusedParagraphId}`) as HTMLTextAreaElement | null;
    if (!el) return;
    const idx = paragraphs.findIndex((p) => p.id === focusedParagraphId);
    if (idx < 0 || paragraphs[idx].text === el.value) return;
    const arr = [...paragraphs];
    arr[idx] = { ...arr[idx], text: el.value };
    paragraphs = arr;
  }

  function selectScheme(mode: SchemeMode) {
    syncFocusedTextarea();
    schemeMode = mode;
    applySchemeExample(mode);
  }

  function loadFromDraft() {
    const cur = drafts.current;
    if (cur) {
      paragraphs = cur.paragraphs.map((p) => ({ ...p, manualAnchors: [...p.manualAnchors] }));
      focusedParagraphId = paragraphs[0]?.id ?? null;
    } else {
      paragraphs = [];
      focusedParagraphId = null;
    }
    cursorInfo = null;
  }

  onMount(() => {
    if (!drafts.current) drafts.create();
    loadFromDraft();
    applySchemeExample(schemeMode);
    searchClient.init(base);
  });

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
  }

  function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const cur = drafts.current;
    if (!cur) return;
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
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flush();
    });
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
    };
  });

  let autoAnchorMemo = $state<Record<string, Anchor[]>>({});

  const paragraphAnchors = $derived.by<Record<string, GroupedAnchor[]>>(() => {
    const dict = dictSet;
    const out: Record<string, GroupedAnchor[]> = {};
    const sharedColorMap = new Map<string, number>();
    for (const p of paragraphs) {
      const fresh = detectAutoAnchors(p.text, dict);
      const merged = mergeAutoAnchors(autoAnchorMemo[p.id] ?? [], fresh);
      const validatedManual = revalidateManualAnchors(p.text, p.manualAnchors);
      const seeds = [...merged, ...validatedManual];
      const echoes = detectEchoAnchors(p.text, dict, seeds);
      out[p.id] = assignRhymeGroups([...seeds, ...echoes], sharedColorMap);
    }
    return out;
  });

  $effect(() => {
    const dict = dictSet;
    void dict;
    const newMemo: Record<string, Anchor[]> = {};
    for (const p of paragraphs) {
      newMemo[p.id] = (paragraphAnchors[p.id] ?? []).filter((a) => a.auto && !a.echo);
    }
    let changed = false;
    const oldKeys = Object.keys(autoAnchorMemo);
    const newKeys = Object.keys(newMemo);
    if (oldKeys.length !== newKeys.length) changed = true;
    else {
      for (const k of newKeys) {
        const oldArr = autoAnchorMemo[k] ?? [];
        const newArr = newMemo[k];
        if (oldArr.length !== newArr.length) {
          changed = true;
          break;
        }
        for (let i = 0; i < newArr.length; i++) {
          if (oldArr[i]?.id !== newArr[i].id || oldArr[i]?.toneMode !== newArr[i].toneMode) {
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
    if (changed) autoAnchorMemo = newMemo;
  });

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
    const pIdx = paragraphs.findIndex((p) => p.id === paragraphId);
    if (pIdx < 0) return;

    const mIdx = paragraphs[pIdx].manualAnchors.findIndex((a) => a.id === anchorId);
    if (mIdx >= 0) {
      const newManual = [...paragraphs[pIdx].manualAnchors];
      newManual[mIdx] = { ...newManual[mIdx], toneMode };
      handleManualAnchorsChange(paragraphId, newManual);
      return;
    }

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
      handleTextChange(paragraphId, '');
      handleManualAnchorsChange(paragraphId, []);
      return;
    }
    if (!confirm(t('删除这一段？无法撤销。', 'Delete this paragraph? Cannot be undone.'))) return;
    drafts.removeParagraph(cur.id, paragraphId);
    loadFromDraft();
  }

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

  let copiedAt = $state(0);
  const allText = $derived(paragraphs.map((p) => p.text).join('\n\n'));

  function handleCopy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(allText).then(() => {
        copiedAt = Date.now();
      });
    }
  }

  function handleDownload() {
    const title = drafts.current?.title || 'rhyme-draft';
    const blob = new Blob([allText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const currentTitle = $derived(drafts.current?.title ?? t('未命名草稿', 'Untitled'));

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
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + insertion.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function roleForAbsIndex(zeroBasedLine: number): string | null {
    if (schemeMode === 'free') return null;
    if (schemeMode === 'monorhyme') return 'A';
    if (schemeMode === 'aabb') {
      return String.fromCharCode(65 + Math.floor(zeroBasedLine / 2) % 26);
    }
    const pair = Math.floor(zeroBasedLine / 4);
    const inQuartet = zeroBasedLine % 4;
    const offset = inQuartet % 2;
    return String.fromCharCode(65 + (pair * 2 + offset) % 26);
  }

  const paragraphStartLines = $derived.by<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    let cum = 1;
    for (const p of paragraphs) {
      out[p.id] = cum;
      cum += Math.max(1, p.text.split('\n').length);
    }
    return out;
  });

  const flatLines = $derived.by<FlatLine[]>(() => {
    const out: FlatLine[] = [];
    let abs = 1;
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const p = paragraphs[pi];
      const anchors = paragraphAnchors[p.id] ?? [];
      const lines = p.text.split('\n');
      let offset = 0;
      for (let li = 0; li < lines.length; li++) {
        const text = lines[li];
        const start = offset;
        const end = offset + text.length;
        const lineAnchors = anchors.filter((a) => a.start < end && a.end > start);
        const tailAnchor = anchors.find((a) => a.auto && !a.echo && a.lineIndex === li) ?? null;
        out.push({
          paragraphId: p.id,
          paragraphIndex: pi,
          lineIndex: li,
          absIndex: abs,
          text,
          start,
          end,
          anchors: lineAnchors,
          tailAnchor
        });
        offset += text.length + 1;
        abs++;
      }
    }
    return out;
  });

  const lineMetaByParagraph = $derived.by<Record<string, LineMeta[]>>(() => {
    const firstByRole = new Map<string, FlatLine>();
    const rhymeCounts = new Map<string, number>();
    for (const line of flatLines) {
      if (line.tailAnchor) {
        rhymeCounts.set(line.tailAnchor.rhymeKey, (rhymeCounts.get(line.tailAnchor.rhymeKey) ?? 0) + 1);
      }
      const role = roleForAbsIndex(line.absIndex - 1);
      if (role && line.tailAnchor && !firstByRole.has(role)) firstByRole.set(role, line);
    }

    const out: Record<string, LineMeta[]> = {};
    for (const line of flatLines) {
      const role = roleForAbsIndex(line.absIndex - 1);
      let state: LineState = 'free';
      let targetLine: number | undefined;
      let color = line.tailAnchor ? rhymeColor(line.tailAnchor.colorIdx) : undefined;

      if (!line.text.trim()) state = 'empty';
      else if (schemeMode === 'free') {
        state = line.tailAnchor && (rhymeCounts.get(line.tailAnchor.rhymeKey) ?? 0) > 1 ? 'hit' : 'free';
      } else if (role) {
        const seed = firstByRole.get(role);
        targetLine = seed?.absIndex;
        if (!line.tailAnchor || !seed?.tailAnchor) state = 'empty';
        else if (seed.absIndex === line.absIndex) state = 'seed';
        else state = seed.tailAnchor.rhymeKey === line.tailAnchor.rhymeKey ? 'hit' : 'miss';
        color = seed?.tailAnchor ? rhymeColor(seed.tailAnchor.colorIdx) : color;
      }

      const meta: LineMeta = {
        role,
        state,
        tail: line.tailAnchor?.text ?? '',
        targetLine,
        colorBorder: color?.border,
        colorBg: color?.bg
      };
      if (!out[line.paragraphId]) out[line.paragraphId] = [];
      out[line.paragraphId][line.lineIndex] = meta;
    }
    return out;
  });

  const activeLine = $derived.by<FlatLine | null>(() => {
    if (cursorInfo) {
      const info = cursorInfo;
      const found = flatLines.find(
        (line) => line.paragraphId === info.paragraphId && line.lineIndex === info.lineIndex
      );
      if (found) return found;
    }
    if (focusedParagraphId) {
      return flatLines.find((line) => line.paragraphId === focusedParagraphId) ?? flatLines[0] ?? null;
    }
    return flatLines[0] ?? null;
  });

  const activeTarget = $derived.by<ActiveTarget | null>(() => {
    if (!activeLine) return null;
    const role = roleForAbsIndex(activeLine.absIndex - 1);
    let seedLine = activeLine;
    let state: LineState = 'free';

    if (schemeMode !== 'free' && role) {
      const seed = flatLines.find(
        (line) => roleForAbsIndex(line.absIndex - 1) === role && line.tailAnchor
      );
      if (seed) seedLine = seed;
      if (!activeLine.tailAnchor || !seedLine.tailAnchor) state = 'empty';
      else if (seedLine.absIndex === activeLine.absIndex) state = 'seed';
      else state = seedLine.tailAnchor.rhymeKey === activeLine.tailAnchor.rhymeKey ? 'hit' : 'miss';
    }

    const anchor = seedLine.tailAnchor ?? activeLine.tailAnchor;
    if (!anchor) return null;
    return {
      anchor,
      seedLine,
      currentLine: activeLine,
      currentAnchor: activeLine.tailAnchor,
      role,
      state
    };
  });

  function syllablePayload(text: string) {
    const syllables = parseSyllables(text);
    return {
      finals: syllables.map((s) => s.final),
      tones: syllables.map((s) => s.tone),
      pinyin: syllables.map((s) => s.pinyinWithTone).join(' ')
    };
  }

  let assistantResult = $state<GroupedSearchResult | null>(null);
  let assistantSearching = $state(false);
  let assistantReqSeq = 0;

  $effect(() => {
    const target = activeTarget;
    const ready = searchClient.isReady;
    const tone = assistantToneMode;
    const vibe = candidateVibe;
    void vibe;

    if (!target || !ready) {
      assistantReqSeq++;
      assistantResult = null;
      assistantSearching = false;
      return;
    }

    const payload = syllablePayload(target.anchor.text);
    if (payload.finals.length === 0) {
      assistantResult = null;
      assistantSearching = false;
      return;
    }

    const mySeq = ++assistantReqSeq;
    assistantSearching = true;
    const timer = setTimeout(() => {
      searchClient
        .search({
          target: payload.finals,
          targetTones: payload.tones,
          excludeText: target.anchor.text,
          toneMode: tone,
          requireTailMatch: true,
          windowMode: 'tail',
          enabledSources: enabledSourcesForVibe()
        })
        .then((r) => {
          if (mySeq !== assistantReqSeq) return;
          assistantResult = r;
          assistantSearching = false;
        })
        .catch(() => {
          if (mySeq !== assistantReqSeq) return;
          assistantResult = null;
          assistantSearching = false;
        });
    }, 160);

    return () => clearTimeout(timer);
  });

  function lengthMatches(hit: GroupHit, targetLength: number): boolean {
    if (lengthMode === 'any') return true;
    if (lengthMode === 'same') return hit.phraseLen === targetLength;
    if (lengthMode === 'shorter') return hit.phraseLen <= targetLength;
    return hit.phraseLen >= targetLength;
  }

  function sourceRank(source: string): number {
    const enabled = enabledSourcesForVibe();
    const idx = enabled.indexOf(source);
    if (idx >= 0) return idx;
    return 20 + sourceMeta(source).priority;
  }

  const suggestions = $derived.by<Suggestion[]>(() => {
    const result = assistantResult;
    const target = activeTarget;
    const levelCap = maxRelaxLevel;
    const length = lengthMode;
    void length;
    const vibe = candidateVibe;
    void vibe;
    if (!result || !target) return [];

    const seen = new Set<string>();
    const targetLength = target.anchor.text.length;
    const out: Suggestion[] = [];

    for (const level of result.levels) {
      if (level.level > levelCap) continue;
      for (const group of level.groups) {
        for (const hit of group.hits) {
          if (seen.has(hit.text)) continue;
          if (!lengthMatches(hit, targetLength)) continue;
          seen.add(hit.text);
          const score =
            level.level * 1000 +
            sourceRank(hit.source) * 50 +
            Math.abs(hit.phraseLen - targetLength) * 12 -
            hit.quality;
          out.push({ hit, level: level.level, tailText: group.tailText, score });
        }
      }
    }

    return out.sort((a, b) => a.score - b.score || a.hit.text.localeCompare(b.hit.text, 'zh-Hans')).slice(0, 80);
  });

  function insertSuggestion(suggestion: Suggestion) {
    insertIntoFocused(suggestion.hit.text);
    tabCycleIndex = 0;
  }

  onMount(() => {
    function onKeydown(e: KeyboardEvent) {
      const active = document.activeElement;
      if (!(active instanceof HTMLTextAreaElement)) return;
      if (e.key === 'Tab' && suggestions.length > 0) {
        e.preventDefault();
        const next = suggestions[tabCycleIndex % suggestions.length];
        insertIntoFocused(next.hit.text);
        tabCycleIndex = (tabCycleIndex + 1) % Math.max(1, Math.min(8, suggestions.length));
      }
      if (e.key === 'Escape') tabCycleIndex = 0;
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });

  const rhymeMapGroups = $derived.by<RhymeMapGroup[]>(() => {
    const map = new Map<string, RhymeMapGroup>();
    for (const line of flatLines) {
      const anchor = line.tailAnchor;
      if (!anchor) continue;
      let group = map.get(anchor.rhymeKey);
      if (!group) {
        group = { key: anchor.rhymeKey, colorIdx: anchor.colorIdx, anchors: [] };
        map.set(anchor.rhymeKey, group);
      }
      group.anchors.push({ text: anchor.text, line: line.absIndex, paragraphId: line.paragraphId });
    }
    return [...map.values()].sort((a, b) => b.anchors.length - a.anchors.length);
  });

  const studioStats = $derived.by(() => {
    const total = flatLines.filter((line) => line.text.trim()).length;
    let hits = 0;
    let misses = 0;
    for (const line of flatLines) {
      const meta = lineMetaByParagraph[line.paragraphId]?.[line.lineIndex];
      if (meta?.state === 'hit' || meta?.state === 'seed') hits++;
      if (meta?.state === 'miss') misses++;
    }
    return { total, hits, misses, groups: rhymeMapGroups.length };
  });

  function stateLabel(state: LineState): string {
    if (state === 'seed') return t('锚定', 'seed');
    if (state === 'hit') return t('命中', 'hit');
    if (state === 'miss') return t('偏韵', 'off');
    if (state === 'empty') return t('待写', 'empty');
    return t('自由', 'free');
  }

  function stateClass(state: LineState): string {
    if (state === 'hit') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
    if (state === 'miss') return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200';
    if (state === 'seed') return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200';
    return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
  }
</script>

<svelte:head>
  <title>{t('写作工作台 · 押韵集', 'Write Studio · Chinese Rhymes')}</title>
  <meta
    name="description"
    content={t(
      '中文歌词 / 说唱写作 IDE：自动识别韵脚、按韵式检查行与行关系，并为当前行给出可插入的押韵候选。',
      'A Chinese lyric-writing IDE: auto-detect rhyme anchors, check line structure by scheme, and suggest insertable rhymes for the current line.'
    )}
  />
  <link rel="canonical" href="https://qianyangpeng.github.io/chinese-rhyme-finder/write/" />
</svelte:head>

<div class="min-h-[calc(100vh-52px)] bg-zinc-50/70 dark:bg-zinc-950">
  <header class="border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
    <div class="mx-auto flex max-w-[104rem] flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-baseline gap-3">
          <h1 class="font-serif text-2xl font-bold tracking-wide text-zinc-950 dark:text-zinc-100">
            {t('写作工作台', 'Write Studio')}
          </h1>
          <span class="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {t('歌词 IDE', 'lyric IDE')}
          </span>
        </div>
        <p class="mt-0.5 truncate text-xs text-zinc-500">{currentTitle}</p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5 text-xs">
        <button
          class="rounded-md border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          onclick={() => (draftsOpen = true)}
        >
          {t('草稿', 'Drafts')} ({drafts.drafts.length})
        </button>
        <button
          class="rounded-md border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          onclick={handleCopy}
        >
          {#if copiedAt && Date.now() - copiedAt < 2000}
            ✓ {t('已复制', 'Copied')}
          {:else}
            {t('复制全文', 'Copy')}
          {/if}
        </button>
        <button
          class="rounded-md border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          onclick={handleDownload}
        >
          {t('下载', 'Download')}
        </button>
      </div>
    </div>
  </header>

  <div class="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
    <div class="mx-auto grid max-w-[104rem] gap-3 lg:grid-cols-[1fr_auto]">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-medium text-zinc-500">{t('韵式', 'Scheme')}</span>
        <div class="flex flex-wrap gap-1">
          {#each schemeOptions as option (option.id)}
            <button
              class="rounded-md border px-3 py-1.5 text-xs transition {schemeMode === option.id
                ? 'border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'}"
              title={t(option.hintZh, option.hintEn)}
              onclick={() => selectScheme(option.id)}
            >
              {t(option.zh, option.en)}
            </button>
          {/each}
        </div>

        <span class="ml-3 text-xs font-medium text-zinc-500">{t('候选', 'Suggestions')}</span>
        <select
          bind:value={candidateVibe}
          class="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          {#each vibeOptions as option (option.id)}
            <option value={option.id}>{t(option.zh, option.en)}</option>
          {/each}
        </select>
        <select
          bind:value={lengthMode}
          class="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="any">{t('任意长度', 'Any length')}</option>
          <option value="same">{t('同字数', 'Same length')}</option>
          <option value="shorter">{t('短一点', 'Shorter')}</option>
          <option value="longer">{t('长一点', 'Longer')}</option>
        </select>
        <select
          bind:value={maxRelaxLevel}
          class="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value={0}>{t('只要全押', 'Full only')}</option>
          <option value={1}>{t('允许 1 位放宽', 'Relax 1')}</option>
          <option value={2}>{t('允许 2 位放宽', 'Relax 2')}</option>
        </select>
        <button
          class="rounded-md border px-3 py-1.5 text-xs {assistantToneMode === 'none'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
            : 'border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}"
          onclick={() => (assistantToneMode = assistantToneMode === 'none' ? 'exact' : 'none')}
        >
          {assistantToneMode === 'none' ? t('韵母优先', 'Rhyme only') : t('韵母+声调', 'Rhyme + tone')}
        </button>
      </div>

      <div class="grid grid-cols-4 gap-2 text-center text-[11px]">
        <div class="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="font-mono text-sm font-semibold">{studioStats.total}</p>
          <p class="text-zinc-500">{t('行', 'lines')}</p>
        </div>
        <div class="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="font-mono text-sm font-semibold">{studioStats.groups}</p>
          <p class="text-zinc-500">{t('韵组', 'groups')}</p>
        </div>
        <div class="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p class="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-300">{studioStats.hits}</p>
          <p class="text-emerald-700/70 dark:text-emerald-300/70">{t('命中', 'hits')}</p>
        </div>
        <div class="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 dark:border-rose-900 dark:bg-rose-950/30">
          <p class="font-mono text-sm font-semibold text-rose-700 dark:text-rose-300">{studioStats.misses}</p>
          <p class="text-rose-700/70 dark:text-rose-300/70">{t('偏韵', 'off')}</p>
        </div>
      </div>
    </div>
  </div>

  <main class="mx-auto grid max-w-[104rem] grid-cols-1 gap-0 lg:grid-cols-[minmax(36rem,1fr)_29rem]">
    <section class="min-w-0 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div class="border-b border-zinc-100 px-4 py-2 text-[11px] text-zinc-500 dark:border-zinc-800">
        {t(
          '左侧行号旁显示当前韵式角色与状态；选中任意中文片段可加为句中押韵锚点。',
          'Line badges show scheme role and status; select any Chinese phrase to add an internal rhyme anchor.'
        )}
      </div>

      {#each paragraphs as para, idx (para.id)}
        <ParagraphCard
          paragraphId={para.id}
          text={para.text}
          anchors={paragraphAnchors[para.id] ?? []}
          focused={focusedParagraphId === para.id}
          index={idx}
          startLine={paragraphStartLines[para.id] ?? 1}
          lineMeta={lineMetaByParagraph[para.id] ?? []}
          activeLineIndex={activeLine?.paragraphId === para.id ? activeLine.lineIndex : null}
          hoveredRhymeKey={hoveredRhymeKey}
          onTextChange={(txt) => handleTextChange(para.id, txt)}
          onFocus={() => (focusedParagraphId = para.id)}
          onCursorChange={(info) => {
            cursorInfo = info;
            focusedParagraphId = info.paragraphId;
          }}
          onManualAnchorsChange={(manual) => handleManualAnchorsChange(para.id, manual)}
          onDelete={() => deleteParagraph(para.id)}
          onHoverRhymeKey={(k) => (hoveredRhymeKey = k)}
        />
      {/each}

      <div class="p-5 text-center">
        <button
          class="rounded-md border border-dashed border-zinc-300 bg-transparent px-5 py-2 text-xs text-zinc-500 hover:border-amber-400 hover:text-amber-600 dark:border-zinc-700 dark:hover:border-amber-600 dark:hover:text-amber-400"
          onclick={addParagraph}
        >
          + {t('新段落', 'New paragraph')}
        </button>
      </div>
    </section>

    <aside class="min-w-0 bg-zinc-50 dark:bg-zinc-950">
      <div class="sticky top-[52px] max-h-[calc(100vh-52px)] overflow-y-auto">
        <section class="border-b border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t('当前行助手', 'Current Line')}</h2>
            {#if activeTarget}
              <span class="rounded-full px-2 py-0.5 text-[10px] font-medium {stateClass(activeTarget.state)}">
                {stateLabel(activeTarget.state)}
              </span>
            {/if}
          </div>

          {#if activeLine}
            <div class="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p class="mb-1 font-mono text-[10px] text-zinc-400">L{activeLine.absIndex}</p>
              <p class="text-sm leading-6 text-zinc-900 dark:text-zinc-100">
                {activeLine.text || t('这一行还空着。', 'This line is empty.')}
              </p>
            </div>
          {/if}

          {#if activeTarget}
            {@const payload = syllablePayload(activeTarget.anchor.text)}
            <div class="mt-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-[11px] text-zinc-500">
                    {activeTarget.role
                      ? t(`${activeTarget.role} 组目标韵`, `${activeTarget.role} target`)
                      : t('当前韵脚', 'Current target')}
                    · L{activeTarget.seedLine.absIndex}
                  </p>
                  <p class="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-100">{activeTarget.anchor.text}</p>
                  <p class="font-mono text-[11px] text-zinc-400">{payload.pinyin}</p>
                </div>
                <div class="flex flex-wrap justify-end gap-1 font-mono text-[10px]">
                  {#each payload.finals as final}
                    <span class="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">{final}</span>
                  {/each}
                </div>
              </div>
              {#if activeTarget.currentAnchor && activeTarget.currentAnchor.id !== activeTarget.anchor.id}
                <p class="mt-2 text-[11px] text-zinc-500">
                  {t('本行尾韵：', 'Line tail:')}
                  <span class="font-semibold text-zinc-700 dark:text-zinc-200">{activeTarget.currentAnchor.text}</span>
                </p>
              {/if}
            </div>
          {:else}
            <p class="mt-3 rounded-md border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-400 dark:border-zinc-700">
              {t('在左侧写两三个中文字符，这里会开始给押韵建议。', 'Write a few Chinese characters on the left to start rhyme suggestions.')}
            </p>
          {/if}
        </section>

        <section class="border-b border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div class="mb-3 flex items-baseline justify-between gap-2">
            <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t('可写入候选', 'Insertable Suggestions')}</h2>
            <span class="text-[10px] text-zinc-400">
              {#if assistantSearching}
                {t('搜索中…', 'Searching…')}
              {:else if suggestions.length > 0}
                {suggestions.length}
              {/if}
            </span>
          </div>

          {#if !searchClient.isReady}
            <p class="rounded-md bg-zinc-100 p-3 text-xs text-zinc-500 dark:bg-zinc-900">
              {t(`词库加载中… ${searchClient.phrasesLoaded.toLocaleString()} 条`, `Loading corpus… ${searchClient.phrasesLoaded.toLocaleString()}`)}
            </p>
          {:else if suggestions.length === 0}
            <p class="rounded-md bg-zinc-100 p-3 text-xs text-zinc-500 dark:bg-zinc-900">
              {activeTarget
                ? t('当前过滤条件下没有候选，试试放宽级别或切换候选风格。', 'No suggestions under these filters. Try relaxing level or switching style.')
                : t('暂无可用目标韵脚。', 'No target rhyme yet.')}
            </p>
          {:else}
            <div class="grid gap-1.5">
              {#each suggestions.slice(0, 28) as suggestion, i (suggestion.hit.text + suggestion.level)}
                {@const meta = sourceMeta(suggestion.hit.source)}
                <button
                  class="group rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-left transition hover:border-sky-300 hover:bg-sky-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-sky-700 dark:hover:bg-sky-950/30"
                  onclick={() => insertSuggestion(suggestion)}
                  title={t('点击插入到光标处', 'Click to insert at cursor')}
                >
                  <div class="flex items-baseline justify-between gap-2">
                    <span class="text-sm font-medium text-zinc-900 group-hover:text-sky-800 dark:text-zinc-100 dark:group-hover:text-sky-200">
                      {suggestion.hit.text}
                    </span>
                    <span class="flex shrink-0 items-center gap-1">
                      {#if i === tabCycleIndex % Math.max(1, suggestions.length) && i < 8}
                        <span class="rounded bg-zinc-900 px-1 py-0.5 font-mono text-[9px] text-white dark:bg-zinc-100 dark:text-zinc-900">Tab</span>
                      {/if}
                      <span class="rounded px-1 py-0.5 text-[9px] {meta.badgeCls}">
                        {lang.current === 'zh' ? meta.zh : meta.en}
                      </span>
                      <span class="font-mono text-[10px] text-zinc-400">L{suggestion.level}</span>
                    </span>
                  </div>
                  {#if suggestion.hit.pinyin.length > 0}
                    <p class="mt-0.5 truncate font-mono text-[10px] text-zinc-400">
                      {suggestion.hit.pinyin.join(' ')}
                    </p>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </section>

        <section class="border-b border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div class="mb-3 flex items-baseline justify-between gap-2">
            <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t('韵脚地图', 'Rhyme Map')}</h2>
            <span class="text-[10px] text-zinc-400">{rhymeMapGroups.length}</span>
          </div>
          {#if rhymeMapGroups.length === 0}
            <p class="text-xs text-zinc-400">{t('开始写以后，这里会按颜色汇总每组韵脚。', 'Once you write, rhymes are grouped here by color.')}</p>
          {:else}
            <div class="space-y-2">
              {#each rhymeMapGroups as group (group.key)}
                {@const color = rhymeColor(group.colorIdx)}
                <div
                  class="rounded-md border p-2"
                  style="border-color: {color.border}; background: {color.bg};"
                >
                  <div class="mb-1 flex items-center justify-between">
                    <span class="font-mono text-[10px] text-zinc-500">{group.key}</span>
                    <span class="text-[10px] text-zinc-500">{group.anchors.length} {t('行', 'lines')}</span>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    {#each group.anchors as a}
                      <span class="rounded bg-white/70 px-1.5 py-0.5 text-[11px] text-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-200">
                        L{a.line} · {a.text}
                      </span>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>

        <section class="bg-white p-4 dark:bg-zinc-950">
          <h2 class="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t('键盘流', 'Keyboard Flow')}</h2>
          <div class="grid gap-1.5 text-[11px] text-zinc-500">
            <p><span class="rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">Tab</span> {t('插入当前首选候选，连按循环前 8 个', 'insert the top suggestion, cycle through the first 8')}</p>
            <p><span class="rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">Esc</span> {t('重置 Tab 循环', 'reset Tab cycle')}</p>
            <p>{t('点击候选会插入到当前光标处；选中中文片段可加入句中韵脚。', 'Click a suggestion to insert at cursor; select Chinese text to add an internal anchor.')}</p>
          </div>
        </section>
      </div>
    </aside>
  </main>
</div>

<DraftsPanel
  open={draftsOpen}
  onClose={() => (draftsOpen = false)}
  onSelect={handleSelectDraft}
  onCreate={handleCreateDraft}
/>
