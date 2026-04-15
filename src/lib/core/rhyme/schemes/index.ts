/**
 * Built-in rhyme schemes, indexed by ID for runtime lookup.
 */

import type { RhymeScheme, RhymeSchemeId } from '../types.js';
import { strictScheme } from './strict.js';
import { shisanzheScheme } from './shisanzhe.js';
import { looseScheme } from './loose.js';
import { xinyunScheme } from './xinyun.js';

export { strictScheme, shisanzheScheme, looseScheme, xinyunScheme };
export { SHISANZHE, SHISANZHE_TABLE } from './shisanzhe.js';
export { XINYUN, XINYUN_TABLE } from './xinyun.js';

/**
 * Shipped schemes, listed from strictest to loosest — that's how the
 * Search / Discover / Analyze UIs lay them out and how most users think
 * about rhyme precision.
 *
 * 严式 is first because it's the reference standard (韵母 must match
 * character-for-character; it already distinguishes apical 只/zhi from
 * regular 李/li because they decompose to different final strings).
 *
 * 中华新韵 is the DEFAULT because it's the modern Mandarin authority
 * and matches ear perception for the vast majority of rap use cases.
 * 十三辙 is the曲艺 tradition (unifies 一七 + 支). 宽松 adds cross-辙
 * bridges on top of 十三辙 for aggressive rap.
 */
export const ALL_SCHEMES: ReadonlyArray<RhymeScheme> = [
  strictScheme,
  xinyunScheme,
  shisanzheScheme,
  looseScheme
];

/** The default scheme for new queries — modern Mandarin ear perception. */
export const DEFAULT_SCHEME_ID: RhymeSchemeId = 'xinyun';

const BY_ID: Readonly<Record<RhymeSchemeId, RhymeScheme>> = {
  strict: strictScheme,
  shisanzhe: shisanzheScheme,
  loose: looseScheme,
  xinyun: xinyunScheme
};

/** Look up a scheme by stable ID. Returns undefined for unknown IDs. */
export function getScheme(id: RhymeSchemeId): RhymeScheme {
  return BY_ID[id];
}
