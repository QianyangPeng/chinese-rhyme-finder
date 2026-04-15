/**
 * Bootstrap seed lexicon — ~200 hand-picked phrases covering the major
 * 十三辙 ending groups, mixing idioms, modern phrases, sci-fi/cultural
 * terms, lyric-style fragments, and famous-name compositions.
 *
 * Goal: every common rhyme position has *something* to retrieve, so the
 * Search mode is demonstrably useful even before the full Python data
 * pipeline (P1.4) ships a real corpus. Each entry is intended to be
 * non-garbage — usable in actual writing.
 *
 * Quality field is omitted here; the loader assigns a flat 0.8 to every
 * entry. The proper per-entry quality score will come with P1.4.
 */

export interface SeedPhrase {
  text: string;
  /** Coarse category tags. */
  tags: readonly string[];
}

export const SEED_PHRASES: SeedPhrase[] = [
  // ─── 江阳辙 / 言前辙 endings (-ang / -an) ────────────────────────
  { text: '一帆风顺', tags: ['idiom'] },
  { text: '春暖花开', tags: ['idiom'] },
  { text: '安居乐业', tags: ['idiom'] },
  { text: '光明正大', tags: ['idiom'] },
  { text: '相对华丽', tags: ['modern', 'lyric'] },
  { text: '降维打击', tags: ['scifi', 'lyric'] },
  { text: '想为打击', tags: ['lyric'] },
  { text: '姜维的戏', tags: ['cultural', 'lyric'] },
  { text: '将军在上', tags: ['cultural'] },
  { text: '量子纠缠', tags: ['scifi'] },
  { text: '降龙十八掌', tags: ['cultural', 'wuxia'] },
  { text: '放眼天下', tags: ['general'] },
  { text: '阳光灿烂', tags: ['general'] },
  { text: '想入非非', tags: ['idiom'] },
  { text: '强词夺理', tags: ['idiom'] },
  { text: '荡气回肠', tags: ['idiom'] },
  { text: '万水千山', tags: ['idiom'] },
  { text: '大江南北', tags: ['general'] },
  { text: '将计就计', tags: ['idiom'] },
  { text: '香车宝马', tags: ['idiom'] },

  // ─── 中东辙 / 人辰辙 endings (-eng/-ing/-ong / -en/-in/-un) ──────
  { text: '一心一意', tags: ['idiom'] },
  { text: '万众一心', tags: ['idiom'] },
  { text: '齐心协力', tags: ['idiom'] },
  { text: '风风雨雨', tags: ['general'] },
  { text: '乘风破浪', tags: ['idiom'] },
  { text: '惊心动魄', tags: ['idiom'] },
  { text: '英雄好汉', tags: ['general'] },
  { text: '心想事成', tags: ['idiom'] },
  { text: '功成名就', tags: ['idiom'] },
  { text: '风雨同舟', tags: ['idiom'] },
  { text: '众志成城', tags: ['idiom'] },
  { text: '叶公好龙', tags: ['idiom'] },
  { text: '画龙点睛', tags: ['idiom'] },
  { text: '腾云驾雾', tags: ['idiom'] },
  { text: '九霄云外', tags: ['idiom'] },
  { text: '梦想成真', tags: ['general'] },
  { text: '前程似锦', tags: ['idiom'] },
  { text: '日新月异', tags: ['idiom'] },
  { text: '推陈出新', tags: ['idiom'] },
  { text: '喜新厌旧', tags: ['idiom'] },

  // ─── 一七辙 endings (-i / -ü / -er) ──────────────────────────────
  { text: '岁月静好', tags: ['general'] },
  { text: '岁月如梭', tags: ['idiom'] },
  { text: '不可思议', tags: ['idiom'] },
  { text: '从头开始', tags: ['general'] },
  { text: '名利双收', tags: ['idiom'] },
  { text: '人生如戏', tags: ['general'] },
  { text: '量子位移', tags: ['scifi'] },
  { text: '原地起飞', tags: ['modern'] },
  { text: '降维秒杀', tags: ['scifi', 'modern'] },
  { text: '高维博弈', tags: ['scifi'] },
  { text: '知己知彼', tags: ['idiom'] },
  { text: '千里之行', tags: ['idiom'] },
  { text: '万里长城', tags: ['cultural'] },
  { text: '诡谲机变', tags: ['cultural'] },
  { text: '风雷激荡', tags: ['general'] },

  // ─── 灰堆辙 endings (-ei/-ui) ────────────────────────────────────
  { text: '北京见鬼', tags: ['modern'] },
  { text: '吃饱喝醉', tags: ['modern'] },
  { text: '心力交瘁', tags: ['idiom'] },
  { text: '花蕊将萎', tags: ['general'] },
  { text: '黑白分明', tags: ['idiom'] },
  { text: '一日为师', tags: ['idiom'] },
  { text: '海阔天空', tags: ['idiom'] },
  { text: '推心置腹', tags: ['idiom'] },
  { text: '虎背熊腰', tags: ['idiom'] },
  { text: '炉火纯青', tags: ['idiom'] },

  // ─── 怀来辙 endings (-ai/-uai) ──────────────────────────────────
  { text: '星辰大海', tags: ['lyric', 'modern'] },
  { text: '银河大队', tags: ['general'] },
  { text: '与众不同', tags: ['idiom'] },
  { text: '黑白通吃', tags: ['general'] },
  { text: '天涯海角', tags: ['idiom'] },
  { text: '势如破竹', tags: ['idiom'] },
  { text: '风云变幻', tags: ['idiom'] },
  { text: '波涛澎湃', tags: ['idiom'] },
  { text: '尘埃落定', tags: ['idiom'] },
  { text: '情深似海', tags: ['idiom'] },

  // ─── 遥条辙 endings (-ao/-iao) ──────────────────────────────────
  { text: '出神入化', tags: ['idiom'] },
  { text: '千娇百媚', tags: ['idiom'] },
  { text: '风骚至极', tags: ['general'] },
  { text: '高瞻远瞩', tags: ['idiom'] },
  { text: '肝肠寸断', tags: ['idiom'] },
  { text: '热火朝天', tags: ['idiom'] },
  { text: '乘风波涛', tags: ['general'] },
  { text: '波澜不惊', tags: ['idiom'] },
  { text: '星光熠熠', tags: ['general'] },
  { text: '花枝招展', tags: ['idiom'] },

  // ─── 由求辙 endings (-ou/-iou) ──────────────────────────────────
  { text: '风雨无阻', tags: ['general'] },
  { text: '一败涂地', tags: ['idiom'] },
  { text: '万古流芳', tags: ['idiom'] },
  { text: '细水长流', tags: ['idiom'] },
  { text: '川流不息', tags: ['idiom'] },
  { text: '长江后浪', tags: ['general'] },
  { text: '前赴后继', tags: ['idiom'] },
  { text: '锦绣前程', tags: ['idiom'] },
  { text: '九九归一', tags: ['general'] },
  { text: '酒后失言', tags: ['general'] },

  // ─── 梭波辙 endings (-e/-o/-uo) ─────────────────────────────────
  { text: '海阔山遥', tags: ['general'] },
  { text: '与人为乐', tags: ['general'] },
  { text: '安然无恙', tags: ['idiom'] },
  { text: '酒入愁肠', tags: ['lyric'] },
  { text: '落叶归根', tags: ['idiom'] },
  { text: '奔波劳碌', tags: ['general'] },
  { text: '风情万种', tags: ['idiom'] },
  { text: '世外桃源', tags: ['idiom'] },
  { text: '波光粼粼', tags: ['general'] },
  { text: '桑田沧海', tags: ['idiom'] },

  // ─── 发花辙 endings (-a/-ia/-ua) ────────────────────────────────
  { text: '惊天动地', tags: ['idiom'] },
  { text: '排山倒海', tags: ['idiom'] },
  { text: '电闪雷鸣', tags: ['idiom'] },
  { text: '风驰电掣', tags: ['idiom'] },
  { text: '震耳欲聋', tags: ['idiom'] },
  { text: '哇塞牛掰', tags: ['modern'] },
  { text: '天花乱坠', tags: ['idiom'] },
  { text: '锦上添花', tags: ['idiom'] },
  { text: '雪上加霜', tags: ['idiom'] },
  { text: '惊涛骇浪', tags: ['idiom'] },

  // ─── 乜斜辙 endings (-ie/-üe) ───────────────────────────────────
  { text: '一目了然', tags: ['idiom'] },
  { text: '风花雪月', tags: ['idiom'] },
  { text: '怦然心动', tags: ['idiom'] },
  { text: '心潮澎湃', tags: ['idiom'] },
  { text: '九死一生', tags: ['idiom'] },
  { text: '功亏一篑', tags: ['idiom'] },
  { text: '众目睽睽', tags: ['idiom'] },
  { text: '众星捧月', tags: ['idiom'] },
  { text: '白头偕老', tags: ['idiom'] },
  { text: '坚贞不屈', tags: ['idiom'] },

  // ─── 姑苏辙 endings (-u) ────────────────────────────────────────
  { text: '玉树临风', tags: ['idiom'] },
  { text: '高高在上', tags: ['general'] },
  { text: '云开雾散', tags: ['general'] },
  { text: '天昏地暗', tags: ['idiom'] },
  { text: '势不可挡', tags: ['idiom'] },
  { text: '一夫当关', tags: ['idiom'] },
  { text: '盖世无双', tags: ['idiom'] },
  { text: '万夫莫敌', tags: ['idiom'] },

  // ─── Mixed: famous names, modern phrases, longer fragments ──────
  { text: '李白', tags: ['name', 'cultural'] },
  { text: '杜甫', tags: ['name', 'cultural'] },
  { text: '诸葛亮', tags: ['name', 'cultural'] },
  { text: '姜维', tags: ['name', 'cultural'] },
  { text: '周瑜', tags: ['name', 'cultural'] },
  { text: '关云长', tags: ['name', 'cultural'] },
  { text: '北京', tags: ['place'] },
  { text: '上海', tags: ['place'] },
  { text: '广州', tags: ['place'] },
  { text: '中关村', tags: ['place'] },
  { text: '陆家嘴', tags: ['place'] },
  { text: '硅谷', tags: ['place', 'tech'] },
  { text: '区块链', tags: ['tech', 'modern'] },
  { text: '元宇宙', tags: ['tech', 'modern'] },
  { text: '人工智能', tags: ['tech'] },
  { text: '机器学习', tags: ['tech'] },
  { text: '神经网络', tags: ['tech'] },
  { text: '大数据', tags: ['tech'] },
  { text: '云计算', tags: ['tech'] },
  { text: '黑天鹅', tags: ['modern'] },
  { text: '内卷', tags: ['modern'] },
  { text: '躺平', tags: ['modern'] },
  { text: '佛系', tags: ['modern'] },
  { text: '断舍离', tags: ['modern'] },
  { text: '社畜', tags: ['modern'] },
  { text: '内耗', tags: ['modern'] },
  { text: 'PUA', tags: ['modern'] },
  { text: '凡尔赛', tags: ['modern'] },
  { text: '宇宙尽头', tags: ['modern'] },
  { text: '退退退', tags: ['modern'] },
  { text: '已读不回', tags: ['modern'] },
  { text: '正能量', tags: ['modern'] },
  { text: '小确幸', tags: ['modern'] },
  { text: '逆袭人生', tags: ['modern'] },

  // ─── Lyric fragments / poetic ───────────────────────────────────
  { text: '青青子衿', tags: ['classical', 'lyric'] },
  { text: '悠悠我心', tags: ['classical', 'lyric'] },
  { text: '床前明月', tags: ['classical'] },
  { text: '低头思乡', tags: ['classical'] },
  { text: '海上明月', tags: ['classical'] },
  { text: '天涯共此', tags: ['classical'] },
  { text: '春风又绿', tags: ['classical'] },
  { text: '江南岸边', tags: ['general'] },
  { text: '满城风絮', tags: ['classical'] },
  { text: '梅子黄时', tags: ['classical'] },

  // Extra short rhyme-rich items for diverse coverage
  { text: '高山流水', tags: ['idiom'] },
  { text: '心有灵犀', tags: ['idiom'] },
  { text: '海纳百川', tags: ['idiom'] },
  { text: '日月同辉', tags: ['idiom'] },
  { text: '风云际会', tags: ['idiom'] },
  { text: '势不两立', tags: ['idiom'] },
  { text: '相得益彰', tags: ['idiom'] },
  { text: '相辅相成', tags: ['idiom'] },
  { text: '相安无事', tags: ['idiom'] },
  { text: '相敬如宾', tags: ['idiom'] },
  { text: '想入非非', tags: ['idiom'] },
  { text: '相思成灾', tags: ['general'] },
  { text: '杯酒言欢', tags: ['general'] },
  { text: '推杯换盏', tags: ['idiom'] },
  { text: '把酒言欢', tags: ['idiom'] },
  { text: '剑指苍穹', tags: ['general', 'lyric'] },
  { text: '剑走偏锋', tags: ['idiom'] },
  { text: '剑拔弩张', tags: ['idiom'] }
];
