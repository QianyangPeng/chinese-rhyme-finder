/**
 * 十三辙 — the traditional 13-rhyme system used in 北方曲艺, 京剧, 相声,
 * 评书 and most importantly modern Chinese hip-hop. Many distinct pinyin
 * finals share the same 辙 because they sound close enough to the ear.
 *
 * Source: standard 十三辙 lists found in 戏曲音韵 references and
 * cross-checked against rap-circle convention. Notes:
 *
 *   - 一七辙 includes the apical -i in zi/ci/si/zhi/chi/shi/ri (we keep
 *     the canonical final spelled "i" everywhere; the initial tells the
 *     two sounds apart but they ALL rhyme together in 一七辙).
 *   - 灰堆辙 is sometimes called "灰韵"; 怀来辙 is also "怀韵".
 *   - 梭波辙 (e/o/uo) merges colors that older sources kept apart;
 *     modern usage groups them.
 *   - er gets its own slot in 一七辙 (not a separate 辙).
 *   - The standalone "ueng" syllable is rare (only "weng") — we put it
 *     in 中东辙 to match conventional grouping.
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
  // 中东辙: -ng nasal codas with non-a nucleus
  'eng':  SHISANZHE.ZHONGDONG,
  'ing':  SHISANZHE.ZHONGDONG,
  'ong':  SHISANZHE.ZHONGDONG,
  'iong': SHISANZHE.ZHONGDONG,
  'ueng': SHISANZHE.ZHONGDONG,

  // 江阳辙: -ng nasal codas with a nucleus
  'ang':  SHISANZHE.JIANGYANG,
  'iang': SHISANZHE.JIANGYANG,
  'uang': SHISANZHE.JIANGYANG,

  // 一七辙: high front unrounded vowels (i, ü, er, and apical -i)
  'i':    SHISANZHE.YIQI,
  'ü':    SHISANZHE.YIQI,
  'er':   SHISANZHE.YIQI,

  // 灰堆辙: ei / uei
  'ei':   SHISANZHE.HUIDUI,
  'uei':  SHISANZHE.HUIDUI,

  // 怀来辙: ai / uai
  'ai':   SHISANZHE.HUAILAI,
  'uai':  SHISANZHE.HUAILAI,

  // 遥条辙: ao / iao
  'ao':   SHISANZHE.YAOTIAO,
  'iao':  SHISANZHE.YAOTIAO,

  // 由求辙: ou / iou
  'ou':   SHISANZHE.YOUQIU,
  'iou':  SHISANZHE.YOUQIU,

  // 言前辙: -n nasal codas with a nucleus
  'an':   SHISANZHE.YANQIAN,
  'ian':  SHISANZHE.YANQIAN,
  'uan':  SHISANZHE.YANQIAN,
  'üan':  SHISANZHE.YANQIAN,

  // 人辰辙: -n nasal codas with non-a nucleus
  'en':   SHISANZHE.RENCHEN,
  'in':   SHISANZHE.RENCHEN,
  'uen':  SHISANZHE.RENCHEN,
  'ün':   SHISANZHE.RENCHEN,

  // 梭波辙: e / o / uo
  'e':    SHISANZHE.SUOBO,
  'o':    SHISANZHE.SUOBO,
  'uo':   SHISANZHE.SUOBO,

  // 发花辙: a / ia / ua
  'a':    SHISANZHE.FAHUA,
  'ia':   SHISANZHE.FAHUA,
  'ua':   SHISANZHE.FAHUA,

  // 乜斜辙: ie / üe
  'ie':   SHISANZHE.NIEXIE,
  'üe':   SHISANZHE.NIEXIE,

  // 姑苏辙: u
  'u':    SHISANZHE.GUSU
};

export const shisanzheScheme: RhymeScheme = {
  id: 'shisanzhe',
  name: '十三辙',
  keyOf(final: string): string {
    return FINAL_TO_ZHE[final] ?? '';
  }
};

/** Exposed for tests and for the loose scheme to extend. */
export const SHISANZHE_TABLE: Readonly<Record<string, string>> = FINAL_TO_ZHE;
