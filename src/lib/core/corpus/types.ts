/**
 * Corpus types — the in-memory representation of the lexicon at runtime.
 *
 * Phase 1 ships with a small hand-curated seed lexicon (~200 phrases)
 * embedded as a TypeScript module, sufficient to demonstrate Search and
 * to run integration tests. Phase 1.4's Python pipeline will replace the
 * seed with a much larger corpus loaded from a packed binary file (`.bin`)
 * via the same `Lexicon` shape, so callers don't change.
 */

/**
 * One entry in the lexicon. The `finals` and `length` fields are
 * pre-computed at load time so Search doesn't re-parse pinyin per query.
 */
export interface PhraseRecord {
  /** Original text, e.g., "春暖花开". */
  readonly text: string;
  /** Length in syllables (Chinese characters that parsed to a syllable). */
  readonly length: number;
  /** Per-syllable canonical 韵母 (e.g., ["uen", "uan", "ua", "ai"]). */
  readonly finals: readonly string[];
  /** Quality score 0..1. Hand-curated seed entries default to 0.8. */
  readonly quality: number;
  /** Coarse category labels (idiom, lyric, modern, tech, …). */
  readonly tags: readonly string[];
  /** Provenance label (e.g., "seed-v1", later "lyrics-corpus-2026", …). */
  readonly source: string;
}

/**
 * The full lexicon plus light precomputed indexes. For ~200-50k phrases,
 * a Map<length, indices[]> is plenty; replace with a real inverted index
 * when the corpus crosses ~100k entries.
 */
export interface Lexicon {
  /** All phrase records, indexed by `phraseId` = position in this array. */
  readonly phrases: readonly PhraseRecord[];
  /** length → sorted list of phrase IDs of that length. */
  readonly byLength: ReadonlyMap<number, readonly number[]>;
}
