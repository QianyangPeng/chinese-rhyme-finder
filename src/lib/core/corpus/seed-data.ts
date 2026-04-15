/**
 * Seed lexicon aggregator — combines all category files into the single
 * `SEED_PHRASES` list that the Lexicon builder consumes.
 *
 * Individual categories live in `seeds/*.ts` for maintainability; add or
 * remove entries there, not here. The loader de-dupes identical text
 * entries automatically, so overlap between categories is harmless.
 *
 * Phase 1 goal: ~500-800 hand-picked high-quality entries covering the
 * 13 辙. Phase 1.4's Python pipeline will replace this with a real corpus
 * of ~50k phrases sourced from public lyrics / idiom dictionaries /
 * trending word lists.
 */

export interface SeedPhrase {
  readonly text: string;
  readonly tags: readonly string[];
}

import { IDIOM_PHRASES } from './seeds/idioms.js';
import { MODERN_PHRASES } from './seeds/modern.js';
import { CULTURAL_PHRASES } from './seeds/cultural.js';
import { CLASSICAL_PHRASES } from './seeds/classical.js';
import { TECH_PLACES_PHRASES } from './seeds/tech-places.js';

/**
 * A small, eclectic set of extra seed entries that don't fit neatly into
 * any of the category files — usually short high-frequency phrases, famous
 * rap-friendly fragments, or filler that helps Discover produce interesting
 * cross-domain clusters. Keep this list SHORT; prefer adding to a
 * category file when the right one exists.
 */
const MISC_PHRASES: SeedPhrase[] = [
  // Rap-style cores that were originally hard-coded in v0.
  { text: '相对华丽', tags: ['modern', 'lyric'] },
  { text: '降维打击', tags: ['scifi', 'lyric'] },
  { text: '想为打击', tags: ['lyric'] },
  { text: '姜维的戏', tags: ['cultural', 'lyric'] },
  { text: '量子位移', tags: ['scifi', 'tech'] },
  { text: '降维秒杀', tags: ['scifi', 'modern'] },
  { text: '高维博弈', tags: ['scifi'] },
  { text: '星辰大海', tags: ['modern', 'lyric'] },
  { text: '银河大队', tags: ['general'] },
  { text: '原地起飞', tags: ['modern'] },
  { text: '凡尔赛', tags: ['modern'] },
  { text: '真香', tags: ['modern'] },
  { text: '社畜', tags: ['modern'] },
  { text: '内卷', tags: ['modern'] },
  { text: '躺平', tags: ['modern'] },
  { text: '摆烂', tags: ['modern'] },
  { text: '佛系', tags: ['modern'] },
  { text: '断舍离', tags: ['modern'] },
  { text: '小确幸', tags: ['modern'] },
  { text: '逆袭', tags: ['modern'] }
];

export const SEED_PHRASES: SeedPhrase[] = [
  ...IDIOM_PHRASES,
  ...MODERN_PHRASES,
  ...CULTURAL_PHRASES,
  ...CLASSICAL_PHRASES,
  ...TECH_PLACES_PHRASES,
  ...MISC_PHRASES
];
