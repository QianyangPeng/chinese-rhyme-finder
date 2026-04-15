/**
 * Reverse rhyme analysis: given a multi-line passage of text, identify
 * which lines rhyme with which and to what depth.
 *
 * The algorithm is intentionally simple for Phase 1:
 *   1. Split the input on newlines.
 *   2. For each line, parse syllables and compute per-syllable rhyme-group
 *      keys under the chosen scheme.
 *   3. For every pair of lines, scan from each end to find the longest
 *      run of matching keys (tail-K and head-K).
 *   4. Bucket lines by their final-syllable key into "rhyme groups" so
 *      the UI can color them together.
 *
 * What it deliberately doesn't do (yet):
 *   - Internal rhyme detection (matching positions WITHIN a single line).
 *   - Cross-position offset matching (e.g., end of line A vs middle of B).
 *   - Probabilistic scoring (everything is a hard match under the scheme).
 * These belong to Phase 2 once the basic UI shape is validated.
 */

import { parseSyllables } from '../pinyin/parser.js';
import type { RhymeScheme } from '../rhyme/types.js';
import type {
  LineAnalysis,
  ReverseAnalysis,
  RhymeGroup,
  RhymePair
} from './types.js';

/**
 * Number of consecutive matching keys aligned at the END of two
 * sequences. Empty keys (unrecognized finals) never count as matches.
 */
function longestMatchingTail(a: readonly string[], b: readonly string[]): number {
  const m = Math.min(a.length, b.length);
  let k = 0;
  for (let i = 1; i <= m; i++) {
    const ka = a[a.length - i];
    const kb = b[b.length - i];
    if (!ka || ka !== kb) break;
    k = i;
  }
  return k;
}

/**
 * Number of consecutive matching keys aligned at the START of two
 * sequences. Empty keys never match.
 */
function longestMatchingHead(a: readonly string[], b: readonly string[]): number {
  const m = Math.min(a.length, b.length);
  let k = 0;
  for (let i = 0; i < m; i++) {
    const ka = a[i];
    const kb = b[i];
    if (!ka || ka !== kb) break;
    k = i + 1;
  }
  return k;
}

/**
 * Bucket lines by the rhyme key of their FINAL syllable. Returns only
 * groups with at least 2 members — singletons aren't rhyming with anyone.
 * Within each group, indices are in input order.
 */
function buildGroups(lines: readonly LineAnalysis[]): RhymeGroup[] {
  const buckets = new Map<string, number[]>();
  for (const line of lines) {
    if (line.keys.length === 0) continue;
    const lastKey = line.keys[line.keys.length - 1];
    if (!lastKey) continue;
    let bucket = buckets.get(lastKey);
    if (!bucket) {
      bucket = [];
      buckets.set(lastKey, bucket);
    }
    bucket.push(line.index);
  }

  const groups: RhymeGroup[] = [];
  for (const [rhymeKey, lineIndices] of buckets) {
    if (lineIndices.length >= 2) {
      groups.push({ rhymeKey, lineIndices });
    }
  }
  // Sort by first appearance for stable rendering.
  groups.sort((g1, g2) => g1.lineIndices[0] - g2.lineIndices[0]);
  return groups;
}

/**
 * Group positions within a single line by their rhyme key. Empty keys
 * and single-occurrence keys are dropped — only returns genuine
 * "internal rhyme" groups (≥2 positions sharing a key).
 */
function computeInternalGroups(
  keys: readonly string[]
): Map<string, number[]> {
  const all = new Map<string, number[]>();
  for (let i = 0; i < keys.length; i++) {
    if (!keys[i]) continue;
    let bucket = all.get(keys[i]);
    if (!bucket) {
      bucket = [];
      all.set(keys[i], bucket);
    }
    bucket.push(i);
  }
  // Drop singletons.
  for (const [k, pos] of all) {
    if (pos.length < 2) all.delete(k);
  }
  return all;
}

/** Run reverse analysis on a passage of (potentially multi-line) text. */
export function reverseAnalyze(
  text: string,
  scheme: RhymeScheme
): ReverseAnalysis {
  const rawLines = text.split(/\r?\n/);
  const lines: LineAnalysis[] = rawLines.map((lineText, index) => {
    const syllables = parseSyllables(lineText);
    const keys = syllables.map((s) => scheme.keyOf(s.final));
    const internalGroups = computeInternalGroups(keys);
    return { text: lineText, index, syllables, keys, internalGroups };
  });

  const pairs: RhymePair[] = [];
  let maxTailK = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const tailK = longestMatchingTail(lines[i].keys, lines[j].keys);
      const headK = longestMatchingHead(lines[i].keys, lines[j].keys);
      if (tailK > 0 || headK > 0) {
        pairs.push({ indexA: i, indexB: j, tailK, headK });
      }
      if (tailK > maxTailK) maxTailK = tailK;
    }
  }

  const groups = buildGroups(lines);

  return { scheme, lines, pairs, groups, maxTailK };
}
