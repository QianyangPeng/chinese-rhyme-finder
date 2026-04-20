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
import type { Tone } from '../pinyin/types.js';

export interface SearchHit {
  /** The matched phrase. */
  readonly phrase: PhraseRecord;
  /** Position-level match details against the target. */
  readonly match: RhymeMatch;
  /** 0 = strict full match, k = exactly k positions mismatched. */
  readonly level: number;
  /** Where the matching window starts inside `phrase.finals` (0-indexed
   *  syllable position). For same-length matches this is always 0; for
   *  longer phrases it tells the renderer where to align the per-position
   *  match annotations so they highlight the right characters. */
  readonly matchOffset: number;
}

export interface SearchBucket {
  /** Mismatched-position count common to all hits in this bucket. */
  readonly level: number;
  /** Hits at this level, sorted by quality desc then text. */
  readonly hits: readonly SearchHit[];
}

export interface SearchResult {
  /** Length of the target final sequence. Same-length phrases are
   *  compared in full; longer phrases are matched by their tail. */
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
  /** When true, only return candidates whose LAST syllable in the matching
   *  window matches the target's last syllable. The relaxation count then
   *  counts how many NON-tail positions are off. Default **true**. */
  readonly requireTailMatch?: boolean;
  /** Match window placement for phrases longer than the target:
   *   - 'tail'     — match only at the end of the candidate (default).
   *   - 'anywhere' — slide the window across the candidate; pick the
   *                  best window. Surfaces e.g. "降维打击" rhymes inside
   *                  "我喜欢降维打击的快感". */
  readonly windowMode?: 'tail' | 'anywhere';
}

const DEFAULT_MAX_PER_BUCKET = 50;

/**
 * Search the lexicon for phrases whose finals match the target under
 * `scheme`. Same-length phrases are compared position-by-position;
 * longer phrases are matched by their TAIL (last N syllables, where
 * N = target length). This means searching "星空" (2 syllables) will
 * also find "满天星空" (4 syllables) if the last 2 syllables rhyme.
 *
 * Hits are bucketed by mismatch count (relaxation level) — Level 0 =
 * strict full match, Level k = k positions off.
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
  const windowMode = options.windowMode ?? 'tail';

  // Pre-compose target keys with tone info if requested.
  const targetKeys = target.map((f, i) =>
    composeKey(f, (targetTones?.[i] ?? 0) as Tone, scheme, toneMode)
  );

  const buckets: Array<SearchHit[]> = Array.from(
    { length: targetLength + 1 },
    () => []
  );

  // Track which phrase IDs we've already matched (same-length pass) so
  // we don't add them again in the longer-phrase pass.
  const seen = new Set<number>();

  // ── Pass 1: same-length phrases (full positional match) ────────────
  const sameLengthIds = lexicon.byLength.get(targetLength) ?? [];
  for (const id of sameLengthIds) {
    const phrase = lexicon.phrases[id];
    if (excludeText !== undefined && phrase.text === excludeText) continue;

    const candKeys = phrase.finals.map((f, i) =>
      composeKey(f, (phrase.tones?.[i] ?? 0) as Tone, scheme, toneMode)
    );
    const match = matchFullKeys(targetKeys, candKeys);
    if (!match) continue;
    if (match.relaxationLevel > maxLevel) continue;
    // If the user wants the end to rhyme (default), drop candidates
    // whose last position didn't match.
    if (requireTailMatch && targetLength > 0) {
      const last = match.perPosition.length - 1;
      if (last >= 0 && !match.perPosition[last]) continue;
    }

    seen.add(id);
    buckets[match.relaxationLevel].push({
      phrase,
      match,
      level: match.relaxationLevel,
      matchOffset: 0
    });
  }

  // ── Pass 2: longer phrases — slide a window of size targetLength ───
  // Window placement depends on `windowMode`:
  //   - 'tail'     — only check the tail position (offset = N - L)
  //   - 'anywhere' — every starting offset 0 ≤ o ≤ N - L; pick best window
  //                  (lowest relaxation, then largest offset so we still
  //                  prefer end rhymes when ties).
  // This allows "降维打击" to match "我超喜欢降维打击" or longer lyrics
  // lines that contain the target as an internal rhyme group.
  if (targetLength > 0) {
    for (const [phraseLen, ids] of lexicon.byLength) {
      if (phraseLen <= targetLength) continue;
      for (const id of ids) {
        if (seen.has(id)) continue;
        const phrase = lexicon.phrases[id];
        if (excludeText !== undefined && phrase.text === excludeText) continue;

        // Compose ALL candidate keys once so multiple windows reuse them.
        const candKeys: string[] = new Array(phrase.length);
        for (let i = 0; i < phrase.length; i++) {
          candKeys[i] = composeKey(
            phrase.finals[i],
            (phrase.tones?.[i] ?? 0) as Tone,
            scheme,
            toneMode
          );
        }

        const tailOffset = phrase.length - targetLength;
        const startOffset = windowMode === 'anywhere' ? 0 : tailOffset;

        let bestMatch: RhymeMatch | null = null;
        let bestOffset = -1;
        for (let off = startOffset; off <= tailOffset; off++) {
          const window = candKeys.slice(off, off + targetLength);
          const m = matchFullKeys(targetKeys, window);
          if (!m) continue;
          if (m.relaxationLevel > maxLevel) continue;
          if (requireTailMatch) {
            const last = m.perPosition.length - 1;
            if (last >= 0 && !m.perPosition[last]) continue;
          }
          // Prefer lower relaxation; tie-break: prefer the tail position
          // (largest offset) so end-rhymes still win ties.
          if (
            !bestMatch ||
            m.relaxationLevel < bestMatch.relaxationLevel ||
            (m.relaxationLevel === bestMatch.relaxationLevel && off > bestOffset)
          ) {
            bestMatch = m;
            bestOffset = off;
          }
        }

        if (bestMatch) {
          buckets[bestMatch.relaxationLevel].push({
            phrase,
            match: bestMatch,
            level: bestMatch.relaxationLevel,
            matchOffset: bestOffset
          });
        }
      }
    }
  }

  // ── Pass 3: SHORTER phrases — candidate's full sequence vs target's tail
  // ──────────────────────────────────────────────────────────────────────
  // When the target is "岁月静好" (4 syllables), "青岛" (2 syllables)
  // should be a hit because its two finals match the target's last two.
  // We compare the whole candidate against target[N-M ..N-1] — i.e., the
  // candidate IS the rhyme window.
  //
  // Single-syllable candidates are skipped (too noisy — half the lexicon
  // shares the last final).
  if (targetLength >= 2) {
    for (const [phraseLen, ids] of lexicon.byLength) {
      if (phraseLen >= targetLength || phraseLen < 2) continue;
      const M = phraseLen;
      // Slice out the target's tail of length M — the reference window.
      const targetTail = targetKeys.slice(targetLength - M);

      for (const id of ids) {
        if (seen.has(id)) continue;
        const phrase = lexicon.phrases[id];
        if (excludeText !== undefined && phrase.text === excludeText) continue;

        const candKeys = phrase.finals.map((f, i) =>
          composeKey(f, (phrase.tones?.[i] ?? 0) as Tone, scheme, toneMode)
        );
        const match = matchFullKeys(targetTail, candKeys);
        if (!match) continue;
        if (match.relaxationLevel > maxLevel) continue;
        if (requireTailMatch) {
          const last = match.perPosition.length - 1;
          if (last >= 0 && !match.perPosition[last]) continue;
        }

        buckets[match.relaxationLevel].push({
          phrase,
          match,
          level: match.relaxationLevel,
          // The match spans the whole candidate — offset 0 inside phrase.
          matchOffset: 0
        });
      }
    }
  }

  const out: SearchBucket[] = [];
  let totalHits = 0;
  for (let level = 0; level < buckets.length; level++) {
    const bucket = buckets[level];
    if (bucket.length === 0) continue;

    // Sort within a level by a length-tier + quality + alphabetical key.
    //
    //   tier 0 — same length as target (most on-point; positional rhyme)
    //   tier 1 — SHORTER than target (perfect tail rhyme of M/N chars —
    //            still a clean rhyme pair like "岁月静好 ↔ 青岛")
    //   tier 2 — LONGER than target (the target rhymes inside the candidate)
    //
    // Within a tier: higher quality first, then alphabetical for stability.
    bucket.sort((a, b) => {
      const aTier = a.phrase.length === targetLength ? 0
        : a.phrase.length < targetLength ? 1
        : 2;
      const bTier = b.phrase.length === targetLength ? 0
        : b.phrase.length < targetLength ? 1
        : 2;
      if (aTier !== bTier) return aTier - bTier;
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
    composeKey(f, (targetTones?.[i] ?? 0) as Tone, scheme, toneMode)
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
      composeKey(f, (phrase.tones?.[i] ?? 0) as Tone, scheme, toneMode)
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
