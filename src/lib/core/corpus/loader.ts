/**
 * Build a `Lexicon` from raw seed data (or, in future phases, from a
 * decoded binary file).
 *
 * The loader is responsible for:
 *   - Parsing each entry's text into syllables (only at load, never per-query)
 *   - Filtering out entries that didn't yield any Chinese syllables
 *   - Filtering out entries with unrecognized finals (defensive)
 *   - Deduplicating identical text entries
 *   - Building the `byLength` index
 */

import { parseSyllables } from '../pinyin/parser.js';
import type { Lexicon, PhraseRecord } from './types.js';
import { SEED_PHRASES, type SeedPhrase } from './seed-data.js';

const DEFAULT_QUALITY = 0.8;
const DEFAULT_SOURCE = 'seed-v1';

/** Build a Lexicon from a list of seed entries. Each entry is parsed
 *  through the pinyin pipeline; entries that don't produce any
 *  syllables (or whose syllables include unknown finals) are dropped. */
export function buildLexicon(seeds: readonly SeedPhrase[] = SEED_PHRASES): Lexicon {
  const records: PhraseRecord[] = [];
  const seen = new Set<string>();

  for (const seed of seeds) {
    const trimmed = seed.text.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);

    const syllables = parseSyllables(trimmed);
    if (syllables.length === 0) continue;

    const finals = syllables.map((s) => s.final);
    if (finals.some((f) => !f)) continue;

    records.push({
      text: trimmed,
      length: syllables.length,
      finals,
      tones: syllables.map((s) => s.tone),
      pinyinWithTone: syllables.map((s) => s.pinyinWithTone),
      quality: DEFAULT_QUALITY,
      tags: seed.tags,
      source: DEFAULT_SOURCE
    });
  }

  // Build length index
  const byLength = new Map<number, number[]>();
  for (let id = 0; id < records.length; id++) {
    const L = records[id].length;
    let bucket = byLength.get(L);
    if (!bucket) {
      bucket = [];
      byLength.set(L, bucket);
    }
    bucket.push(id);
  }

  return {
    phrases: records,
    byLength
  };
}

/** Lazily-built default lexicon (the seed). Imported by Search to avoid
 *  rebuilding on every query. */
let _defaultLexicon: Lexicon | null = null;
export function getDefaultLexicon(): Lexicon {
  if (!_defaultLexicon) _defaultLexicon = buildLexicon();
  return _defaultLexicon;
}

// ─── Extended lexicon (fetched from static/data/lexicon.json) ──────────

/**
 * Extended lexicon: merges the in-bundle seed (~800 entries) with the
 * big prebuilt lexicon fetched from `/data/lexicon.json` (~30k entries
 * from the xinhua idioms dataset, generated offline via
 * `scripts/build_lexicon.mjs`).
 *
 * The fetch is kicked off on first call and cached module-side; repeat
 * callers await the same in-flight promise or get the cached result.
 * If the fetch fails (network issue, file missing), we fall back to
 * the seed lexicon silently — the app stays usable with the smaller
 * corpus rather than showing an error.
 */

/** Build a Lexicon directly from an already-scored, finals-enriched
 *  phrase list (the shape emitted by scripts/build_lexicon.mjs). */
function lexiconFromRecords(records: readonly PhraseRecord[]): Lexicon {
  const byLength = new Map<number, number[]>();
  for (let id = 0; id < records.length; id++) {
    const L = records[id].length;
    let bucket = byLength.get(L);
    if (!bucket) {
      bucket = [];
      byLength.set(L, bucket);
    }
    bucket.push(id);
  }
  return { phrases: records, byLength };
}

/** Merge seed + fetched records. Seed records win on duplicates since
 *  their curated tags (scifi/lyric/modern/cultural) are richer than the
 *  blanket "idiom/xinhua" tags the big dataset carries. */
function mergeRecords(
  seed: readonly PhraseRecord[],
  fetched: readonly PhraseRecord[]
): PhraseRecord[] {
  const byText = new Map<string, PhraseRecord>();
  for (const p of seed) byText.set(p.text, p);
  for (const p of fetched) {
    if (!byText.has(p.text)) byText.set(p.text, p);
  }
  return Array.from(byText.values());
}

interface ExtendedDoc {
  version: number;
  count: number;
  phrases: RawLexiconEntry[];
}

/** The on-disk JSON shape emitted by the Python pipeline. We normalize
 *  it to PhraseRecord at load time (see `normalizeEntry`). v3+ uses
 *  `rhymeKeys` and `syllables`; legacy v2 used `finals` and
 *  `pinyinWithTone` — both are accepted. */
interface RawLexiconEntry {
  text: string;
  language?: 'zh' | 'en' | 'ja' | 'ko';
  length: number;
  // v3 canonical names:
  rhymeKeys?: string[];
  syllables?: string[];
  segments?: { text: string; pos: string }[];
  // v2 legacy names (still accepted):
  finals?: string[];
  pinyinWithTone?: string[];
  tones?: number[];
  stress?: number[];
  quality: number;
  tags: string[];
  source: string;
}

/** Map the on-disk JSON shape to PhraseRecord, handling both v2 and v3. */
function normalizeEntry(raw: RawLexiconEntry): PhraseRecord {
  const finals = raw.rhymeKeys ?? raw.finals ?? [];
  const pinyinWithTone = raw.syllables ?? raw.pinyinWithTone;
  return {
    text: raw.text,
    language: raw.language ?? 'zh',
    length: raw.length,
    finals,
    tones: raw.tones,
    stress: raw.stress,
    pinyinWithTone,
    segments: raw.segments,
    quality: raw.quality,
    tags: raw.tags,
    source: raw.source
  };
}

// ─── Incremental per-source loading ───────────────────────────────
//
// Instead of one monolithic lexicon.json, we load each source as a
// separate JSON file in parallel. Smaller files (成語 2MB) arrive
// first and render immediately; larger files (pop lyrics 50MB) arrive
// later and progressively enhance the results.

/** Per-source file manifest. Ordered by expected load speed (small first). */
const SOURCE_FILES = [
  'xinhua-idiom.json',
  'xinhua-xiehouyu.json',
  'wiktionary-slang.json',
  'chinese-poetry-tang.json',
  'chinese-poetry-song.json',
  'lyrics-hiphop.json',
  'opensubtitles-zh.json',
  'lyrics-pop.json',         // largest — arrives last
] as const;

let _allRecords: PhraseRecord[] = [];
let _seenTexts = new Set<string>();
let _currentLexicon: Lexicon | null = null;
let _loadStarted = false;

/** Callbacks registered by pages that want to re-render on each source load. */
const _onUpdateCallbacks: Array<(lex: Lexicon) => void> = [];

function _rebuildLexicon(): Lexicon {
  _currentLexicon = lexiconFromRecords(_allRecords);
  return _currentLexicon;
}

function _mergeNewPhrases(phrases: PhraseRecord[]): void {
  for (const p of phrases) {
    if (!_seenTexts.has(p.text)) {
      _seenTexts.add(p.text);
      _allRecords.push(p);
    }
  }
}

/**
 * Start loading all source files in parallel. Each file that arrives
 * triggers a merge + rebuild + notify cycle. Pages call `onLexiconUpdate`
 * to register for incremental notifications.
 *
 * Debounces rebuilds: if multiple sources arrive within 200ms, only
 * one rebuild fires.
 */
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

function _notifyUpdate(): void {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    const lex = _rebuildLexicon();
    for (const cb of _onUpdateCallbacks) cb(lex);
  }, 200);
}

export function ensureExtendedLexicon(baseUrl = ''): Promise<Lexicon> {
  if (_loadStarted) return Promise.resolve(getCurrentLexicon());
  _loadStarted = true;

  // Start with seed records.
  const seedLex = getDefaultLexicon();
  _mergeNewPhrases([...seedLex.phrases]);
  _rebuildLexicon();

  // Try per-source files first. If any fails, fall back to monolithic.
  const perSourcePromises = SOURCE_FILES.map((file) =>
    fetch(`${baseUrl}/data/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ExtendedDoc>;
      })
      .then((doc) => {
        if (!doc || !Array.isArray(doc.phrases)) return;
        const normalized = doc.phrases.map(normalizeEntry);
        _mergeNewPhrases(normalized);
        _notifyUpdate();
      })
      .catch(() => {
        // Individual source failed — silently skip.
      })
  );

  // Also try the monolithic file as fallback (for backward compat).
  const monoPromise = fetch(`${baseUrl}/data/lexicon.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<ExtendedDoc>;
    })
    .then((doc) => {
      if (!doc || !Array.isArray(doc.phrases)) return;
      const normalized = doc.phrases.map(normalizeEntry);
      _mergeNewPhrases(normalized);
      _notifyUpdate();
    })
    .catch(() => {
      // Monolithic file also missing — stick with whatever per-source loaded.
    });

  return Promise.allSettled([...perSourcePromises, monoPromise]).then(
    () => getCurrentLexicon()
  );
}

/**
 * Register a callback that fires every time a new source finishes loading.
 * Returns an unsubscribe function.
 */
export function onLexiconUpdate(cb: (lex: Lexicon) => void): () => void {
  _onUpdateCallbacks.push(cb);
  return () => {
    const idx = _onUpdateCallbacks.indexOf(cb);
    if (idx >= 0) _onUpdateCallbacks.splice(idx, 1);
  };
}

/** Synchronous peek: returns whatever's loaded so far. */
export function getCurrentLexicon(): Lexicon {
  return _currentLexicon ?? getDefaultLexicon();
}
