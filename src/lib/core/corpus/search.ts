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

// ── Subsequence alignment with "level = query-gaps + interior-gaps" ─────
//
// Given a query Q of length N and candidate C of length M, find the
// alignment that maximizes `2*matches - span` where:
//   - matches = number of Q positions paired to some C position (in order)
//   - span = (lastMatchedCandidatePos - firstMatchedCandidatePos + 1)
//
// Level = N + span - 2*matches  (or N if matches == 0)
//
// Why this formula: it treats every unmatched QUERY position as 1 level
// of relaxation, AND every INTERIOR gap in the candidate (unmatched
// positions between first and last matches) as 1 level. This matches
// user intent: "降维打击 vs 大衣" is Level 2 (2 query chars uncovered);
// "魔法 vs 罗德马" is Level 1 (gap of '德' inside the span).
//
// When `tailPinned` is true (the requireTailMatch=true UI default), we
// require Q[N-1] and C[M-1] to be matched together. This is guaranteed
// by the caller pre-filtering via byLastFinalKey[Q's last key].
//
// Algorithm: enumerate 2^(N-1) subsets of Q[0..N-2] positions (which
// extra query chars to try matching), for each subset try each anchor
// position f in C[0..M-2] as the first match, and greedy-walk forward
// picking earliest candidate slots. Pick the alignment with max score.
// Cost: O(2^N * N * M) per candidate — fine for N ≤ 8, M ≤ 20.

export interface AlignmentResult {
  /** Number of query positions aligned (always ≥ 1 when tailPinned). */
  readonly matches: number;
  /** First matched candidate position. -1 iff matches == 0. */
  readonly firstJ: number;
  /** Last matched candidate position. -1 iff matches == 0. */
  readonly lastJ: number;
  /** Length = lastJ - firstJ + 1. Each entry: did candidate position
   *  (firstJ + k) participate in the alignment? Used for rendering the
   *  tail-text span with per-char green/red coloring. */
  readonly perPosition: readonly boolean[];
  /** Level = N + span - 2*matches (N if matches == 0). */
  readonly level: number;
}

const EMPTY_ALIGNMENT: AlignmentResult = {
  matches: 0,
  firstJ: -1,
  lastJ: -1,
  perPosition: [],
  level: 0
};

export function findBestAlignment(
  queryKeys: readonly string[],
  candKeys: readonly string[],
  tailPinned: boolean
): AlignmentResult {
  const N = queryKeys.length;
  const M = candKeys.length;
  if (N === 0 || M === 0) {
    return { ...EMPTY_ALIGNMENT, level: N };
  }

  // When tail-pinned the caller guarantees keyOf(Q[N-1]) === keyOf(C[M-1]).
  // We anchor the alignment there. Then enumerate subsets of Q[0..N-2] to
  // find the best extra matches in C[0..M-2].
  if (tailPinned) {
    const qLastKey = queryKeys[N - 1];
    const cLastKey = candKeys[M - 1];
    if (!qLastKey || qLastKey !== cLastKey) {
      // Caller violated precondition; no match.
      return { ...EMPTY_ALIGNMENT, level: N };
    }
    return alignTailPinned(queryKeys, candKeys);
  }

  // Free alignment (tailPinned=false): enumerate any 2^N subset.
  return alignFree(queryKeys, candKeys);
}

function alignTailPinned(queryKeys: readonly string[], candKeys: readonly string[]): AlignmentResult {
  const N = queryKeys.length;
  const M = candKeys.length;

  // Best alignment known so far (floor: just the tail match, score 2-1=1).
  let bestMatches = 1;
  let bestFirst = M - 1;
  let bestPositions: number[] = [M - 1];
  let bestScore = 2 * 1 - 1;

  // Enumerate nonempty subsets of Q[0..N-2]. Empty subset = just tail
  // match (already the baseline).
  const preTailN = N - 1;
  const subsetLimit = preTailN === 0 ? 1 : 1 << preTailN;
  for (let subset = 1; subset < subsetLimit; subset++) {
    // Collect query positions in this subset in ascending order.
    const qPos: number[] = [];
    for (let i = 0; i < preTailN; i++) {
      if (subset & (1 << i)) qPos.push(i);
    }
    const subsetLen = qPos.length;

    // For each anchor f (first matched position in candidate).
    for (let f = 0; f < M - 1; f++) {
      const k0 = candKeys[f];
      const q0 = queryKeys[qPos[0]];
      if (!k0 || k0 !== q0) continue;
      // Greedy: for the remaining subset positions, find earliest next
      // candidate slot in (previous + 1 .. M-2) with matching key.
      const matchedPositions: number[] = [f];
      let cj = f + 1;
      let ok = true;
      for (let k = 1; k < subsetLen; k++) {
        const qk = queryKeys[qPos[k]];
        if (!qk) { ok = false; break; }
        while (cj < M - 1 && candKeys[cj] !== qk) cj++;
        if (cj >= M - 1) { ok = false; break; }
        matchedPositions.push(cj);
        cj++;
      }
      if (!ok) continue;
      // Append the tail match.
      matchedPositions.push(M - 1);
      const totalMatches = matchedPositions.length;
      const first = matchedPositions[0];
      const span = (M - 1) - first + 1;
      const score = 2 * totalMatches - span;
      // Tie-break: prefer more matches (richer alignment, same level).
      if (score > bestScore || (score === bestScore && totalMatches > bestMatches)) {
        bestScore = score;
        bestMatches = totalMatches;
        bestFirst = first;
        bestPositions = matchedPositions;
      }
    }
  }

  const lastJ = M - 1;
  const span = lastJ - bestFirst + 1;
  const perPosition = new Array<boolean>(span).fill(false);
  for (const j of bestPositions) perPosition[j - bestFirst] = true;
  const level = N + span - 2 * bestMatches;
  return { matches: bestMatches, firstJ: bestFirst, lastJ, perPosition, level };
}

function alignFree(queryKeys: readonly string[], candKeys: readonly string[]): AlignmentResult {
  const N = queryKeys.length;
  const M = candKeys.length;
  let bestMatches = 0;
  let bestFirst = -1;
  let bestPositions: number[] = [];
  let bestScore = 0;

  for (let subset = 1; subset < (1 << N); subset++) {
    const qPos: number[] = [];
    for (let i = 0; i < N; i++) if (subset & (1 << i)) qPos.push(i);
    for (let f = 0; f < M; f++) {
      const k0 = candKeys[f];
      const q0 = queryKeys[qPos[0]];
      if (!k0 || k0 !== q0) continue;
      const matchedPositions: number[] = [f];
      let cj = f + 1;
      let ok = true;
      for (let k = 1; k < qPos.length; k++) {
        const qk = queryKeys[qPos[k]];
        if (!qk) { ok = false; break; }
        while (cj < M && candKeys[cj] !== qk) cj++;
        if (cj >= M) { ok = false; break; }
        matchedPositions.push(cj);
        cj++;
      }
      if (!ok) continue;
      const totalMatches = matchedPositions.length;
      const first = matchedPositions[0];
      const last = matchedPositions[totalMatches - 1];
      const span = last - first + 1;
      const score = 2 * totalMatches - span;
      // Tie-break: prefer more matches (richer alignment, same level).
      if (score > bestScore || (score === bestScore && totalMatches > bestMatches)) {
        bestScore = score;
        bestMatches = totalMatches;
        bestFirst = first;
        bestPositions = matchedPositions;
      }
    }
  }
  if (bestMatches === 0) return { ...EMPTY_ALIGNMENT, level: N };
  const lastJ = bestPositions[bestPositions.length - 1];
  const span = lastJ - bestFirst + 1;
  const perPosition = new Array<boolean>(span).fill(false);
  for (const j of bestPositions) perPosition[j - bestFirst] = true;
  const level = N + span - 2 * bestMatches;
  return { matches: bestMatches, firstJ: bestFirst, lastJ, perPosition, level };
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
  // Under the new "gaps count as relaxations" formula, levels up to
  // targetLength are what the UI cares about; we keep the bucket map
  // sparse (not a pre-sized array) so we can accept arbitrary levels.
  const maxLevel = options.maxLevel ?? targetLength;
  const maxPerBucket = options.maxPerBucket ?? DEFAULT_MAX_PER_BUCKET;
  const excludeText = options.excludeText;
  const toneMode: ToneMode = options.toneMode ?? 'none';
  const targetTones = options.targetTones;
  const requireTailMatch = options.requireTailMatch ?? true;
  // Legacy option — no longer used; the new alignment algorithm
  // discovers optimal match positions automatically regardless of
  // where the rhyme sits inside a longer candidate.
  void options.windowMode;

  const targetKeys = target.map((f, i) =>
    composeKey(f, (targetTones?.[i] ?? 0) as Tone, scheme, toneMode)
  );

  const bucketMap = new Map<number, SearchHit[]>();
  function pushHit(level: number, hit: SearchHit) {
    let arr = bucketMap.get(level);
    if (!arr) { arr = []; bucketMap.set(level, arr); }
    arr.push(hit);
  }

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

    // Compose this candidate's keys once.
    const candKeys: string[] = new Array(phrase.length);
    for (let i = 0; i < phrase.length; i++) {
      candKeys[i] = composeKey(
        phrase.finals[i],
        (phrase.tones?.[i] ?? 0) as Tone,
        scheme,
        toneMode
      );
    }

    // Unified alignment: find the best query-to-candidate pairing that
    // maximizes (2*matches - span). Level = N + span - 2*matches.
    // Handles same-length / longer / shorter candidates uniformly.
    const align = findBestAlignment(targetKeys, candKeys, requireTailMatch);
    if (align.matches === 0) continue;
    if (align.level > maxLevel) continue;

    // Synthesize a RhymeMatch-shaped object for rendering compatibility.
    const matchedPositions: number[] = [];
    for (let i = 0; i < align.perPosition.length; i++) {
      if (align.perPosition[i]) matchedPositions.push(i);
    }
    const matchObj: RhymeMatch = {
      perPosition: align.perPosition,
      matchedPositions,
      unmatchedPositions: align.perPosition
        .map((b, i) => (b ? -1 : i)).filter((x) => x >= 0) as number[],
      comparedLength: align.perPosition.length,
      relaxationLevel: align.level,
      isFullMatch: align.level === 0
    };
    pushHit(align.level, {
      phrase,
      match: matchObj,
      level: align.level,
      matchOffset: align.firstJ,
      tailText: sliceTailText(phrase, align.firstJ, align.perPosition.length)
    });
  }

  const out: SearchBucket[] = [];
  let totalHits = 0;
  const sortedLevels = [...bucketMap.keys()].sort((a, b) => a - b);
  for (const level of sortedLevels) {
    const bucket = bucketMap.get(level)!;
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
