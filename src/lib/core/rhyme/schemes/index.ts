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
 * Shipped schemes, listed in the order users see them. 中华新韵 is
 * listed FIRST (and is the default) because it represents modern
 * Mandarin rhyme perception authoritatively. 十三辙 kept for 曲艺
 * users, 严式 for pedagogical strictness, 宽松 for aggressive rap.
 */
export const ALL_SCHEMES: ReadonlyArray<RhymeScheme> = [
  xinyunScheme,
  shisanzheScheme,
  strictScheme,
  looseScheme
];

/** The default scheme for new queries. */
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
