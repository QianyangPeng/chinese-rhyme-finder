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
import { matchFullKeys, matchTailKeys, type RhymeMatch } from '../rhyme/matcher.js';
import { composeKey, type ToneMode } from '../rhyme/tone.js';

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
  /** Per-syllable tones for the target. Required only when toneMode ≠ 'none'. */
  readonly targetTones?: readonly number[];
  /** If set to 'exact' / 'pingze', search composes scheme keys that also
   *  encode the tone; a candidate must match tone in addition to韵母
   *  to count as rhyming at that position. Default 'none'. */
  readonly toneMode?: ToneMode;
  /** When true, only return candidates whose LAST syllable matches the
   *  target's last syllable (under the active scheme + toneMode). The
   *  relaxation count then counts how many NON-tail positions are off.
   *  Default **true** — matches the user expectation that an end rhyme
   *  is required for something to be called rhyme at all. */
  readonly requireTailMatch?: boolean;
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
  const toneMode: ToneMode = options.toneMode ?? 'none';
  const targetTones = options.targetTones;
  const requireTailMatch = options.requireTailMatch ?? true;

  // Pre-compose target keys with tone info if requested.
  const targetKeys = target.map((f, i) =>
    composeKey(f, targetTones?.[i] ?? 0, scheme, toneMode)
  );

  // We only consider phrases of the same length under FULL mode.
  const candidateIds = lexicon.byLength.get(targetLength) ?? [];

  const buckets: Array<SearchHit[]> = Array.from(
    { length: targetLength + 1 },
    () => []
  );

  for (const id of candidateIds) {
    const phrase = lexicon.phrases[id];
    if (excludeText !== undefined && phrase.text === excludeText) continue;

    const candKeys = phrase.finals.map((f, i) =>
      composeKey(f, phrase.tones?.[i] ?? 0, scheme, toneMode)
    );
    const match = matchFullKeys(targetKeys, candKeys);
    if (!match) continue;
    if (match.relaxationLevel > maxLevel) continue;
    // If the user wants the end to rhyme (default), drop candidates
    // whose last position didn't match. A relaxation of Level 1
    // "where position 3 is the off one" is what the user complained about.
    if (requireTailMatch && targetLength > 0) {
      const last = match.perPosition.length - 1;
      if (last >= 0 && !match.perPosition[last]) continue;
    }

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

// ─── Tail-aligned search ───────────────────────────────────────────────

export interface TailSearchHit {
  readonly phrase: PhraseRecord;
  /** Length of the matching tail. Higher = deeper multi-押. */
  readonly tailK: number;
  /** Full match info for the matching window. */
  readonly match: RhymeMatch;
}

export interface TailSearchBucket {
  /** Depth of tail rhyme common to all hits in this bucket. */
  readonly tailK: number;
  readonly hits: readonly TailSearchHit[];
}

export interface TailSearchResult {
  readonly targetLength: number;
  /** Buckets in DESCENDING tailK order — deepest matches shown first. */
  readonly buckets: readonly TailSearchBucket[];
  readonly totalHits: number;
}

export interface TailSearchOptions {
  /** Don't return hits with tailK below this. Default 2 (single-syllable
   *  matches are usually noise — half the lexicon shares the last syllable). */
  readonly minTailK?: number;
  /** Cap hits per bucket. Default 30. */
  readonly maxPerBucket?: number;
  readonly excludeText?: string;
  /** Per-syllable tones for the target — enables tone-aware matching. */
  readonly targetTones?: readonly number[];
  /** Tone strictness: 'none' (default), 'pingze', or 'exact'. */
  readonly toneMode?: ToneMode;
}

const TAIL_DEFAULT_MIN_K = 2;
const TAIL_DEFAULT_MAX_PER_BUCKET = 30;

/**
 * Find phrases that share a tail rhyme of length ≥ minTailK with the
 * target, regardless of phrase length. This is the practical complement
 * to `searchByFinals`: rappers often want to extend a line with a
 * different-length phrase that just shares the ending.
 *
 * Algorithm walks the whole lexicon once; O(P × maxPatternScan) where
 * maxPatternScan = min(target.length, candidate.length). For small
 * corpora (≤50k) this is milliseconds.
 */
export function searchByTail(
  target: readonly string[],
  scheme: RhymeScheme,
  lexicon: Lexicon,
  options: TailSearchOptions = {}
): TailSearchResult {
  const minTailK = options.minTailK ?? TAIL_DEFAULT_MIN_K;
  const maxPerBucket = options.maxPerBucket ?? TAIL_DEFAULT_MAX_PER_BUCKET;
  const excludeText = options.excludeText;
  const toneMode: ToneMode = options.toneMode ?? 'none';
  const targetTones = options.targetTones;
  const targetLength = target.length;

  if (targetLength === 0) {
    return { targetLength: 0, buckets: [], totalHits: 0 };
  }

  const targetKeys = target.map((f, i) =>
    composeKey(f, targetTones?.[i] ?? 0, scheme, toneMode)
  );

  // Work out the longest possible tail K for this target under the scheme.
  // We cap the bucket keyspace at the target length.
  const buckets: Array<TailSearchHit[]> = Array.from(
    { length: targetLength + 1 },
    () => []
  );

  for (const phrase of lexicon.phrases) {
    if (excludeText !== undefined && phrase.text === excludeText) continue;
    const candKeys = phrase.finals.map((f, i) =>
      composeKey(f, phrase.tones?.[i] ?? 0, scheme, toneMode)
    );
    // Try the deepest possible match first; if it fully matches we stop.
    const window = Math.min(targetLength, phrase.length);
    let bestK = 0;
    let bestMatch: RhymeMatch | null = null;
    for (let k = window; k >= minTailK; k--) {
      const m = matchTailKeys(targetKeys, candKeys, k);
      if (m.isFullMatch && m.comparedLength === k) {
        bestK = k;
        bestMatch = m;
        break;
      }
    }
    if (bestMatch && bestK >= minTailK) {
      buckets[bestK].push({
        phrase,
        tailK: bestK,
        match: bestMatch
      });
    }
  }

  const out: TailSearchBucket[] = [];
  let totalHits = 0;
  // Descending tailK order — user cares about the deepest first.
  for (let k = buckets.length - 1; k >= minTailK; k--) {
    const bucket = buckets[k];
    if (bucket.length === 0) continue;
    bucket.sort((a, b) => {
      if (b.phrase.quality !== a.phrase.quality) {
        return b.phrase.quality - a.phrase.quality;
      }
      return a.phrase.text.localeCompare(b.phrase.text, 'zh-Hans');
    });
    const trimmed = bucket.slice(0, maxPerBucket);
    totalHits += trimmed.length;
    out.push({ tailK: k, hits: trimmed });
  }

  return { targetLength, buckets: out, totalHits };
}
