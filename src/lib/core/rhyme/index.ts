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
  DEFAULT_SCHEME_ID,
  getScheme,
  strictScheme,
  shisanzheScheme,
  looseScheme,
  xinyunScheme,
  SHISANZHE,
  SHISANZHE_TABLE,
  XINYUN,
  XINYUN_TABLE
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

export {
  composeKey,
  syllablesToKeys,
  toneToPingze,
  TONE_MODE_LABEL
} from './tone.js';
export type { ToneMode } from './tone.js';
