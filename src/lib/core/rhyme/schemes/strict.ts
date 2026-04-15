/**
 * Strict scheme: each canonical final is its own rhyme group.
 *
 * Two syllables rhyme strictly iff their canonical finals match exactly
 * (e.g., "iang" only rhymes with "iang", not with "ang" or "uang").
 *
 * This is the most conservative scheme. Used for verifying tight rhymes
 * in classical-style verse, or when the user explicitly wants
 * "completely identical 韵母".
 */

import type { RhymeScheme } from '../types.js';

export const strictScheme: RhymeScheme = {
  id: 'strict',
  name: '严式（同韵母）',
  keyOf(final: string): string {
    // The final IS the key under strict matching.
    // Empty string maps to empty (e.g., for unknown / unparseable input).
    return final;
  }
};
