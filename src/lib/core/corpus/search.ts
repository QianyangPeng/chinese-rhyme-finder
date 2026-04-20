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

/**
 * Return true if the phrase's jieba segments mark it as a proper noun
 * (person / place / organization / other name). We penalize these in
 * the sort so transliterated names like 博比/莫莉 from movie subtitles
 * don't crowd out common words like 作弊/躲避 for songwriting users.
 *
 * POS codes: nr* = person, ns = place, nt = organization, nz = other proper.
 */
function isProperNoun(phrase: PhraseRecord): boolean {
  const segs = phrase.segments;
  if (!segs || segs.length === 0) return false;
  for (const s of segs) {
    const pos = s.pos ?? '';
    if (pos.startsWith('nr') || pos === 'ns' || pos === 'nt' || pos === 'nz') {
      return true;
    }
  }
  return false;
}

/** CJK-chars cache — phrase.text → char array. Called inside every
 *  search hit's tail-text computation. Since `phrase` is the same
 *  object across searches, a WeakMap gives O(1) reuse. */
const _cjkCharsCache = new WeakMap<PhraseRecord, string[]>();
const _CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
function getCjkChars(phrase: PhraseRecord): string[] {
  let cached = _cjkCharsCache.get(phrase);
  if (cached) return cached;
  cached = [];
  for (const ch of phrase.text) {
    if (_CJK_RE.test(ch)) cached.push(ch);
  }
  _cjkCharsCache.set(phrase, cached);
  return cached;
}

/** Slice the tail-text substring from a phrase given the match window. */
function sliceTailText(phrase: PhraseRecord, matchOffset: number, windowLen: number): string {
  const chars = getCjkChars(phrase);
  if (chars.length === phrase.length) {
    // Fast path: every CJK char counts, so the phrase.finals index maps
    // 1:1 to chars. Slice directly.
    return chars.slice(matchOffset, matchOffset + windowLen).join('');
  }
  // Fallback (rare: phrase with mixed non-CJK content) — still correct.
  return chars.slice(matchOffset, matchOffset + windowLen).join('');
}

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
  /** The substring of phrase.text that corresponds to the match window.
   *  Precomputed so the group-by-tail UI doesn't re-split + re-filter
   *  every render. Example: "了吗" when 好了吗 matches target 喇叭. */
  readonly tailText: string;
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

  if (targetLength === 0) {
    return { targetLength: 0, buckets: [], totalHits: 0 };
  }

  // ── Index-driven candidate iteration ─────────────────────────────
  //
  // The old algorithm iterated all phrases in 3 passes (same-length,
  // longer, shorter). On 800k phrases with 3-5 ops each that was
  // ~3M ops per search — enough to freeze a tab and starve fetch
  // handlers during lexicon streaming.
  //
  // New strategy: when `requireTailMatch` is true (the default UI
  // setting), the candidate's LAST final must map to the same key as
  // the target's last final. So we pre-filter via `byLastFinalKey` —
  // one lookup returns the tiny subset of phrases that could possibly
  // rhyme. Typically 1-5% of the corpus. Everything else is skipped
  // before we ever touch it.
  //
  // When requireTailMatch is false we fall back to iterating all
  // phrases (rare UI path — user has to uncheck "必须押韵").
  const targetLastFinal = target[target.length - 1];
  const targetLastKey = scheme.keyOf(targetLastFinal);

  let candidateIds: Iterable<number>;
  if (requireTailMatch && targetLastKey) {
    candidateIds = lexicon.byLastFinalKey.get(targetLastKey) ?? [];
  } else {
    // Full-scan fallback (rare).
    const ids: number[] = [];
    for (const bucket of lexicon.byLength.values()) {
      for (const id of bucket) ids.push(id);
    }
    candidateIds = ids;
  }

  // If caller set toneMode='exact', they also want the last tone to
  // match. That's equivalent to the byLastFinalKey filter PLUS a tone
  // check per candidate. We do the tone check inside the loop; it
  // prunes a handful of items cheaply.
  const targetLastTone = toneMode === 'exact'
    ? ((targetTones?.[target.length - 1] ?? 0) as Tone)
    : null;

  for (const id of candidateIds) {
    const phrase = lexicon.phrases[id];
    if (phrase.length < 2) continue;   // single syllables are noise
    if (excludeText !== undefined && phrase.text === excludeText) continue;

    // Tail tone check (cheap) — only relevant for toneMode='exact'
    // since the byLastFinalKey index is tone-agnostic.
    if (targetLastTone !== null) {
      const phraseLastTone = (phrase.tones?.[phrase.length - 1] ?? 0) as Tone;
      if (phraseLastTone !== targetLastTone) continue;
    }

    // Compose this candidate's keys once (reused for window slides on
    // longer candidates).
    const candKeys: string[] = new Array(phrase.length);
    for (let i = 0; i < phrase.length; i++) {
      candKeys[i] = composeKey(
        phrase.finals[i],
        (phrase.tones?.[i] ?? 0) as Tone,
        scheme,
        toneMode
      );
    }

    // Route to the appropriate comparison based on length.
    if (phrase.length === targetLength) {
      // Same-length: straight positional compare.
      const match = matchFullKeys(targetKeys, candKeys);
      if (!match) continue;
      if (match.relaxationLevel > maxLevel) continue;
      if (requireTailMatch) {
        const last = match.perPosition.length - 1;
        if (last >= 0 && !match.perPosition[last]) continue;
      }
      buckets[match.relaxationLevel].push({
        phrase, match, level: match.relaxationLevel, matchOffset: 0,
        tailText: sliceTailText(phrase, 0, match.perPosition.length)
      });
    } else if (phrase.length > targetLength) {
      // Longer candidate: slide a window of size targetLength.
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
          phrase, match: bestMatch, level: bestMatch.relaxationLevel, matchOffset: bestOffset,
          tailText: sliceTailText(phrase, bestOffset, bestMatch.perPosition.length)
        });
      }
    } else {
      // Shorter candidate (2 ≤ M < targetLength): compare the full
      // candidate against target's tail of the same length.
      const M = phrase.length;
      if (targetLength < 2) continue;  // can't take a 2-tail out of 1
      const targetTail = targetKeys.slice(targetLength - M);
      const match = matchFullKeys(targetTail, candKeys);
      if (!match) continue;
      if (match.relaxationLevel > maxLevel) continue;
      if (requireTailMatch) {
        const last = match.perPosition.length - 1;
        if (last >= 0 && !match.perPosition[last]) continue;
      }
      buckets[match.relaxationLevel].push({
        phrase, match, level: match.relaxationLevel, matchOffset: 0,
        tailText: sliceTailText(phrase, 0, match.perPosition.length)
      });
    }
  }

  const out: SearchBucket[] = [];
  let totalHits = 0;
  for (let level = 0; level < buckets.length; level++) {
    const bucket = buckets[level];
    if (bucket.length === 0) continue;

    // Sort within a level by a length-tier + POS + quality + text key.
    //
    //   tier 0 — same length as target (most on-point; positional rhyme)
    //   tier 1 — SHORTER than target (perfect tail rhyme of M/N chars —
    //            still a clean rhyme pair like "岁月静好 ↔ 青岛")
    //   tier 2 — LONGER than target (target rhymes inside the candidate)
    //
    // Inside a tier: non-proper-noun first, then quality desc. Proper
    // nouns (transliterated names like 莫莉/博比 from OpenSubtitles with
    // q=1.0) would otherwise drown out genuine common words (作弊/躲避
    // from CEDICT with q=0.82). Rappers/lyricists want common vocab at
    // the top of the list — names can be a second page.
    bucket.sort((a, b) => {
      const aTier = a.phrase.length === targetLength ? 0
        : a.phrase.length < targetLength ? 1
        : 2;
      const bTier = b.phrase.length === targetLength ? 0
        : b.phrase.length < targetLength ? 1
        : 2;
      if (aTier !== bTier) return aTier - bTier;
      const aProper = isProperNoun(a.phrase) ? 1 : 0;
      const bProper = isProperNoun(b.phrase) ? 1 : 0;
      if (aProper !== bProper) return aProper - bProper;
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
