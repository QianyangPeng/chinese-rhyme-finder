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
import { strictScheme } from '../rhyme/schemes/strict.js';
import type { Lexicon, PhraseRecord } from './types.js';
import { SEED_PHRASES, type SeedPhrase } from './seed-data.js';

/** Build the per-phrase indexes used by search: byLength + byLastFinalKey.
 *  Extracted so both `buildLexicon` (seed path) and `lexiconFromRecords`
 *  (streaming-merge path) share one implementation. */
function buildIndexes(records: readonly PhraseRecord[]): {
  byLength: Map<number, number[]>;
  byLastFinalKey: Map<string, number[]>;
} {
  const byLength = new Map<number, number[]>();
  const byLastFinalKey = new Map<string, number[]>();
  for (let id = 0; id < records.length; id++) {
    const p = records[id];
    // byLength
    let lb = byLength.get(p.length);
    if (!lb) { lb = []; byLength.set(p.length, lb); }
    lb.push(id);
    // byLastFinalKey — strictScheme is the only UI scheme, so we bake
    // its keyOf into the index. Keys like "a" catch final "a"/"ua"/"ia"
    // together (all medial-stripped to body "a"), which matches how
    // requireTailMatch=true evaluates at search time.
    if (p.finals.length > 0) {
      const lastFinal = p.finals[p.finals.length - 1];
      const lastKey = strictScheme.keyOf(lastFinal);
      if (lastKey) {
        let kb = byLastFinalKey.get(lastKey);
        if (!kb) { kb = []; byLastFinalKey.set(lastKey, kb); }
        kb.push(id);
      }
    }
  }
  return { byLength, byLastFinalKey };
}

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

  const { byLength, byLastFinalKey } = buildIndexes(records);
  return { phrases: records, byLength, byLastFinalKey };
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
  const { byLength, byLastFinalKey } = buildIndexes(records);
  return { phrases: records, byLength, byLastFinalKey };
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

/**
 * Source files are listed in manifest.json (generated by split_lexicon.py).
 * The manifest is fetched first, then each file is fetched in parallel.
 * Large sources are chunked into multiple files (~6MB each) for
 * incremental loading — each chunk arrives and renders independently.
 *
 * Fallback: if manifest.json is missing, try the hardcoded list.
 */
const FALLBACK_SOURCE_FILES = [
  'xinhua-idiom.json',
  'xinhua-xiehouyu.json',
  'wiktionary-slang.json',
  'chinese-poetry-tang.json',
  'chinese-poetry-song.json',
  'lyrics-hiphop.json',
  'opensubtitles-zh.json',
  'lyrics-pop.json',
  'moegirl-acg.json',
];

let _allRecords: PhraseRecord[] = [];
let _seenTexts = new Set<string>();
/** Indexes are maintained incrementally in `_mergeNewPhrases` so the
 *  lexicon "rebuild" is O(1) (just packages references into a new
 *  Lexicon object) — critical during streaming load where files arrive
 *  every 10-200ms. A full O(N) rebuild on each notify would be
 *  quadratic over the load. */
let _byLength = new Map<number, number[]>();
let _byLastFinalKey = new Map<string, number[]>();
let _currentLexicon: Lexicon | null = null;

/** Callbacks registered by pages that want to re-render on each source load. */
const _onUpdateCallbacks: Array<(lex: Lexicon) => void> = [];

/** Assemble a Lexicon view pointing at the current indexes. O(1) —
 *  does not recompute indexes, they're kept live by _mergeNewPhrases. */
function _rebuildLexicon(): Lexicon {
  _currentLexicon = {
    phrases: _allRecords,
    byLength: _byLength,
    byLastFinalKey: _byLastFinalKey
  };
  return _currentLexicon;
}

function _mergeNewPhrases(phrases: PhraseRecord[]): void {
  for (const p of phrases) {
    if (_seenTexts.has(p.text)) continue;
    _seenTexts.add(p.text);
    const id = _allRecords.length;
    _allRecords.push(p);
    // Keep indexes in sync as we go — avoids the full-rebuild cost.
    let lb = _byLength.get(p.length);
    if (!lb) { lb = []; _byLength.set(p.length, lb); }
    lb.push(id);
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

/**
 * Start loading all source files in parallel. Each arrival merges its
 * phrases into the indexes. Subscriber callbacks (`onLexiconUpdate`)
 * fire at most every `THROTTLE_MS` during load and once more at the
 * very end with the final lexicon. Aggressive throttling prevents
 * the expensive downstream work (search + group + render) from
 * running dozens of times during a multi-file streaming load.
 */
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _lastNotifyMs = 0;
/** During load, only fire subscriber callbacks at most every 2.5s.
 *  That's still 5-6 progressive updates on a typical 15s load, plus
 *  one final update when everything's in. Keeps the UI responsive
 *  by leaving breathing room between expensive search+render cycles. */
const NOTIFY_THROTTLE_MS = 2500;

function _notifyUpdate(): void {
  const now = Date.now();
  const sinceLast = now - _lastNotifyMs;
  if (_debounceTimer) clearTimeout(_debounceTimer);
  // If we notified recently, delay the next fire. Otherwise fire soon.
  const delay = sinceLast < NOTIFY_THROTTLE_MS
    ? NOTIFY_THROTTLE_MS - sinceLast
    : 200;
  _debounceTimer = setTimeout(() => {
    _lastNotifyMs = Date.now();
    const lex = _rebuildLexicon();
    for (const cb of _onUpdateCallbacks) cb(lex);
  }, delay);
}

/** Fetch + merge a single source file. */
function _loadSourceFile(baseUrl: string, file: string): Promise<void> {
  return fetch(`${baseUrl}/data/${file}`)
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
      // Individual file failed — silently skip.
    });
}

let _loadPromise: Promise<Lexicon> | null = null;

export function ensureExtendedLexicon(baseUrl = ''): Promise<Lexicon> {
  if (_loadPromise) return _loadPromise;

  // Start with seed records.
  const seedLex = getDefaultLexicon();
  _mergeNewPhrases([...seedLex.phrases]);
  _rebuildLexicon();

  _loadPromise = (async () => {
    // Try manifest.json first — it lists all available files (including
    // chunked large sources).
    let files: string[] = FALLBACK_SOURCE_FILES;
    try {
      const res = await fetch(`${baseUrl}/data/manifest.json`);
      if (res.ok) {
        const manifest = await res.json();
        if (Array.isArray(manifest)) {
          files = manifest.map((m: { file: string }) => m.file);
        }
      }
    } catch {
      // Manifest missing — use fallback list.
    }

    // Fetch all files in parallel. Each arrival triggers incremental
    // merge + notify. Smaller files arrive first naturally.
    await Promise.allSettled(files.map((f) => _loadSourceFile(baseUrl, f)));

    // CRITICAL: flush any pending debounce and force a final rebuild.
    //
    // Without this, the returned Lexicon is a stale reference — its
    // `phrases` array has grown in place (because _mergeNewPhrases
    // mutates _allRecords), but its `byLength` index was built when
    // only the seed was loaded. searchByFinals iterates byLength, so
    // it would only see 800 phrases out of 804k. (The UI badge reads
    // .phrases.length which shows the full count, masking the bug.)
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
    }
    const finalLex = _rebuildLexicon();
    for (const cb of _onUpdateCallbacks) cb(finalLex);
    return finalLex;
  })();

  return _loadPromise;
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
