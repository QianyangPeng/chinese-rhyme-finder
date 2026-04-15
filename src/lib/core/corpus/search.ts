/**
 * Search the lexicon for phrases that rhyme with a target final
 * sequence, bucketed by graded relaxation level.
 *
 * Phase 1 implements only the "direct match" strategy: candidates are
 * phrases of the same syllable length, scored by how many positions
 * agree under the active scheme. Phase 1.5 will add 2+2 splicing and
 * template fill on top of this same `Lexicon`.
 */

import type { Lexicon, PhraseRecord } from './types.js';
import type { RhymeScheme } from '../rhyme/types.js';
import { matchFull, type RhymeMatch } from '../rhyme/matcher.js';

export interface SearchHit {
  /** The matched phrase. */
  readonly phrase: PhraseRecord;
  /** Position-level match details against the target. */
  readonly match: RhymeMatch;
  /** 0 = strict full match, k = exactly k positions mismatched. */
  readonly level: number;
}

export interface SearchBucket {
  /** Mismatched-position count common to all hits in this bucket. */
  readonly level: number;
  /** Hits at this level, sorted by quality desc then text. */
  readonly hits: readonly SearchHit[];
}

export interface SearchResult {
  /** Length of the target final sequence — only same-length phrases are considered. */
  readonly targetLength: number;
  /** Buckets in level order. Empty bins are dropped. */
  readonly buckets: readonly SearchBucket[];
  /** Total hits across all buckets. */
  readonly totalHits: number;
}

export interface SearchOptions {
  /** Cap on hits returned per relaxation level. Default 50. */
  readonly maxPerBucket?: number;
  /** Cap on relaxation level to consider. Default = targetLength
   *  (i.e., everything down to "no positions match"). */
  readonly maxLevel?: number;
  /** Skip the input phrase itself when it appears in the lexicon. Default true. */
  readonly excludeText?: string;
}

const DEFAULT_MAX_PER_BUCKET = 50;

/**
 * Search the lexicon for phrases of the same length whose finals match
 * the target under `scheme`. Hits are bucketed by mismatch count
 * (relaxation level) — Level 0 = strict full rhyme, Level k = k-off.
 */
export function searchByFinals(
  target: readonly string[],
  scheme: RhymeScheme,
  lexicon: Lexicon,
  options: SearchOptions = {}
): SearchResult {
  const targetLength = target.length;
  const maxLevel = options.maxLevel ?? targetLength;
  const maxPerBucket = options.maxPerBucket ?? DEFAULT_MAX_PER_BUCKET;
  const excludeText = options.excludeText;

  // We only consider phrases of the same length under FULL mode.
  const candidateIds = lexicon.byLength.get(targetLength) ?? [];

  const buckets: Array<SearchHit[]> = Array.from(
    { length: targetLength + 1 },
    () => []
  );

  for (const id of candidateIds) {
    const phrase = lexicon.phrases[id];
    if (excludeText !== undefined && phrase.text === excludeText) continue;

    const match = matchFull(target, phrase.finals, scheme);
    if (!match) continue;
    if (match.relaxationLevel > maxLevel) continue;

    buckets[match.relaxationLevel].push({
      phrase,
      match,
      level: match.relaxationLevel
    });
  }

  const out: SearchBucket[] = [];
  let totalHits = 0;
  for (let level = 0; level < buckets.length; level++) {
    const bucket = buckets[level];
    if (bucket.length === 0) continue;

    // Sort: higher quality first, then alphabetical for stability.
    bucket.sort((a, b) => {
      if (b.phrase.quality !== a.phrase.quality) {
        return b.phrase.quality - a.phrase.quality;
      }
      return a.phrase.text.localeCompare(b.phrase.text, 'zh-Hans');
    });

    const trimmed = bucket.slice(0, maxPerBucket);
    totalHits += trimmed.length;
    out.push({ level, hits: trimmed });
  }

  return {
    targetLength,
    buckets: out,
    totalHits
  };
}
