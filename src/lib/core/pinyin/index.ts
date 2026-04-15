/**
 * Public API of the pinyin pipeline.
 *
 * Typical usage:
 *
 *   import { extractFinals, parseSyllables } from '$core/pinyin';
 *
 *   extractFinals('姜维的戏');      // ['iang', 'uei', 'e', 'i']
 *   parseSyllables('降维打击');     // [{ char:'降', initial:'j', final:'iang', ... }, ...]
 */

export type {
  Tone,
  Syllable,
  ParseToken,
  OtherCategory
} from './types.js';

export { normalizePinyin } from './normalizer.js';
export type { NormalizedPinyin } from './normalizer.js';

export { decompose, VALID_FINALS } from './decomposer.js';
export type { Decomposed } from './decomposer.js';

export { parsePhrase, parseSyllables, extractFinals } from './parser.js';
