/** Public API of the corpus / lexicon / search layer. */

export type { PhraseRecord, Lexicon } from './types.js';
export type { SeedPhrase } from './seed-data.js';
export { SEED_PHRASES } from './seed-data.js';
export { buildLexicon, getDefaultLexicon } from './loader.js';
export {
  searchByFinals,
  type SearchHit,
  type SearchBucket,
  type SearchResult,
  type SearchOptions
} from './search.js';
