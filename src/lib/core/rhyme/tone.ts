/**
 * Tone-aware rhyme key composition.
 *
 * By default the rhyme schemes consider only 韵母 (final), so 江 (jiāng,
 * tone 1) and 讲 (jiǎng, tone 3) look identical — 江阳/江阳 in 中华新韵.
 * This is how most modern rap rhymes, and it's the right default.
 *
 * But richer alignment is possible:
 *   - 平仄 (level-vs-oblique): traditional classical poetry requires
 *     平 and 仄 don't cross-rhyme. Tones 1-2 are 平, 3-4 are 仄, 0 is
 *     usually grouped with 仄 for analysis purposes.
 *   - 全对齐 (exact-tone): every syllable in the rhyme must share the
 *     same tone — the tightest possible match. Rare in actual rap, but
 *     produces the most "locked in" feel when it happens.
 *
 * This module exposes `ToneMode` plus helpers that compose a
 * scheme-independent extension onto the normal rhyme-group key:
 *
 *   none:   "江阳"
 *   pingze: "江阳@平"   or   "江阳@仄"
 *   exact:  "江阳@1"   or   "江阳@2"   or   "江阳@3"  ...
 *
 * Downstream matchers then just do string equality on the extended
 * keys — no change to matcher / miner / search logic needed.
 */

import type { Syllable, Tone } from '../pinyin/types.js';
import type { RhymeScheme } from './types.js';

/** Available tone-match strictness levels. */
export type ToneMode = 'none' | 'pingze' | 'exact';

/** Human label for UI buttons. */
export const TONE_MODE_LABEL: Record<ToneMode, string> = {
  none:   '无视声调',
  pingze: '平仄',
  exact:  '全对齐'
};

/** Turn a tone number into its 平仄 category string. 0 (轻声) is
 *  conventionally treated as 仄 for analytical purposes. */
export function toneToPingze(tone: Tone): '平' | '仄' {
  return tone === 1 || tone === 2 ? '平' : '仄';
}

/**
 * Compose a single syllable's rhyme key under the given scheme + tone
 * mode. Returns '' when the scheme doesn't recognize the final — the
 * matcher treats empty keys as never-matching.
 */
export function composeKey(
  final: string,
  tone: Tone,
  scheme: RhymeScheme,
  mode: ToneMode
): string {
  const base = scheme.keyOf(final);
  if (!base) return '';
  if (mode === 'none') return base;
  if (mode === 'exact') return `${base}@${tone}`;
  return `${base}@${toneToPingze(tone)}`;
}

/** Project a syllable list onto its composed-key sequence. */
export function syllablesToKeys(
  syllables: readonly Syllable[],
  scheme: RhymeScheme,
  mode: ToneMode = 'none'
): string[] {
  return syllables.map((s) => composeKey(s.final, s.tone, scheme, mode));
}
