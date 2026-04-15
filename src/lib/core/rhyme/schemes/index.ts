/**
 * Built-in rhyme schemes, indexed by ID for runtime lookup.
 */

import type { RhymeScheme, RhymeSchemeId } from '../types.js';
import { strictScheme } from './strict.js';
import { shisanzheScheme } from './shisanzhe.js';
import { looseScheme } from './loose.js';

export { strictScheme, shisanzheScheme, looseScheme };
export { SHISANZHE, SHISANZHE_TABLE } from './shisanzhe.js';

export const ALL_SCHEMES: ReadonlyArray<RhymeScheme> = [
  strictScheme,
  shisanzheScheme,
  looseScheme
];

const BY_ID: Readonly<Record<RhymeSchemeId, RhymeScheme>> = {
  strict: strictScheme,
  shisanzhe: shisanzheScheme,
  loose: looseScheme
};

/** Look up a scheme by stable ID. Returns undefined for unknown IDs. */
export function getScheme(id: RhymeSchemeId): RhymeScheme {
  return BY_ID[id];
}
