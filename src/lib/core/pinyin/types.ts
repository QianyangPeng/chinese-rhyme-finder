/**
 * Phonological types for Mandarin Chinese.
 *
 * A standard Mandarin syllable decomposes as:
 *   声母 (initial) + 韵头 (medial) + 韵腹 (nucleus) + 韵尾 (coda) + 声调 (tone)
 *
 * The "韵母" (final) is the concatenation: medial + nucleus + coda.
 *
 * For example, "姜" jiāng:
 *   initial = "j"
 *   medial  = "i"
 *   nucleus = "a"
 *   coda    = "ng"
 *   final   = "iang"
 *   tone    = 1
 */

/** Tone number. 0 = 轻声 (neutral). 1-4 = 阴平/阳平/上/去. */
export type Tone = 0 | 1 | 2 | 3 | 4;

/**
 * One Chinese syllable's full phonological decomposition.
 * `char` may be empty if the syllable was constructed from raw pinyin
 * rather than a Chinese character.
 */
export interface Syllable {
  /** Original character (or '' if from raw pinyin). */
  readonly char: string;
  /** Canonical pinyin without tone marks (e.g., "jiang", "uei"). */
  readonly pinyin: string;
  /** Pinyin with tone marks (e.g., "jiāng"). May be '' if unavailable. */
  readonly pinyinWithTone: string;
  /** Tone 1-4, or 0 for 轻声. */
  readonly tone: Tone;
  /** 声母, e.g., "j". Empty string for null-initial syllables (was "yi", "wu", "wei"…). */
  readonly initial: string;
  /** 韵母 = medial + nucleus + coda. e.g., "iang". */
  readonly final: string;
  /** 韵头, e.g., "i", "u", "ü", or "" if absent. */
  readonly medial: string;
  /** 韵腹, e.g., "a", "o", "e", "i", "u", "ü", "er". */
  readonly nucleus: string;
  /** 韵尾, e.g., "n", "ng", "i", "u", or "" if absent. */
  readonly coda: string;
  /** True if this syllable carries 儿化 (e.g., "huār"). */
  readonly erhua: boolean;
}

/** Categories the parser uses to label non-Chinese characters. */
export type OtherCategory = 'english' | 'punct' | 'digit' | 'whitespace' | 'other';

/**
 * Tagged union the parser emits — preserves input order, mixing Chinese
 * syllables with non-Chinese tokens (English words, punctuation, digits)
 * so callers can render mixed text faithfully and so future English-rhyming
 * code has something to bind to.
 */
export type ParseToken =
  | { readonly kind: 'syllable'; readonly syllable: Syllable }
  | { readonly kind: 'other'; readonly char: string; readonly category: OtherCategory };

/** True if pinyin (no tone marks) is in lowercase canonical form. */
export function isCanonicalPinyin(s: string): boolean {
  // Canonical: lowercase letters or ü, no spaces, no digits.
  return /^[a-zü]+$/.test(s);
}
