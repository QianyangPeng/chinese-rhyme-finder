/**
 * 十三辙 — the traditional 13-rhyme system used in 北方曲艺, 京剧, 相声,
 * 评书. This scheme is kept for users who explicitly want the曲艺
 * convention (common in older rap, and some northern opera genres).
 *
 * Since we now encode apical-i (the vowel in zhi/chi/shi/ri/zi/ci/si) as
 * the distinct final "-i" in the decomposer, this table maps BOTH "-i"
 * and "i" into 一七辙, and keeps er there too — preserving the 14-way-
 * merged-into-13 behavior of the traditional scheme.
 *
 * If you want to HEAR apical-i and regular-i as different rhymes (which
 * matches how modern Mandarin speakers actually perceive 只 vs 李), use
 * the 中华新韵 scheme instead; it's the current default.
 */

import type { RhymeScheme } from '../types.js';

export const SHISANZHE = {
  ZHONGDONG: '中东辙',
  JIANGYANG: '江阳辙',
  YIQI:      '一七辙',
  HUIDUI:    '灰堆辙',
  HUAILAI:   '怀来辙',
  YAOTIAO:   '遥条辙',
  YOUQIU:    '由求辙',
  YANQIAN:   '言前辙',
  RENCHEN:   '人辰辙',
  SUOBO:     '梭波辙',
  FAHUA:     '发花辙',
  NIEXIE:    '乜斜辙',
  GUSU:      '姑苏辙'
} as const;

/** Canonical final → 辙 name. Finals not present here fall through to ''. */
const FINAL_TO_ZHE: Record<string, string> = {
  // 中东辙
  'eng':  SHISANZHE.ZHONGDONG,
  'ing':  SHISANZHE.ZHONGDONG,
  'ong':  SHISANZHE.ZHONGDONG,
  'iong': SHISANZHE.ZHONGDONG,
  'ueng': SHISANZHE.ZHONGDONG,

  // 江阳辙
  'ang':  SHISANZHE.JIANGYANG,
  'iang': SHISANZHE.JIANGYANG,
  'uang': SHISANZHE.JIANGYANG,

  // 一七辙: traditional grouping lumps apical-i with regular i and ü + er.
  'i':    SHISANZHE.YIQI,
  '-i':   SHISANZHE.YIQI,
  'ü':    SHISANZHE.YIQI,
  'er':   SHISANZHE.YIQI,

  // 灰堆辙
  'ei':   SHISANZHE.HUIDUI,
  'uei':  SHISANZHE.HUIDUI,

  // 怀来辙
  'ai':   SHISANZHE.HUAILAI,
  'uai':  SHISANZHE.HUAILAI,

  // 遥条辙
  'ao':   SHISANZHE.YAOTIAO,
  'iao':  SHISANZHE.YAOTIAO,

  // 由求辙
  'ou':   SHISANZHE.YOUQIU,
  'iou':  SHISANZHE.YOUQIU,

  // 言前辙
  'an':   SHISANZHE.YANQIAN,
  'ian':  SHISANZHE.YANQIAN,
  'uan':  SHISANZHE.YANQIAN,
  'üan':  SHISANZHE.YANQIAN,

  // 人辰辙
  'en':   SHISANZHE.RENCHEN,
  'in':   SHISANZHE.RENCHEN,
  'uen':  SHISANZHE.RENCHEN,
  'ün':   SHISANZHE.RENCHEN,

  // 梭波辙
  'e':    SHISANZHE.SUOBO,
  'o':    SHISANZHE.SUOBO,
  'uo':   SHISANZHE.SUOBO,

  // 发花辙
  'a':    SHISANZHE.FAHUA,
  'ia':   SHISANZHE.FAHUA,
  'ua':   SHISANZHE.FAHUA,

  // 乜斜辙
  'ie':   SHISANZHE.NIEXIE,
  'üe':   SHISANZHE.NIEXIE,

  // 姑苏辙
  'u':    SHISANZHE.GUSU
};

export const shisanzheScheme: RhymeScheme = {
  id: 'shisanzhe',
  name: '十三辙（曲艺传统）',
  keyOf(final: string): string {
    return FINAL_TO_ZHE[final] ?? '';
  }
};

/** Exposed for tests and for the loose scheme to extend. */
export const SHISANZHE_TABLE: Readonly<Record<string, string>> = FINAL_TO_ZHE;
