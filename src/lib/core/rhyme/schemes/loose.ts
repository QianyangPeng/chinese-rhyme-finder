/**
 * 宽松邻韵 (loose neighbor-rhyme) scheme.
 *
 * Builds on top of 十三辙 with a few inter-辙 bridges that match the way
 * modern Chinese rap actually rhymes — pairs that sound close enough to
 * the ear that listeners experience them as the same rhyme:
 *
 *   - 中东辙 ↔ 人辰辙        (-ng vs -n with the same vowel: eng/en, ing/in)
 *     Common in rap, especially in Northern accents.
 *   - 江阳辙 ↔ 言前辙        (ang/an, iang/ian, uang/uan)
 *     Looser, used when really pushing for a multi-syllable match.
 *   - 灰堆辙 ↔ 一七辙        (ei/ui rhyming with i/ü via the high-front feel)
 *     Less universal but appears in skilled freestyle.
 *
 * We model these as merged super-groups: members of a bridge share a
 * single group key. If a final isn't bridged, the key is its 辙.
 */

import type { RhymeScheme } from '../types.js';
import { SHISANZHE_TABLE } from './shisanzhe.js';

/**
 * Bridges: list of arrays of 辙 names that should collapse together
 * under loose matching.
 */
const BRIDGES: ReadonlyArray<readonly string[]> = [
  ['中东辙', '人辰辙'],
  ['江阳辙', '言前辙']
  // Note: 灰堆辙↔一七辙 omitted for now — felt too aggressive in preliminary
  // judgement. Easy to enable later by adding ['灰堆辙', '一七辙'].
];

/** Build a 辙 → super-group key mapping from the bridges. */
function buildSuperGroupMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const bridge of BRIDGES) {
    const key = bridge.join('+'); // e.g., '中东辙+人辰辙'
    for (const zhe of bridge) {
      map[zhe] = key;
    }
  }
  return map;
}

const SUPER_GROUP_MAP: Readonly<Record<string, string>> = buildSuperGroupMap();

export const looseScheme: RhymeScheme = {
  id: 'loose',
  name: '宽松邻韵',
  keyOf(final: string): string {
    const zhe = SHISANZHE_TABLE[final];
    if (!zhe) return '';
    return SUPER_GROUP_MAP[zhe] ?? zhe;
  }
};
