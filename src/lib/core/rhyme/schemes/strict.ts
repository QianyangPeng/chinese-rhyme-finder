/**
 * Strict scheme: rhyme body = nucleus + coda (strip medial/glide).
 *
 * Two syllables rhyme iff their 韵身 (rhyme body) matches. The 韵头
 * (medial: i/u/ü glide before the main vowel) is excluded — this is
 * the universal consensus across 中华新韵, 十三辙, rap conventions,
 * and phonological theory:
 *
 *   妈 (a) ≡ 瓜 (ua) ≡ 家 (ia)     → rhyme body "a"
 *   飞 (ei) ≡ 归 (uei)              → rhyme body "ei"
 *   天 (ian) ≡ 山 (an) ≡ 关 (uan)   → rhyme body "an"
 *
 * Special cases:
 *   - `ie`/`üe` map to "ê" (NOT "e") — 夜≠歌. Matches 中华新韵
 *     三皆 vs 二波 split, and 十三辙 乜斜辙 vs 梭波辙.
 *   - `-i` stays "-i" (apical vowel after zh/ch/sh/r/z/c/s) — 只≠李.
 */

import type { RhymeScheme } from '../types.js';

/**
 * Static map: canonical final → rhyme body (nucleus + coda).
 * Built from FINAL_DECOMPOSE in decomposer.ts with medials stripped.
 */
const RHYME_BODY: Record<string, string> = {
  // ── No medial: final IS the rhyme body ──
  'a':    'a',
  'o':    'o',
  'e':    'e',
  'i':    'i',
  'u':    'u',
  'ü':    'ü',
  'er':   'er',
  '-i':   '-i',   // apical-i: distinct from regular i

  // ── Diphthongs (no medial) ──
  'ai':   'ai',
  'ei':   'ei',
  'ao':   'ao',
  'ou':   'ou',

  // ── Nasal codas (no medial) ──
  'an':   'an',
  'en':   'en',
  'ang':  'ang',
  'eng':  'eng',
  'ong':  'ong',

  // ── i-medial → strip i ──
  'ia':   'a',    // 家 rhymes with 妈
  'ie':   'ê',    // 夜 does NOT rhyme with 歌 (different vowel quality)
  'iao':  'ao',   // 笑 rhymes with 高
  'iou':  'ou',   // 牛 rhymes with 头
  'ian':  'an',   // 天 rhymes with 山
  'in':   'in',   // 心: i is nucleus here (no medial)
  'iang': 'ang',  // 江 rhymes with 光
  'ing':  'ing',  // 星: i is nucleus here
  'iong': 'ong',  // 穷 rhymes with 中

  // ── u-medial → strip u ──
  'ua':   'a',    // 瓜 rhymes with 妈
  'uo':   'o',    // 多 rhymes with 波
  'uai':  'ai',   // 快 rhymes with 来
  'uei':  'ei',   // 归 rhymes with 飞
  'uan':  'an',   // 关 rhymes with 山
  'uen':  'en',   // 论 rhymes with 门
  'uang': 'ang',  // 黄 rhymes with 光
  'ueng': 'eng',  // 翁 rhymes with 风

  // ── ü-medial → strip ü ──
  'üe':   'ê',    // 月 does NOT rhyme with 歌 (same treatment as ie)
  'üan':  'an',   // 圆 rhymes with 山
  'ün':   'ün',   // 军: ü is nucleus here (no medial)
};

export const strictScheme: RhymeScheme = {
  id: 'strict',
  name: '严式（同韵身）',
  keyOf(final: string): string {
    if (!final) return '';
    return RHYME_BODY[final] ?? final;
  }
};
