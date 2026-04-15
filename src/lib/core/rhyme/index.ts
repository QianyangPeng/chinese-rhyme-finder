/**
 * Public API of the rhyme matching layer.
 */

export type {
  RhymeScheme,
  RhymeSchemeId,
  RhymeKeySequence
} from './types.js';

export {
  ALL_SCHEMES,
  getScheme,
  strictScheme,
  shisanzheScheme,
  looseScheme,
  SHISANZHE,
  SHISANZHE_TABLE
} from './schemes/index.js';

export {
  matchFull,
  matchTail,
  matchHead,
  keysFor
} from './matcher.js';
export type { RhymeMatch } from './matcher.js';

export {
  binByRelaxation,
  nonEmptyBins
} from './relaxation.js';
export type { RelaxationBin, RelaxationResult } from './relaxation.js';
