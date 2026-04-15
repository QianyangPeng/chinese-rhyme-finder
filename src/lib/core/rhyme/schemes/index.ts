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
 * User-facing schemes — kept deliberately small. After user feedback
 * that the "looser" schemes (中华新韵 / 十三辙 / 宽松邻韵) often
 * surfaced candidates that don't actually sound like rhymes, the UI
 * ships **only 严式**. Tonal strictness is layered via `ToneMode`
 * (see tone.ts) so users pick 韵母-only vs 韵母+声调 via a separate
 * toggle instead of scheme selection.
 *
 * The three removed schemes stay exported for URL backward compat —
 * anyone with an older shareable link under ?scheme=xinyun etc.
 * still resolves, but the ScreenSchemeSelector only lists 严式.
 */
export const ALL_SCHEMES: ReadonlyArray<RhymeScheme> = [strictScheme];

/** Every known scheme, including the ones hidden from the UI. Used by
 *  backward-compat URL parsers and rare power-user queries. */
export const ALL_KNOWN_SCHEMES: ReadonlyArray<RhymeScheme> = [
  strictScheme,
  xinyunScheme,
  shisanzheScheme,
  looseScheme
];

/** The default scheme — strict 韵母 matching. */
export const DEFAULT_SCHEME_ID: RhymeSchemeId = 'strict';

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
