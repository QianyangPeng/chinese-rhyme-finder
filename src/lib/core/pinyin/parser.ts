/**
 * Top-level entry point: take a string (possibly mixed Chinese / English /
 * punctuation) and emit either a stream of typed tokens (`parsePhrase`) or
 * just the Chinese syllables in order (`parseSyllables`).
 *
 * Uses `pinyin-pro` for character → pinyin conversion so that 多音字 are
 * disambiguated by surrounding word context (jīn-zhāo "今朝" picks
 * `cháo` correctly when in idiom context, etc.).
 */

import { pinyin } from 'pinyin-pro';
import type { OtherCategory, ParseToken, Syllable } from './types.js';
import { normalizePinyin } from './normalizer.js';
import { decompose } from './decomposer.js';

/** True if `ch` falls in the basic CJK Unified Ideographs block. */
function isChineseChar(ch: string): boolean {
  if (ch.length === 0) return false;
  const code = ch.codePointAt(0)!;
  // Most common range first; extension A is also common.
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) || // Extension A
    (code >= 0x20000 && code <= 0x2a6df)  // Extension B (rare)
  );
}

/** Classify a non-Chinese character into a coarse category. */
function classifyOther(ch: string): OtherCategory {
  if (/^\s$/.test(ch)) return 'whitespace';
  if (/^\d$/.test(ch)) return 'digit';
  if (/^[A-Za-z]$/.test(ch)) return 'english';
  // Standard ASCII + common Chinese punctuation
  if (
    /^[!-/:-@[-`{-~]$/.test(ch) ||
    /^[、。！？；：（）「」『』《》【】〈〉…—–·]$/.test(ch)
  ) {
    return 'punct';
  }
  return 'other';
}

/**
 * Build a Syllable from a Chinese character + its raw pinyin from pinyin-pro.
 * If the pinyin cannot be normalized into a recognizable Mandarin syllable,
 * returns null and the caller emits a fallback "other" token.
 */
function buildSyllable(char: string, rawPinyin: string): Syllable | null {
  if (!rawPinyin) return null;
  const normalized = normalizePinyin(rawPinyin);
  const components = decompose(normalized.canonical);
  if (!components) return null;

  return {
    char,
    pinyin: normalized.canonical,
    pinyinWithTone: rawPinyin,
    tone: normalized.tone,
    initial: components.initial,
    final: components.final,
    medial: components.medial,
    nucleus: components.nucleus,
    coda: components.coda,
    erhua: normalized.erhua
  };
}

/**
 * Parse a string into an ordered token stream. Chinese characters become
 * `Syllable` tokens; everything else (English letters, digits, punctuation,
 * whitespace) becomes an `other` token labeled with its category.
 *
 * Strategy: walk the input by code points, gather consecutive runs of
 * Chinese characters, and pass each run as a unit to `pinyin-pro` so its
 * dictionary-based segmentation can disambiguate 多音字 in word context
 * (e.g., 长 in 长城 → cháng, in 长大 → zhǎng). Non-Chinese characters are
 * classified one at a time. This avoids relying on a fragile 1:1
 * char↔pinyin mapping when input mixes Chinese with English/punctuation.
 *
 * Empty input yields an empty array. Whitespace is preserved as tokens
 * (callers that don't care can filter on `category !== 'whitespace'`).
 */
export function parsePhrase(text: string): ParseToken[] {
  if (text.length === 0) return [];

  const tokens: ParseToken[] = [];
  const chars = Array.from(text); // code-point safe iteration

  let i = 0;
  while (i < chars.length) {
    if (isChineseChar(chars[i])) {
      // Collect a consecutive run of Chinese characters.
      let j = i;
      while (j < chars.length && isChineseChar(chars[j])) j++;
      const run = chars.slice(i, j).join('');

      // Pinyin-pro returns one entry per Chinese character within a pure-
      // Chinese input, with multi-char word context for 多音字.
      const pyArr = pinyin(run, {
        type: 'array',
        toneType: 'symbol',
        multiple: false
      });

      // Map each char in the run to its pinyin. If lengths drift (very
      // rare), fall back to 'other' for the unmatched tail.
      const pairLen = Math.min(j - i, pyArr.length);
      for (let k = 0; k < pairLen; k++) {
        const ch = chars[i + k];
        const syl = buildSyllable(ch, pyArr[k]);
        if (syl) {
          tokens.push({ kind: 'syllable', syllable: syl });
        } else {
          tokens.push({ kind: 'other', char: ch, category: 'other' });
        }
      }
      for (let k = pairLen; k < j - i; k++) {
        tokens.push({ kind: 'other', char: chars[i + k], category: 'other' });
      }
      i = j;
    } else {
      // Single non-Chinese character.
      tokens.push({
        kind: 'other',
        char: chars[i],
        category: classifyOther(chars[i])
      });
      i++;
    }
  }

  return tokens;
}

/**
 * Convenience: parse a string and return only the Chinese syllables, in
 * order. This is the form most rhyme-engine code wants.
 */
export function parseSyllables(text: string): Syllable[] {
  return parsePhrase(text)
    .filter((t): t is Extract<ParseToken, { kind: 'syllable' }> => t.kind === 'syllable')
    .map((t) => t.syllable);
}

/**
 * Convenience: extract just the finals (韵母) sequence from text. The most
 * common downstream operation — rhyme matchers compare these.
 */
export function extractFinals(text: string): string[] {
  return parseSyllables(text).map((s) => s.final);
}
