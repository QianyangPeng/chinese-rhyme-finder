/**
 * Search Web Worker — owns the lexicon + all search computation.
 *
 * The main thread keeps zero lexicon data. On worker start:
 *   1. Fetches manifest.json + all chunk files
 *   2. Builds the indexes (byLength, byLastFinalKey) as phrases merge in
 *   3. Sends `progress` messages so the UI can show a loading state
 *   4. Sends `ready` when the full lexicon is available
 *
 * For each search request from main thread:
 *   - Runs searchByFinals with the existing algorithm
 *   - Groups results by tail text (formerly done in the page)
 *   - Returns a compact result: just the data the UI renders,
 *     NOT the whole SearchHit objects with their phrase records
 *
 * Result: main thread is never blocked. Typing, scrolling, clicking
 * chips — all instant. Only the worker thread ever sees the 800k
 * phrase data.
 */

import { searchByFinals } from '$lib/core/corpus/search';
import { strictScheme } from '$lib/core/rhyme/schemes/strict';
import type { Lexicon, PhraseRecord } from '$lib/core/corpus/types';

// ── Outgoing message shapes ──────────────────────────────────────
export type WorkerMessage =
  | { type: 'progress'; phrasesLoaded: number; sourceLoaded: string }
  | {
      type: 'ready';
      totalPhrases: number;
      /** 2–4 char texts from dictionary-like sources. Used by /write
       *  page for auto-anchor maximal-match (which runs on main
       *  thread). Sent once on ready so main never touches the full
       *  lexicon. ~130k strings, single-digit MB structured-clone. */
      dictTexts: string[];
    }
  | { type: 'result'; id: number; result: GroupedSearchResult }
  | { type: 'error'; id?: number; message: string };

export interface GroupedSearchResult {
  targetLength: number;
  totalHits: number;
  levels: LevelGroups[];
}

export interface LevelGroups {
  level: number;
  totalHits: number;
  groups: TailGroup[];
}

export interface TailGroup {
  tailText: string;
  tailChars: string[];
  perPosition: boolean[];
  properNounCount: number;
  /** Total number of hits that fell into this group, including any
   *  not present in `hits` because of the per-group cap. */
  totalCount: number;
  /** At most MAX_HITS_PER_GROUP members, sorted by quality desc then
   *  by non-proper-noun first then alphabetical. Rest are counted in
   *  `totalCount` but not shipped across the worker boundary (keeps
   *  the structured-clone payload tiny so postMessage returns fast). */
  hits: GroupHit[];
}

export interface GroupHit {
  text: string;
  source: string;
  quality: number;
  phraseLen: number;
  matchOffset: number;
  finals: string[];
  /** Pinyin syllables (with tone digit) aligned to the CJK chars of `text`. */
  pinyin: string[];
  tags: string[];
  properNoun: boolean;
}

// ── Incoming message shapes ──────────────────────────────────────
export type IncomingMessage =
  | { type: 'init'; baseUrl: string }
  | {
      type: 'search';
      id: number;
      target: string[];
      targetTones?: number[];
      excludeText?: string;
      toneMode: 'none' | 'exact';
      requireTailMatch: boolean;
      windowMode: 'tail' | 'anywhere';
      /** Optional: only include hits whose source is in this list.
       *  Omitted or empty = include all. */
      enabledSources?: string[];
    };

// ── Worker-local state ───────────────────────────────────────────
const _allRecords: PhraseRecord[] = [];
const _seenTexts = new Set<string>();
const _byLength = new Map<number, number[]>();
const _byLastFinalKey = new Map<string, number[]>();

/** Current lexicon view — rebuilt cheaply (O(1)) whenever callers ask. */
function currentLexicon(): Lexicon {
  return {
    phrases: _allRecords,
    byLength: _byLength,
    byLastFinalKey: _byLastFinalKey
  };
}

function mergePhrases(phrases: PhraseRecord[]): void {
  for (const p of phrases) {
    if (_seenTexts.has(p.text)) continue;
    _seenTexts.add(p.text);
    const id = _allRecords.length;
    _allRecords.push(p);
    // byLength
    let lb = _byLength.get(p.length);
    if (!lb) { lb = []; _byLength.set(p.length, lb); }
    lb.push(id);
    // byLastFinalKey
    if (p.finals.length > 0) {
      const lastKey = strictScheme.keyOf(p.finals[p.finals.length - 1]);
      if (lastKey) {
        let kb = _byLastFinalKey.get(lastKey);
        if (!kb) { kb = []; _byLastFinalKey.set(lastKey, kb); }
        kb.push(id);
      }
    }
  }
}

interface RawEntry {
  text: string;
  language?: string;
  length: number;
  rhymeKeys?: string[];
  syllables?: string[];
  segments?: { text: string; pos: string }[];
  finals?: string[];
  pinyinWithTone?: string[];
  tones?: number[];
  quality: number;
  tags: string[];
  source: string;
}

function normalizeEntry(raw: RawEntry): PhraseRecord {
  const finals = raw.rhymeKeys ?? raw.finals ?? [];
  const pinyinWithTone = raw.syllables ?? raw.pinyinWithTone;
  return {
    text: raw.text,
    language: (raw.language as 'zh' | 'en' | 'ja' | 'ko' | undefined) ?? 'zh',
    length: raw.length,
    finals,
    tones: raw.tones,
    pinyinWithTone,
    segments: raw.segments,
    quality: raw.quality,
    tags: raw.tags,
    source: raw.source
  };
}

// ── Lexicon loader (in-worker) ───────────────────────────────────
async function loadLexicon(baseUrl: string): Promise<void> {
  let files: string[] = [
    'xinhua-idiom.json', 'xinhua-xiehouyu.json', 'wiktionary-slang.json',
    'chinese-poetry-tang.json', 'chinese-poetry-song.json',
    'lyrics-hiphop.json', 'opensubtitles-zh.json',
    'lyrics-pop.json', 'moegirl-acg.json'
  ];
  try {
    const res = await fetch(`${baseUrl}/data/manifest.json`);
    if (res.ok) {
      const manifest = await res.json();
      if (Array.isArray(manifest)) {
        files = manifest.map((m: { file: string }) => m.file);
      }
    }
  } catch {
    // use fallback
  }

  // Fetch all files in parallel. Each resolution merges + sends progress.
  await Promise.allSettled(files.map(async (file) => {
    try {
      const r = await fetch(`${baseUrl}/data/${file}`);
      if (!r.ok) return;
      const doc = await r.json();
      if (!doc || !Array.isArray(doc.phrases)) return;
      const normalized = (doc.phrases as RawEntry[]).map(normalizeEntry);
      mergePhrases(normalized);
      const msg: WorkerMessage = {
        type: 'progress',
        phrasesLoaded: _allRecords.length,
        sourceLoaded: file
      };
      postMessage(msg);
    } catch {
      // single file fail — skip
    }
  }));

  // Build the dictionary text set for /write page's auto-anchor
  // detection. Main thread only needs these texts, not full records.
  const DICT_SOURCES = new Set([
    'cedict', 'xinhua-idiom', 'xinhua-xiehouyu', 'wiktionary-slang'
  ]);
  const dictTexts: string[] = [];
  for (const p of _allRecords) {
    if (p.length < 2 || p.length > 4) continue;
    if (!DICT_SOURCES.has(p.source)) continue;
    dictTexts.push(p.text);
  }

  const ready: WorkerMessage = {
    type: 'ready',
    totalPhrases: _allRecords.length,
    dictTexts
  };
  postMessage(ready);
}

// ── Search + group ───────────────────────────────────────────────
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

function isProper(p: PhraseRecord): boolean {
  const segs = p.segments;
  if (!segs || segs.length === 0) return false;
  for (const s of segs) {
    const pos = s.pos ?? '';
    if (pos.startsWith('nr') || pos === 'ns' || pos === 'nt' || pos === 'nz') return true;
  }
  return false;
}

/** Max hits per group shipped to main thread. Keeps postMessage
 *  structured-clone payload small (~thousands of objects, not tens of
 *  thousands). Users who want to browse more than 30 entries in a single
 *  tail group would click a future "expand all" button that re-queries. */
const MAX_HITS_PER_GROUP = 30;

function runSearch(msg: Extract<IncomingMessage, { type: 'search' }>): GroupedSearchResult {
  const lex = currentLexicon();
  const result = searchByFinals(msg.target, strictScheme, lex, {
    excludeText: msg.excludeText,
    maxPerBucket: Number.POSITIVE_INFINITY,
    toneMode: msg.toneMode,
    targetTones: msg.targetTones,
    requireTailMatch: msg.requireTailMatch,
    windowMode: msg.windowMode
  });

  // Optional per-source filter (applied before grouping to skip work).
  const enabledSet = msg.enabledSources && msg.enabledSources.length > 0
    ? new Set(msg.enabledSources)
    : null;

  // Group each bucket by (tailText + perPosition pattern).
  const levels: LevelGroups[] = result.buckets.map((bucket) => {
    const byKey = new Map<string, { g: TailGroup; all: GroupHit[] }>();
    for (const hit of bucket.hits) {
      if (enabledSet && !enabledSet.has(hit.phrase.source)) continue;
      const tailText = hit.tailText;
      let perKey = '';
      const per = hit.match.perPosition;
      for (let i = 0; i < per.length; i++) perKey += per[i] ? '1' : '0';
      const key = tailText + '#' + perKey;
      let entry = byKey.get(key);
      if (!entry) {
        const g: TailGroup = {
          tailText,
          tailChars: [...tailText],
          perPosition: per as boolean[],
          properNounCount: 0,
          totalCount: 0,
          hits: []
        };
        entry = { g, all: [] };
        byKey.set(key, entry);
      }
      const proper = isProper(hit.phrase);
      entry.all.push({
        text: hit.phrase.text,
        source: hit.phrase.source,
        quality: hit.phrase.quality,
        phraseLen: hit.phrase.length,
        matchOffset: hit.matchOffset,
        finals: hit.phrase.finals as string[],
        pinyin: (hit.phrase.pinyinWithTone ?? []) as string[],
        tags: hit.phrase.tags as string[],
        properNoun: proper
      });
      entry.g.totalCount++;
      if (proper) entry.g.properNounCount++;
    }
    // For each group, sort its hits and keep only the top N so the
    // structured-clone of the whole result stays small.
    for (const entry of byKey.values()) {
      entry.all.sort((a, b) => {
        if (a.properNoun !== b.properNoun) return a.properNoun ? 1 : -1;
        if (b.quality !== a.quality) return b.quality - a.quality;
        return a.text.localeCompare(b.text, 'zh-Hans');
      });
      entry.g.hits = entry.all.slice(0, MAX_HITS_PER_GROUP);
    }
    const groups = [...byKey.values()].map(e => e.g).sort((a, b) => {
      if (a.totalCount !== b.totalCount) return b.totalCount - a.totalCount;
      const aR = a.properNounCount / a.totalCount;
      const bR = b.properNounCount / b.totalCount;
      if (aR !== bR) return aR - bR;
      return a.tailText.localeCompare(b.tailText, 'zh-Hans');
    });
    // Recount after source filtering.
    let levelTotal = 0;
    for (const g of groups) levelTotal += g.totalCount;
    return { level: bucket.level, totalHits: levelTotal, groups };
  });
  const filteredTotal = levels.reduce((s, l) => s + l.totalHits, 0);

  return {
    targetLength: result.targetLength,
    totalHits: filteredTotal,
    levels
  };
}

// ── Worker message dispatch ──────────────────────────────────────
self.onmessage = (ev: MessageEvent<IncomingMessage>) => {
  const data = ev.data;
  try {
    if (data.type === 'init') {
      loadLexicon(data.baseUrl);
    } else if (data.type === 'search') {
      const result = runSearch(data);
      const reply: WorkerMessage = { type: 'result', id: data.id, result };
      postMessage(reply);
    }
  } catch (err) {
    const e: WorkerMessage = {
      type: 'error',
      id: (data as { id?: number }).id,
      message: err instanceof Error ? err.message : String(err)
    };
    postMessage(e);
  }
};
