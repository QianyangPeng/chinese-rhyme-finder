/**
 * Position-aware rhyme matching between two final sequences.
 *
 * Three position modes are supported in this layer:
 *
 *   FULL   — sequences must have the same length; compare 1:1.
 *   TAIL   — align by the right edge; compare the overlapping K-tail.
 *   HEAD   — align by the left edge; compare the overlapping K-head.
 *
 * Every comparison is done under a `RhymeScheme`: two finals "match" iff
 * their scheme keys are equal AND non-empty (the empty key represents
 * "unrecognized final" and never rhymes with anything).
 *
 * The result reports per-position outcomes so the UI can highlight the
 * matched/unmatched syllables, and a `relaxationLevel` count that the
 * search layer uses to bin candidates by tightness (Level 0 = strict,
 * Level k = exactly k positions mismatched).
 */

import type { RhymeScheme } from './types.js';

export interface RhymeMatch {
  /** Number of positions actually compared (= overlap window length). */
  readonly comparedLength: number;
  /** Per-position true/false: did each position rhyme? Length = comparedLength. */
  readonly perPosition: readonly boolean[];
  /** Indices (within the comparison window) that matched. */
  readonly matchedPositions: readonly number[];
  /** Indices (within the comparison window) that did NOT match. */
  readonly unmatchedPositions: readonly number[];
  /** Count of unmatched positions. 0 = strict full match. */
  readonly relaxationLevel: number;
  /** True iff every compared position matched (relaxationLevel === 0). */
  readonly isFullMatch: boolean;
}

/**
 * Build a RhymeMatch from a per-position boolean array. Centralizes the
 * derivative fields so callers cannot disagree.
 */
function buildMatch(perPosition: boolean[]): RhymeMatch {
  const matchedPositions: number[] = [];
  const unmatchedPositions: number[] = [];
  for (let i = 0; i < perPosition.length; i++) {
    if (perPosition[i]) matchedPositions.push(i);
    else unmatchedPositions.push(i);
  }
  return {
    comparedLength: perPosition.length,
    perPosition,
    matchedPositions,
    unmatchedPositions,
    relaxationLevel: unmatchedPositions.length,
    isFullMatch: unmatchedPositions.length === 0
  };
}

/** Compare two parallel final lists position-by-position under `scheme`. */
function comparePositional(
  finalsA: readonly string[],
  finalsB: readonly string[],
  scheme: RhymeScheme
): RhymeMatch {
  if (finalsA.length !== finalsB.length) {
    throw new Error(
      `comparePositional requires equal-length sequences (got ${finalsA.length} vs ${finalsB.length})`
    );
  }
  const per: boolean[] = new Array(finalsA.length);
  for (let i = 0; i < finalsA.length; i++) {
    const ka = scheme.keyOf(finalsA[i]);
    const kb = scheme.keyOf(finalsB[i]);
    per[i] = ka !== '' && ka === kb;
  }
  return buildMatch(per);
}

/** Compare two parallel PRE-COMPOSED key sequences. Empty-string keys
 *  never match. Used by tone-aware search/miner paths that have
 *  already combined (final, tone, scheme) via composeKey. */
function compareKeys(
  keysA: readonly string[],
  keysB: readonly string[]
): RhymeMatch {
  if (keysA.length !== keysB.length) {
    throw new Error(
      `compareKeys requires equal-length sequences (got ${keysA.length} vs ${keysB.length})`
    );
  }
  const per: boolean[] = new Array(keysA.length);
  for (let i = 0; i < keysA.length; i++) {
    per[i] = keysA[i] !== '' && keysA[i] === keysB[i];
  }
  return buildMatch(per);
}

/**
 * FULL-mode match: target and candidate must have the same length, then
 * each position is compared directly.
 *
 * Returns `null` if the lengths differ — the search layer should not
 * even consider candidates of the wrong length for FULL mode.
 */
export function matchFull(
  target: readonly string[],
  candidate: readonly string[],
  scheme: RhymeScheme
): RhymeMatch | null {
  if (target.length !== candidate.length) return null;
  return comparePositional(target, candidate, scheme);
}

/** Same as matchFull but operates on already-composed key arrays (e.g.
 *  output of `composeKey` that bakes in the scheme + tone). */
export function matchFullKeys(
  target: readonly string[],
  candidate: readonly string[]
): RhymeMatch | null {
  if (target.length !== candidate.length) return null;
  return compareKeys(target, candidate);
}

/** Same as matchTail but operates on composed key arrays. */
export function matchTailKeys(
  target: readonly string[],
  candidate: readonly string[],
  k: number = Number.POSITIVE_INFINITY
): RhymeMatch {
  const window = Math.max(0, Math.min(k, target.length, candidate.length));
  if (window === 0) return buildMatch([]);
  const tA = target.slice(target.length - window);
  const tB = candidate.slice(candidate.length - window);
  return compareKeys(tA, tB);
}

/**
 * TAIL-mode match: align target and candidate by their right edges and
 * compare the overlapping `k` positions from the end.
 *
 * If `k` is omitted or larger than either sequence, the actual window is
 * `min(k, target.length, candidate.length)`. If either sequence is empty
 * the result reports zero compared positions (and trivially "matches").
 */
export function matchTail(
  target: readonly string[],
  candidate: readonly string[],
  scheme: RhymeScheme,
  k: number = Number.POSITIVE_INFINITY
): RhymeMatch {
  const window = Math.max(0, Math.min(k, target.length, candidate.length));
  if (window === 0) return buildMatch([]);
  const tA = target.slice(target.length - window);
  const tB = candidate.slice(candidate.length - window);
  return comparePositional(tA, tB, scheme);
}

/**
 * HEAD-mode match: align target and candidate by their left edges and
 * compare the overlapping `k` positions from the start.
 */
export function matchHead(
  target: readonly string[],
  candidate: readonly string[],
  scheme: RhymeScheme,
  k: number = Number.POSITIVE_INFINITY
): RhymeMatch {
  const window = Math.max(0, Math.min(k, target.length, candidate.length));
  if (window === 0) return buildMatch([]);
  const tA = target.slice(0, window);
  const tB = candidate.slice(0, window);
  return comparePositional(tA, tB, scheme);
}

/**
 * Convenience: just compute the rhyme-key sequence for a final list under
 * a scheme. Useful for indexing — the search layer hashes these keys to
 * quickly look up phrases sharing a rhyme pattern.
 */
export function keysFor(
  finals: readonly string[],
  scheme: RhymeScheme
): string[] {
  return finals.map((f) => scheme.keyOf(f));
}
