/**
 * 文化 · 人名 · IP · 武侠 · 三国 · 二次元 ·  神话.
 * The "named entity" layer. These combine with ordinary verbs /
 * adjectives to produce creative multi-syllable rhyme cores, following
 * the pattern the user flagged with "姜维的戏" / "降维打击".
 */

import type { SeedPhrase } from '../seed-data.js';

export const CULTURAL_PHRASES: SeedPhrase[] = [
  // 三国人物
  { text: '曹操', tags: ['cultural', 'sanguo', 'name'] },
  { text: '刘备', tags: ['cultural', 'sanguo', 'name'] },
  { text: '孙权', tags: ['cultural', 'sanguo', 'name'] },
  { text: '诸葛亮', tags: ['cultural', 'sanguo', 'name'] },
  { text: '周瑜', tags: ['cultural', 'sanguo', 'name'] },
  { text: '姜维', tags: ['cultural', 'sanguo', 'name'] },
  { text: '司马懿', tags: ['cultural', 'sanguo', 'name'] },
  { text: '关羽', tags: ['cultural', 'sanguo', 'name'] },
  { text: '张飞', tags: ['cultural', 'sanguo', 'name'] },
  { text: '赵云', tags: ['cultural', 'sanguo', 'name'] },
  { text: '黄忠', tags: ['cultural', 'sanguo', 'name'] },
  { text: '马超', tags: ['cultural', 'sanguo', 'name'] },
  { text: '吕布', tags: ['cultural', 'sanguo', 'name'] },
  { text: '貂蝉', tags: ['cultural', 'sanguo', 'name'] },
  { text: '董卓', tags: ['cultural', 'sanguo', 'name'] },
  { text: '袁绍', tags: ['cultural', 'sanguo', 'name'] },
  { text: '庞统', tags: ['cultural', 'sanguo', 'name'] },
  { text: '法正', tags: ['cultural', 'sanguo', 'name'] },
  { text: '陆逊', tags: ['cultural', 'sanguo', 'name'] },
  { text: '鲁肃', tags: ['cultural', 'sanguo', 'name'] },

  // 水浒/武侠人物
  { text: '宋江', tags: ['cultural', 'water-margin', 'name'] },
  { text: '林冲', tags: ['cultural', 'water-margin', 'name'] },
  { text: '武松', tags: ['cultural', 'water-margin', 'name'] },
  { text: '鲁智深', tags: ['cultural', 'water-margin', 'name'] },
  { text: '李逵', tags: ['cultural', 'water-margin', 'name'] },
  { text: '燕青', tags: ['cultural', 'water-margin', 'name'] },
  { text: '郭靖', tags: ['cultural', 'wuxia', 'name'] },
  { text: '黄蓉', tags: ['cultural', 'wuxia', 'name'] },
  { text: '杨过', tags: ['cultural', 'wuxia', 'name'] },
  { text: '小龙女', tags: ['cultural', 'wuxia', 'name'] },
  { text: '令狐冲', tags: ['cultural', 'wuxia', 'name'] },
  { text: '任我行', tags: ['cultural', 'wuxia', 'name'] },
  { text: '东方不败', tags: ['cultural', 'wuxia', 'name'] },
  { text: '乔峰', tags: ['cultural', 'wuxia', 'name'] },
  { text: '虚竹', tags: ['cultural', 'wuxia', 'name'] },
  { text: '段誉', tags: ['cultural', 'wuxia', 'name'] },
  { text: '韦小宝', tags: ['cultural', 'wuxia', 'name'] },

  // 古典文学人物
  { text: '李白', tags: ['cultural', 'classical', 'name'] },
  { text: '杜甫', tags: ['cultural', 'classical', 'name'] },
  { text: '白居易', tags: ['cultural', 'classical', 'name'] },
  { text: '苏轼', tags: ['cultural', 'classical', 'name'] },
  { text: '李清照', tags: ['cultural', 'classical', 'name'] },
  { text: '陆游', tags: ['cultural', 'classical', 'name'] },
  { text: '辛弃疾', tags: ['cultural', 'classical', 'name'] },
  { text: '王维', tags: ['cultural', 'classical', 'name'] },
  { text: '孟浩然', tags: ['cultural', 'classical', 'name'] },
  { text: '屈原', tags: ['cultural', 'classical', 'name'] },
  { text: '司马迁', tags: ['cultural', 'classical', 'name'] },
  { text: '孔子', tags: ['cultural', 'classical', 'name'] },
  { text: '孟子', tags: ['cultural', 'classical', 'name'] },
  { text: '老子', tags: ['cultural', 'classical', 'name'] },
  { text: '庄子', tags: ['cultural', 'classical', 'name'] },

  // 西游记
  { text: '孙悟空', tags: ['cultural', 'myth', 'name'] },
  { text: '猪八戒', tags: ['cultural', 'myth', 'name'] },
  { text: '沙僧', tags: ['cultural', 'myth', 'name'] },
  { text: '唐僧', tags: ['cultural', 'myth', 'name'] },
  { text: '白龙马', tags: ['cultural', 'myth', 'name'] },
  { text: '牛魔王', tags: ['cultural', 'myth', 'name'] },
  { text: '红孩儿', tags: ['cultural', 'myth', 'name'] },
  { text: '玉皇大帝', tags: ['cultural', 'myth', 'name'] },
  { text: '观音菩萨', tags: ['cultural', 'myth', 'name'] },
  { text: '如来佛祖', tags: ['cultural', 'myth', 'name'] },

  // 神话传说
  { text: '女娲', tags: ['cultural', 'myth'] },
  { text: '盘古', tags: ['cultural', 'myth'] },
  { text: '后羿', tags: ['cultural', 'myth'] },
  { text: '嫦娥', tags: ['cultural', 'myth'] },
  { text: '牛郎织女', tags: ['cultural', 'myth'] },
  { text: '精卫填海', tags: ['cultural', 'myth'] },
  { text: '夸父追日', tags: ['cultural', 'myth'] },
  { text: '愚公移山', tags: ['cultural', 'myth'] },

  // 武侠招式
  { text: '降龙十八掌', tags: ['cultural', 'wuxia'] },
  { text: '九阴白骨爪', tags: ['cultural', 'wuxia'] },
  { text: '葵花宝典', tags: ['cultural', 'wuxia'] },
  { text: '九阳神功', tags: ['cultural', 'wuxia'] },
  { text: '玉女心经', tags: ['cultural', 'wuxia'] },
  { text: '凌波微步', tags: ['cultural', 'wuxia'] },
  { text: '六脉神剑', tags: ['cultural', 'wuxia'] },
  { text: '独孤九剑', tags: ['cultural', 'wuxia'] },
  { text: '辟邪剑法', tags: ['cultural', 'wuxia'] },
  { text: '黯然销魂掌', tags: ['cultural', 'wuxia'] },
  { text: '七伤拳', tags: ['cultural', 'wuxia'] },
  { text: '干坤大挪移', tags: ['cultural', 'wuxia'] },

  // 京剧/戏曲梗
  { text: '贵妃醉酒', tags: ['cultural', 'opera'] },
  { text: '霸王别姬', tags: ['cultural', 'opera'] },
  { text: '空城计', tags: ['cultural', 'opera'] },
  { text: '四郎探母', tags: ['cultural', 'opera'] },

  // 现代/港片
  { text: '古惑仔', tags: ['cultural', 'film'] },
  { text: '叶问', tags: ['cultural', 'film'] },
  { text: '黄飞鸿', tags: ['cultural', 'film'] },
  { text: '霍元甲', tags: ['cultural', 'film'] }
];
