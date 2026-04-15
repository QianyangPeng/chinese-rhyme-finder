/**
 * 中华新韵 14 部 — the modern authoritative Chinese rhyme standard,
 * published by 中华诗词学会 in 2005. Designed ground-up for modern
 * Putonghua pronunciation; unlike 十三辙 (which was optimized for
 * 曲艺 stage delivery) it separates vowels that modern speakers
 * actually perceive as different.
 *
 * Key advantage for rap/现代诗 over 十三辙:
 *   - 齐 (i, ü) and 支 (apical -i, er) are SEPARATE — so 李 and 只
 *     do not rhyme (which matches modern ear perception). 十三辙 merges
 *     them all into 一七辙, which produces false positives in
 *     clustering (e.g. "寄迹山林" and "十二万分" wrongly look like they
 *     share a 2-押 prefix because apical and regular i both map to 一七).
 *
 * Group reference (name → included finals):
 *   1. 麻 mā     a, ia, ua
 *   2. 波 bō     o, e, uo
 *   3. 皆 jiē    ie, üe
 *   4. 开 kāi    ai, uai
 *   5. 微 wēi    ei, uei
 *   6. 豪 háo    ao, iao
 *   7. 尤 yóu    ou, iou
 *   8. 寒 hán    an, ian, uan, üan
 *   9. 文 wén    en, in, uen, ün
 *  10. 唐 táng   ang, iang, uang
 *  11. 庚 gēng   eng, ing, ong, iong
 *  12. 齐 qí     i, ü
 *  13. 支 zhī    -i (apical), er
 *  14. 姑 gū     u
 *
 * Source: 《中华新韵》 中华诗词学会 2005; cross-referenced with modern
 * scholarly treatments of Mandarin phonology for the er classification.
 */

import type { RhymeScheme } from '../types.js';

export const XINYUN = {
  MA:    '麻',
  BO:    '波',
  JIE:   '皆',
  KAI:   '开',
  WEI:   '微',
  HAO:   '豪',
  YOU:   '尤',
  HAN:   '寒',
  WEN:   '文',
  TANG:  '唐',
  GENG:  '庚',
  QI:    '齐',
  ZHI:   '支',
  GU:    '姑'
} as const;

const FINAL_TO_XINYUN: Record<string, string> = {
  // 麻
  'a':    XINYUN.MA,
  'ia':   XINYUN.MA,
  'ua':   XINYUN.MA,

  // 波
  'o':    XINYUN.BO,
  'e':    XINYUN.BO,
  'uo':   XINYUN.BO,

  // 皆
  'ie':   XINYUN.JIE,
  'üe':   XINYUN.JIE,

  // 开
  'ai':   XINYUN.KAI,
  'uai':  XINYUN.KAI,

  // 微
  'ei':   XINYUN.WEI,
  'uei':  XINYUN.WEI,

  // 豪
  'ao':   XINYUN.HAO,
  'iao':  XINYUN.HAO,

  // 尤
  'ou':   XINYUN.YOU,
  'iou':  XINYUN.YOU,

  // 寒
  'an':   XINYUN.HAN,
  'ian':  XINYUN.HAN,
  'uan':  XINYUN.HAN,
  'üan':  XINYUN.HAN,

  // 文
  'en':   XINYUN.WEN,
  'in':   XINYUN.WEN,
  'uen':  XINYUN.WEN,
  'ün':   XINYUN.WEN,

  // 唐
  'ang':  XINYUN.TANG,
  'iang': XINYUN.TANG,
  'uang': XINYUN.TANG,

  // 庚
  'eng':  XINYUN.GENG,
  'ing':  XINYUN.GENG,
  'ong':  XINYUN.GENG,
  'iong': XINYUN.GENG,
  'ueng': XINYUN.GENG,

  // 齐 — regular i and ü. Does NOT include apical -i.
  'i':    XINYUN.QI,
  'ü':    XINYUN.QI,

  // 支 — apical -i (zhi/chi/shi/ri/zi/ci/si) and er.
  '-i':   XINYUN.ZHI,
  'er':   XINYUN.ZHI,

  // 姑
  'u':    XINYUN.GU
};

export const xinyunScheme: RhymeScheme = {
  id: 'xinyun',
  name: '中华新韵（现代汉语）',
  keyOf(final: string): string {
    return FINAL_TO_XINYUN[final] ?? '';
  }
};

/** Exposed for tests. */
export const XINYUN_TABLE: Readonly<Record<string, string>> = FINAL_TO_XINYUN;
