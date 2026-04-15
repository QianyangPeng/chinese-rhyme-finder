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
