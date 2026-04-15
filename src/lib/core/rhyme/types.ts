/**
 * Types shared across rhyme schemes, matchers, and the relaxation
 * enumerator.
 *
 * A "rhyme scheme" is a function from a Mandarin final (e.g., "iang",
 * "uei") to an opaque rhyme-group key — two finals rhyme under the
 * scheme iff they map to the same key (or to keys that the scheme
 * declares equivalent).
 *
 * Different schemes have different granularity:
 *   - xinyun  (中华新韵 14 部, DEFAULT): modern Mandarin standard,
 *     separates apical -i (支) from regular i/ü (齐).
 *   - shisanzhe (十三辙): traditional 曲艺 grouping, merges apical into 一七.
 *   - strict: each canonical final is its own group.
 *   - loose: 十三辙 + cross-辙 bridges (en↔eng, in↔ing, etc.) for looser rap.
 *
 * For multi-syllable matching, callers compute the rhyme-key sequence
 * for each phrase then compare sequences positionally.
 */

/** Stable IDs for the rhyme schemes shipped in the box. */
export type RhymeSchemeId = 'strict' | 'shisanzhe' | 'loose' | 'xinyun';

/**
 * A rhyme scheme is fully defined by:
 *   - id:    a stable key for serialization / UI
 *   - name:  a human label (Chinese)
 *   - keyOf: a function mapping a final to its group key
 */
export interface RhymeScheme {
  readonly id: RhymeSchemeId;
  readonly name: string;
  /** Map a 韵母 (e.g., "iang") to its group key (e.g., "江阳辙"). */
  keyOf(final: string): string;
}

/** A sequence of rhyme-group keys, e.g., ['江阳辙', '灰堆辙', ...]. */
export type RhymeKeySequence = readonly string[];
