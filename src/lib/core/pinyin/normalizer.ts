/**
 * Convert surface pinyin (as written) to a canonical form suitable for
 * phonological analysis.
 *
 * Surface pinyin uses several spelling conventions that hide the underlying
 * phonemes:
 *
 *   - y- and w- are surface markers for null-initial syllables whose
 *     medial is i-, u-, or ü-.   "yi"/"wu"/"yu" are pure i/u/ü.
 *     "ya" = i+a, "wa" = u+a, "yue" = ü+e, etc.
 *   - After j/q/x, the spelling "u" actually represents ü.
 *   - Truncated finals: "iu" stands for iou, "ui" for uei, "un" for uen
 *     (only when an initial consonant is present).
 *   - The 儿化 suffix is written as a trailing -r appended to a syllable.
 *
 * This module reverses those conventions so the decomposer downstream
 * can work on a clean medial+nucleus+coda string.
 *
 * It also strips tone marks and records the tone separately. Both the
 * standard tone-marked vowels (ā, é, ǐ, ò, ǖ…) and the ASCII fallback
 * "v" (often used as a substitute for ü) are accepted on input.
 */

import type { Tone } from './types.js';

/** Map of tone-marked vowels to (base vowel, tone number). */
const TONE_MAP: Record<string, [string, Tone]> = {
  // a
  'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4],
  // e
  'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
  // i
  'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4],
  // o
  'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
  // u
  'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4],
  // ü
  'ǖ': ['ü', 1], 'ǘ': ['ü', 2], 'ǚ': ['ü', 3], 'ǜ': ['ü', 4]
};

export interface NormalizedPinyin {
  /** Canonical pinyin (no tone, no surface conventions, no erhua). */
  readonly canonical: string;
  /** Original lowercased surface form, before any normalization. */
  readonly surface: string;
  /** Tone 1-4, or 0 if unmarked / 轻声. */
  readonly tone: Tone;
  /** True if the input ended in -r and was not the syllable "er" itself. */
  readonly erhua: boolean;
}

/**
 * Strip tone marks from the input, returning the unmarked vowels and the
 * single tone number found (0 if none).
 *
 * If two tone marks appear (which should never happen in valid pinyin),
 * the last one wins — that is fine for our defensive use cases.
 */
function stripTone(s: string): { plain: string; tone: Tone } {
  let tone: Tone = 0;
  let out = '';
  for (const ch of s) {
    const mapped = TONE_MAP[ch];
    if (mapped) {
      out += mapped[0];
      tone = mapped[1];
    } else {
      out += ch;
    }
  }
  return { plain: out, tone };
}

/**
 * If the syllable ends in -r and is not the standalone "er", treat the
 * trailing r as 儿化 and remove it. Returns {core, erhua}.
 */
function stripErhua(s: string): { core: string; erhua: boolean } {
  if (s === 'er') return { core: 'er', erhua: false };
  if (s.length > 1 && s.endsWith('r')) {
    return { core: s.slice(0, -1), erhua: true };
  }
  return { core: s, erhua: false };
}

/**
 * Apply the y-/w-/jqx-u/truncated-final spelling conventions in reverse,
 * yielding the canonical phonological form.
 *
 * Examples (no tone, no erhua at this stage):
 *   yi → i        wu → u        yu → ü
 *   ya → ia       wa → ua       yue → üe
 *   you → iou     wei → uei     yuan → üan
 *   ying → ing    weng → ueng   yun → ün
 *   ju → jü       qu → qü       xu → xü
 *   liu → liou    gui → guei    lun → luen
 */
function applyConventions(s: string): string {
  if (s.length === 0) return s;

  // y- conventions (null initial, i-medial / ü-medial)
  if (s.startsWith('y')) {
    if (s === 'yi') return 'i';
    if (s === 'yin') return 'in';
    if (s === 'ying') return 'ing';
    if (s === 'yu') return 'ü';
    if (s.startsWith('yu')) return 'ü' + s.slice(2); // yue, yuan, yun
    return 'i' + s.slice(1); // ya, ye, yao, you, yan, yang, yong
  }

  // w- conventions (null initial, u-medial)
  if (s.startsWith('w')) {
    if (s === 'wu') return 'u';
    return 'u' + s.slice(1); // wa, wo, wai, wei, wan, wen, wang, weng
  }

  // After j/q/x, "u" is actually ü
  if (s.length >= 2 && /^[jqx]u/.test(s)) {
    return s[0] + 'ü' + s.slice(2);
  }

  // Truncated finals when an initial consonant precedes them.
  // (After the y-/w- handling above, anything still starting with a
  //  consonant counts as "has initial".)
  const initials = /^(b|p|m|f|d|t|n|l|g|k|h|j|q|x|zh|ch|sh|r|z|c|s)/;
  const m = s.match(initials);
  if (m) {
    const init = m[0];
    const rest = s.slice(init.length);
    if (rest === 'iu') return init + 'iou';
    if (rest === 'ui') return init + 'uei';
    if (rest === 'un') return init + 'uen';
  }

  return s;
}

/**
 * Normalize a single pinyin syllable to its canonical phonological form.
 *
 * Accepts:
 *   - tone-marked pinyin (jiāng, wéi, è)
 *   - tone-less pinyin (jiang, wei, e)
 *   - ASCII v as substitute for ü (lv → lü)
 *   - 儿化 -r suffix (huār → core "hua", erhua=true)
 *   - mixed casing
 *
 * Does NOT validate that the result is a real Mandarin syllable; the
 * decomposer handles that. Garbage in → returns canonical that may not
 * decompose; callers should treat such cases as "unknown".
 */
export function normalizePinyin(raw: string): NormalizedPinyin {
  const surface = raw.trim().toLowerCase();
  if (surface.length === 0) {
    return { canonical: '', surface: '', tone: 0, erhua: false };
  }

  // Substitute v → ü (common ASCII shortcut)
  const vReplaced = surface.replace(/v/g, 'ü');

  // Strip tone marks → plain vowels + tone number
  const { plain, tone } = stripTone(vReplaced);

  // Detect & strip 儿化
  const { core, erhua } = stripErhua(plain);

  // Apply spelling conventions to get phonological form
  const canonical = applyConventions(core);

  return { canonical, surface, tone, erhua };
}
