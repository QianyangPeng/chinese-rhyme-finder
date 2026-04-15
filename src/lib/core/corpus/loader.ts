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
  phrases: PhraseRecord[];
}

let _extendedLexicon: Lexicon | null = null;
let _extendedPromise: Promise<Lexicon> | null = null;

/**
 * Get the extended lexicon (seed + xinhua idioms). Asynchronous on
 * first call; subsequent calls resolve immediately from cache.
 *
 * `baseUrl` should be SvelteKit's `base` path (e.g., '/chinese-rhyme-finder'
 * on GitHub Pages, '' in dev). Fetch uses `${baseUrl}/data/lexicon.json`.
 */
export function ensureExtendedLexicon(baseUrl = ''): Promise<Lexicon> {
  if (_extendedLexicon) return Promise.resolve(_extendedLexicon);
  if (_extendedPromise) return _extendedPromise;

  _extendedPromise = (async () => {
    const seedLex = getDefaultLexicon();
    try {
      const res = await fetch(`${baseUrl}/data/lexicon.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const doc = (await res.json()) as ExtendedDoc;
      if (!doc || !Array.isArray(doc.phrases)) throw new Error('malformed doc');
      const merged = mergeRecords(seedLex.phrases, doc.phrases);
      _extendedLexicon = lexiconFromRecords(merged);
    } catch (err) {
      // Fall back to seed-only — app stays functional.
      if (typeof console !== 'undefined') {
        console.warn('[corpus] extended lexicon fetch failed; using seed only.', err);
      }
      _extendedLexicon = seedLex;
    }
    return _extendedLexicon;
  })();
  return _extendedPromise;
}

/** Synchronous peek: returns the extended lexicon IF it's already been
 *  loaded, else the seed. Useful for pages that want to start rendering
 *  immediately with whatever's available. */
export function getCurrentLexicon(): Lexicon {
  return _extendedLexicon ?? getDefaultLexicon();
}
