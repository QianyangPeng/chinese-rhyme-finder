/**
 * 现代流行词 / 网络流行语 / 职场与社交新词。
 *
 * Volatile category — usage peaks and fades in 1-3 years, but while
 * active these carry strong cultural associations and are gold for
 * rap-style creative combinations.
 */

import type { SeedPhrase } from '../seed-data.js';

export const MODERN_PHRASES: SeedPhrase[] = [
  // 互联网/社交语
  { text: '社死现场', tags: ['modern', 'internet'] },
  { text: '破防了', tags: ['modern', 'internet'] },
  { text: '真香定律', tags: ['modern', 'internet'] },
  { text: '内卷加剧', tags: ['modern', 'workplace'] },
  { text: '躺平主义', tags: ['modern', 'workplace'] },
  { text: '摆烂人生', tags: ['modern', 'workplace'] },
  { text: '佛系青年', tags: ['modern'] },
  { text: '打工人儿', tags: ['modern', 'workplace'] },
  { text: '小镇做题', tags: ['modern'] },
  { text: '绝绝子呀', tags: ['modern', 'internet'] },
  { text: '栓Q', tags: ['modern', 'internet'] },
  { text: '尊嘟假嘟', tags: ['modern', 'internet'] },
  { text: '芭比Q了', tags: ['modern', 'internet'] },
  { text: '我真的会谢', tags: ['modern', 'internet'] },
  { text: '小丑竟是我自己', tags: ['modern', 'internet'] },

  // 流行梗
  { text: '不讲武德', tags: ['modern', 'meme'] },
  { text: '年轻人不讲武德', tags: ['modern', 'meme'] },
  { text: '耗子尾汁', tags: ['modern', 'meme'] },
  { text: '退退退', tags: ['modern', 'meme'] },
  { text: '老六行为', tags: ['modern', 'meme'] },
  { text: '芭比粉色', tags: ['modern'] },
  { text: '老登', tags: ['modern', 'meme'] },
  { text: '孝子贤孙', tags: ['modern', 'meme'] },
  { text: '让子弹飞', tags: ['modern', 'film'] },
  { text: '狂飙突进', tags: ['modern', 'film'] },
  { text: '搞钱要紧', tags: ['modern'] },
  { text: '弱智儿童', tags: ['modern', 'meme'] },
  { text: '栓狗腿子', tags: ['modern'] },
  { text: '阳了再说', tags: ['modern'] },

  // 情感/心理
  { text: '有点上头', tags: ['modern'] },
  { text: '已读不回', tags: ['modern'] },
  { text: '读空气', tags: ['modern'] },
  { text: '情绪稳定', tags: ['modern'] },
  { text: '情绪价值', tags: ['modern'] },
  { text: '精神内耗', tags: ['modern', 'psychology'] },
  { text: '心态崩了', tags: ['modern'] },
  { text: '破防瞬间', tags: ['modern'] },
  { text: '治愈系', tags: ['modern'] },
  { text: '致郁系', tags: ['modern'] },
  { text: '发疯文学', tags: ['modern', 'literary'] },
  { text: '玩梗破防', tags: ['modern'] },

  // 工作/生活
  { text: '躺平任嘲', tags: ['modern', 'workplace'] },
  { text: '内卷王', tags: ['modern', 'workplace'] },
  { text: '外卷', tags: ['modern', 'workplace'] },
  { text: '职场黑话', tags: ['modern', 'workplace'] },
  { text: '背锅侠', tags: ['modern', 'workplace'] },
  { text: '底层逻辑', tags: ['modern', 'workplace'] },
  { text: '降本增效', tags: ['modern', 'workplace'] },
  { text: '优化裁员', tags: ['modern', 'workplace'] },
  { text: '毕业典礼', tags: ['modern', 'workplace'] },

  // 消费/金融
  { text: '财富自由', tags: ['modern'] },
  { text: '消费降级', tags: ['modern'] },
  { text: '平替党', tags: ['modern'] },
  { text: '薅羊毛', tags: ['modern'] },
  { text: '白嫖党', tags: ['modern'] },
  { text: '抠抠搜搜', tags: ['modern'] },
  { text: '剁手党', tags: ['modern'] },
  { text: '种草拔草', tags: ['modern'] },
  { text: '直播带货', tags: ['modern'] },
  { text: '私域流量', tags: ['modern', 'business'] },
  { text: '月光族', tags: ['modern'] },

  // 币圈/投机/梦想破灭
  { text: '韭菜命', tags: ['modern', 'finance'] },
  { text: '空气币', tags: ['modern', 'finance'] },
  { text: '拉盘出货', tags: ['modern', 'finance'] },
  { text: '镰刀', tags: ['modern', 'finance'] },

  // 关系/社交
  { text: '爱情脑', tags: ['modern'] },
  { text: '单身狗', tags: ['modern'] },
  { text: '备胎', tags: ['modern'] },
  { text: '情绪脑', tags: ['modern'] },
  { text: '舔狗行为', tags: ['modern'] },
  { text: '渣男渣女', tags: ['modern'] },
  { text: '海王海后', tags: ['modern'] },
  { text: '佛媛', tags: ['modern'] },
  { text: '绿茶婊', tags: ['modern'] },

  // 其他流行
  { text: '宇宙的尽头', tags: ['modern'] },
  { text: '氛围感', tags: ['modern'] },
  { text: '松弛感', tags: ['modern'] },
  { text: '仪式感', tags: ['modern'] },
  { text: '颗粒度', tags: ['modern', 'business'] },
  { text: '闭环思维', tags: ['modern', 'business'] },
  { text: '场景化', tags: ['modern', 'business'] },
  { text: '价值观', tags: ['modern'] },
  { text: '世界观', tags: ['modern'] },
  { text: '人生观', tags: ['modern'] },

  // ─── Phase 1b additions: 更多现代 / rap-友好短语 ─────────────────────

  // 游戏 / 电竞
  { text: '王者荣耀', tags: ['modern', 'game'] },
  { text: '吃鸡', tags: ['modern', 'game'] },
  { text: '开黑', tags: ['modern', 'game'] },
  { text: '上分', tags: ['modern', 'game'] },
  { text: '单排', tags: ['modern', 'game'] },
  { text: '残血', tags: ['modern', 'game'] },
  { text: '团战', tags: ['modern', 'game'] },
  { text: '大龙', tags: ['modern', 'game'] },
  { text: '翻盘', tags: ['modern', 'game'] },
  { text: '超神', tags: ['modern', 'game'] },
  { text: '暴击', tags: ['modern', 'game'] },
  { text: '爆头', tags: ['modern', 'game'] },
  { text: '逆风局', tags: ['modern', 'game'] },
  { text: '秀操作', tags: ['modern', 'game'] },
  { text: '神操作', tags: ['modern', 'game'] },
  { text: '送人头', tags: ['modern', 'game'] },
  { text: '扫射', tags: ['modern', 'game'] },
  { text: '复活', tags: ['modern', 'game'] },

  // 职场新黑话
  { text: '摸鱼', tags: ['modern', 'workplace'] },
  { text: '划水', tags: ['modern', 'workplace'] },
  { text: '画饼', tags: ['modern', 'workplace'] },
  { text: '升职加薪', tags: ['modern', 'workplace'] },
  { text: '跳槽', tags: ['modern', 'workplace'] },
  { text: '裁员', tags: ['modern', 'workplace'] },
  { text: '绩效', tags: ['modern', 'workplace'] },
  { text: '对齐目标', tags: ['modern', 'workplace'] },
  { text: '拉通', tags: ['modern', 'workplace'] },
  { text: '复盘', tags: ['modern', 'workplace'] },
  { text: '破局', tags: ['modern', 'workplace'] },
  { text: '破圈', tags: ['modern', 'workplace'] },
  { text: '打标签', tags: ['modern', 'workplace'] },
  { text: '做增量', tags: ['modern', 'workplace'] },
  { text: '造轮子', tags: ['modern', 'workplace'] },

  // 互联网 / 自媒体
  { text: '网红打卡', tags: ['modern', 'internet'] },
  { text: '直播间', tags: ['modern', 'internet'] },
  { text: '带货', tags: ['modern', 'internet'] },
  { text: '翻车现场', tags: ['modern', 'internet'] },
  { text: '塌房', tags: ['modern', 'internet'] },
  { text: '顶流', tags: ['modern', 'internet'] },
  { text: '出圈', tags: ['modern', 'internet'] },
  { text: '炸圈', tags: ['modern', 'internet'] },
  { text: '流量密码', tags: ['modern', 'internet'] },
  { text: '上热搜', tags: ['modern', 'internet'] },
  { text: '爆款', tags: ['modern', 'internet'] },
  { text: '黑粉', tags: ['modern', 'internet'] },
  { text: '水军', tags: ['modern', 'internet'] },
  { text: '键盘侠', tags: ['modern', 'internet'] },
  { text: '断章取义', tags: ['modern', 'internet'] },
  { text: '节奏带歪', tags: ['modern', 'internet'] },

  // 饭圈
  { text: '磕CP', tags: ['modern', 'fan'] },
  { text: '吃瓜群众', tags: ['modern', 'fan'] },
  { text: '瓜田李下', tags: ['modern', 'fan'] },
  { text: '内娱', tags: ['modern', 'fan'] },
  { text: '爱豆', tags: ['modern', 'fan'] },
  { text: '塌房警告', tags: ['modern', 'fan'] },
  { text: '人设崩塌', tags: ['modern', 'fan'] },
  { text: '唱跳rap', tags: ['modern', 'fan'] },
  { text: '团综', tags: ['modern', 'fan'] },
  { text: '划水退团', tags: ['modern', 'fan'] },
  { text: '打call', tags: ['modern', 'fan'] },

  // 短句 / 流行语
  { text: '绷不住', tags: ['modern', 'internet'] },
  { text: '真的牛', tags: ['modern', 'internet'] },
  { text: '太逆天', tags: ['modern', 'internet'] },
  { text: '有一说一', tags: ['modern', 'internet'] },
  { text: '大胆开麦', tags: ['modern', 'internet'] },
  { text: '我裂开了', tags: ['modern', 'internet'] },
  { text: '我emo了', tags: ['modern', 'internet'] },
  { text: '细思极恐', tags: ['modern', 'internet'] },
  { text: '上头', tags: ['modern', 'internet'] },
  { text: '破大防', tags: ['modern', 'internet'] },
  { text: '太炸了', tags: ['modern', 'internet'] },

  // 日常 / 饮食
  { text: '奶茶自由', tags: ['modern'] },
  { text: '咖啡续命', tags: ['modern'] },
  { text: '早C晚A', tags: ['modern'] },
  { text: '外卖党', tags: ['modern'] },

  // 说唱圈 / rap-特有
  { text: '炸场', tags: ['modern', 'rap'] },
  { text: '开麦', tags: ['modern', 'rap'] },
  { text: '压轴', tags: ['modern', 'rap'] },
  { text: '走心', tags: ['modern', 'rap'] },
  { text: '硬核', tags: ['modern', 'rap'] },
  { text: '带感', tags: ['modern', 'rap'] },
  { text: '老铁', tags: ['modern', 'rap'] },
  { text: '扎心了', tags: ['modern', 'rap'] },
  { text: '鬼才', tags: ['modern', 'rap'] },
  { text: '有点东西', tags: ['modern', 'rap'] },
  { text: '牛批', tags: ['modern', 'rap'] },
  { text: '鸡蛋哥', tags: ['modern', 'rap'] },
  { text: '底层逻辑', tags: ['modern', 'business'] },

  // 短名词 / 可做 2 押补充材料
  { text: '精神内耗', tags: ['modern', 'psychology'] },
  { text: '白月光', tags: ['modern'] },
  { text: '朱砂痣', tags: ['modern'] },
  { text: '意难平', tags: ['modern'] },
  { text: '高配版', tags: ['modern'] },
  { text: '低配版', tags: ['modern'] },
  { text: '加量包', tags: ['modern'] },
  { text: '进化论', tags: ['modern', 'tech'] },
  { text: '时代眼泪', tags: ['modern'] },
  { text: '精神股东', tags: ['modern'] },
  { text: '精神小伙', tags: ['modern'] }
];
