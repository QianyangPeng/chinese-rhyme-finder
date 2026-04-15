/** Public API of the reverse-analysis layer. */

export type {
  LineAnalysis,
  RhymePair,
  RhymeGroup,
  ReverseAnalysis
} from './types.js';

export { reverseAnalyze } from './reverse.js';
