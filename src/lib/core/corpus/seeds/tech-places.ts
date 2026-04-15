/**
 * 科技术语 · 互联网概念 · 地名 · 品牌 — the "zeitgeist" names layer.
 *
 * These plant modernity hooks in the lexicon so rap-style rhymes can
 * pull in contemporary references alongside classical/idiomatic cores.
 */

import type { SeedPhrase } from '../seed-data.js';

export const TECH_PLACES_PHRASES: SeedPhrase[] = [
  // 科技/AI
  { text: '人工智能', tags: ['tech', 'ai'] },
  { text: '机器学习', tags: ['tech', 'ai'] },
  { text: '深度学习', tags: ['tech', 'ai'] },
  { text: '大语言模型', tags: ['tech', 'ai'] },
  { text: '神经网络', tags: ['tech', 'ai'] },
  { text: '注意力机制', tags: ['tech', 'ai'] },
  { text: '模型蒸馏', tags: ['tech', 'ai'] },
  { text: '知识图谱', tags: ['tech', 'ai'] },
  { text: '智能涌现', tags: ['tech', 'ai'] },
  { text: '自动驾驶', tags: ['tech', 'ai'] },
  { text: '量子计算', tags: ['tech'] },
  { text: '云原生', tags: ['tech'] },
  { text: '边缘计算', tags: ['tech'] },
  { text: '区块链技术', tags: ['tech'] },
  { text: '智能合约', tags: ['tech'] },
  { text: '去中心化', tags: ['tech'] },
  { text: '共识机制', tags: ['tech'] },
  { text: '比特币', tags: ['tech', 'finance'] },
  { text: '以太坊', tags: ['tech', 'finance'] },
  { text: '元宇宙', tags: ['tech', 'modern'] },
  { text: '虚拟现实', tags: ['tech'] },
  { text: '增强现实', tags: ['tech'] },
  { text: '混合现实', tags: ['tech'] },
  { text: '数字孪生', tags: ['tech'] },
  { text: '物联网', tags: ['tech'] },
  { text: '工业互联网', tags: ['tech'] },
  { text: '5G基站', tags: ['tech'] },
  { text: '星链', tags: ['tech'] },
  { text: '北斗导航', tags: ['tech'] },
  { text: '嫦娥奔月', tags: ['tech', 'cultural'] },
  { text: '天宫空间站', tags: ['tech'] },
  { text: '火星探测', tags: ['tech'] },

  // 编程/工程
  { text: '开源社区', tags: ['tech'] },
  { text: '代码重构', tags: ['tech'] },
  { text: '敏捷开发', tags: ['tech'] },
  { text: '持续集成', tags: ['tech'] },
  { text: '微服务架构', tags: ['tech'] },
  { text: '缓存穿透', tags: ['tech'] },
  { text: '系统崩溃', tags: ['tech'] },
  { text: '回滚操作', tags: ['tech'] },

  // 地名 - 大城市
  { text: '北京', tags: ['place', 'china'] },
  { text: '上海', tags: ['place', 'china'] },
  { text: '广州', tags: ['place', 'china'] },
  { text: '深圳', tags: ['place', 'china'] },
  { text: '杭州', tags: ['place', 'china'] },
  { text: '成都', tags: ['place', 'china'] },
  { text: '重庆', tags: ['place', 'china'] },
  { text: '南京', tags: ['place', 'china'] },
  { text: '西安', tags: ['place', 'china'] },
  { text: '武汉', tags: ['place', 'china'] },
  { text: '长沙', tags: ['place', 'china'] },
  { text: '苏州', tags: ['place', 'china'] },
  { text: '天津', tags: ['place', 'china'] },
  { text: '青岛', tags: ['place', 'china'] },
  { text: '厦门', tags: ['place', 'china'] },
  { text: '大连', tags: ['place', 'china'] },
  { text: '沈阳', tags: ['place', 'china'] },
  { text: '哈尔滨', tags: ['place', 'china'] },
  { text: '昆明', tags: ['place', 'china'] },
  { text: '乌鲁木齐', tags: ['place', 'china'] },

  // 地名 - 区域/标志
  { text: '中关村', tags: ['place', 'china', 'tech'] },
  { text: '陆家嘴', tags: ['place', 'china', 'finance'] },
  { text: '后海', tags: ['place', 'china'] },
  { text: '三里屯', tags: ['place', 'china'] },
  { text: '西湖', tags: ['place', 'china'] },
  { text: '外滩', tags: ['place', 'china'] },
  { text: '长城', tags: ['place', 'china'] },
  { text: '故宫', tags: ['place', 'china'] },
  { text: '颐和园', tags: ['place', 'china'] },

  // 世界地名
  { text: '纽约', tags: ['place', 'world'] },
  { text: '伦敦', tags: ['place', 'world'] },
  { text: '东京', tags: ['place', 'world'] },
  { text: '巴黎', tags: ['place', 'world'] },
  { text: '硅谷', tags: ['place', 'world', 'tech'] },
  { text: '好莱坞', tags: ['place', 'world'] },
  { text: '华尔街', tags: ['place', 'world', 'finance'] }
];
