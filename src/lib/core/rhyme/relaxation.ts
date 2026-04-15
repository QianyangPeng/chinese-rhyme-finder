/**
 * Graded-strictness enumeration: bin candidates by how many positions
 * they differ from a target rhyme pattern.
 *
 * This is the engine behind the user-facing "Level 0 (strict) → Level N
 * (loose)" UI: instead of asking the user to mark which syllable
 * positions can flex, we automatically traverse all relaxation levels
 * and let them scroll through layers from tightest to loosest.
 *
 * For a target of length `n`, results are bucketed into `n+1` levels:
 *   level 0:  every position matches  (strict)
 *   level 1:  exactly one position misses
 *   ...
 *   level n:  no positions match (in practice empty for any sane scheme)
 *
 * The matcher itself doesn't enumerate; it just reports a single match's
 * level. This module wraps a corpus of candidates and groups them.
 */

import type { RhymeScheme } from './types.js';
import { matchFull } from './matcher.js';

export interface RelaxationBin {
  /** Mismatched-position count for everything in this bin. */
  readonly level: number;
  /** Candidate indices whose match against the target sat at this level. */
  readonly candidateIndices: readonly number[];
}

export interface RelaxationResult {
  /** Length of the target final sequence. */
  readonly targetLength: number;
  /** Bins indexed by level (0..targetLength). Empty bins included for completeness. */
  readonly bins: readonly RelaxationBin[];
}

/**
 * Bin a list of candidate final sequences against a target by relaxation
 * level. Only candidates whose length equals `target.length` participate;
 * differently-sized ones are silently skipped (the FULL-mode contract).
 *
 * Returns bins of length `target.length + 1`, where `bins[k]` lists all
 * candidate indices that mismatched the target in exactly `k` positions
 * under `scheme`. Bins are kept in level order so the UI can display
 * "Level 0 → Level n" as a progressive disclosure.
 */
export function binByRelaxation(
  target: readonly string[],
  candidates: readonly (readonly string[])[],
  scheme: RhymeScheme
): RelaxationResult {
  const n = target.length;
  // Pre-allocate empty arrays for every level.
  const buckets: number[][] = Array.from({ length: n + 1 }, () => []);

  for (let i = 0; i < candidates.length; i++) {
    const m = matchFull(target, candidates[i], scheme);
    if (!m) continue; // length mismatch
    buckets[m.relaxationLevel].push(i);
  }

  const bins: RelaxationBin[] = buckets.map((indices, level) => ({
    level,
    candidateIndices: indices
  }));

  return { targetLength: n, bins };
}

/**
 * Compactor: produce only the bins that contain candidates, in level
 * order. Convenient when the UI doesn't want to render empty levels.
 */
export function nonEmptyBins(result: RelaxationResult): RelaxationBin[] {
  return result.bins.filter((b) => b.candidateIndices.length > 0);
}
