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
 *
 * Schema v3 adds language-agnostic fields (`language`, `segments`) to
 * support future EN/JA/KO expansion. The `finals` field is now populated
 * from the JSON's `rhymeKeys` field (language-neutral name) but we keep
 * the `finals` accessor since TS consumers are already wired to it.
 */
export interface WordSegment {
  /** The token text (word boundary from POS tagger). */
  readonly text: string;
  /** Part-of-speech tag (ICTCLAS-style for zh: nr/n/v/a/...). */
  readonly pos: string;
}

export interface PhraseRecord {
  /** Original text, e.g., "春暖花开". */
  readonly text: string;
  /** Language of this phrase. Defaults to 'zh' for legacy entries. */
  readonly language?: 'zh' | 'en' | 'ja' | 'ko';
  /** Length in syllables. */
  readonly length: number;
  /** Per-syllable rhyme key (zh: 韵母, e.g., ["uen","uan","ua","ai"]).
   *  Language-agnostic name is `rhymeKeys` in the on-disk JSON; we
   *  expose it as `finals` for backward compat with existing consumers. */
  readonly finals: readonly string[];
  /** Per-syllable tone 0-4 (zh-specific; 0 = 轻声). Same length as `finals`. */
  readonly tones?: readonly number[];
  /** Per-syllable stress (en-specific, future). */
  readonly stress?: readonly number[];
  /** Per-syllable pinyin with tone ("chūn","nuǎn",...) / ARPABET / mora /
   *  hangul — language-agnostic surface form. */
  readonly pinyinWithTone?: readonly string[];
  /** Word-level tokenization + POS tags. Empty for seed entries. */
  readonly segments?: readonly WordSegment[];
  /** Quality score 0..1. Hand-curated seed entries default to 0.8. */
  readonly quality: number;
  /** Coarse category labels (idiom, lyric, modern, tech, …). */
  readonly tags: readonly string[];
  /** Provenance label (e.g., "xinhua-idiom", "chinese-poetry/tang", …). */
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
