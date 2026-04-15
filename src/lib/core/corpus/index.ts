/** Public API of the corpus / lexicon / search layer. */

export type { PhraseRecord, Lexicon } from './types.js';
export type { SeedPhrase } from './seed-data.js';
export { SEED_PHRASES } from './seed-data.js';
export {
  buildLexicon,
  getDefaultLexicon,
  ensureExtendedLexicon,
  getCurrentLexicon
} from './loader.js';
export {
  searchByFinals,
  searchByTail,
  type SearchHit,
  type SearchBucket,
  type SearchResult,
  type SearchOptions,
  type TailSearchHit,
  type TailSearchBucket,
  type TailSearchResult,
  type TailSearchOptions
} from './search.js';
