/**
 * Reverse-analysis types: feed the engine a passage of text (typically
 * lyrics) and get back a structured view of which lines rhyme with
 * which, how strongly (multi-syllable depth), and which positions are
 * carrying the rhyme.
 *
 * Output is shaped for direct UI rendering — color-coded chips per
 * syllable, line-vs-line strength matrix, and grouped "rhyme cohorts".
 */

import type { Syllable } from '../pinyin/types.js';
import type { RhymeScheme } from '../rhyme/types.js';

export interface LineAnalysis {
  /** Line text exactly as input (sans the line-break). */
  readonly text: string;
  /** Zero-based index in the source string. */
  readonly index: number;
  /** Parsed syllables. Empty if the line has no Chinese characters. */
  readonly syllables: readonly Syllable[];
  /** Per-syllable rhyme-group key under the active scheme. */
  readonly keys: readonly string[];
}

/**
 * One rhyming relationship between two lines. The two lines may share a
 * tail rhyme (most common: lines ending on the same sound) and/or a
 * head rhyme (less common but used for stylistic effect). `tailK` and
 * `headK` count consecutive matching positions from the respective end.
 */
export interface RhymePair {
  /** First line index (always < indexB). */
  readonly indexA: number;
  /** Second line index (> indexA). */
  readonly indexB: number;
  /** Number of matching syllables aligned by the right edge. 0 = no tail rhyme. */
  readonly tailK: number;
  /** Number of matching syllables aligned by the left edge. */
  readonly headK: number;
}

/**
 * A rhyme group is a set of lines that all share their final syllable's
 * rhyme key — the most common form of "these lines rhyme". Lines in the
 * same group are good candidates for color-coding together in the UI.
 */
export interface RhymeGroup {
  /** Shared rhyme-group key (e.g., "一七辙" or "i" for the strict scheme). */
  readonly rhymeKey: string;
  /** Indices of the lines that end on this rhyme, in input order. */
  readonly lineIndices: readonly number[];
}

export interface ReverseAnalysis {
  /** The scheme that produced the keys. */
  readonly scheme: RhymeScheme;
  /** Per-line analyses, in input order. May include lines with zero syllables. */
  readonly lines: readonly LineAnalysis[];
  /** All non-trivial line-pair rhymes. Pairs with both K=0 are omitted. */
  readonly pairs: readonly RhymePair[];
  /** Lines bucketed by their last-syllable rhyme key (only groups with ≥2 lines). */
  readonly groups: readonly RhymeGroup[];
  /**
   * The strongest tail rhyme found anywhere in the input. 0 if no two
   * lines share a tail rhyme. Useful as a single-number "how impressive
   * is this passage" stat for the UI.
   */
  readonly maxTailK: number;
}
