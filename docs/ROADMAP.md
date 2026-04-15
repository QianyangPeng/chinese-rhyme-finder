# 开发路线图

## Phase 0 · 项目骨架（当前）

- [x] 创建 GitHub 私有仓库
- [x] 初始化 SvelteKit + TypeScript + Tailwind 项目
- [x] 配置 GitHub Pages 部署 workflow
- [x] 写设计决策文档（DECISIONS.md）
- [ ] 验证 `npm run dev` 和 `npm run build` 正常
- [ ] 验证 GitHub Pages 自动部署正常

## Phase 1 · MVP 核心引擎 + 第一版 Discover

### P1.1 拼音 + 韵母管道（依赖：无）✅

- [x] `src/lib/core/pinyin/parser.ts` — 字 → 拼音（基于 pinyin-pro，多音字按词典词性选最常用读音）
- [x] `src/lib/core/pinyin/decomposer.ts` — 拼音 → (声母, 韵头, 韵腹, 韵尾, 声调)
- [x] `src/lib/core/pinyin/normalizer.ts` — 处理 yu→ü、iu→iou、ui→uei、儿化、轻声
- [x] 单元测试：59 用例全过

### P1.2 韵母分类 + 押韵判定（依赖 P1.1）✅

- [x] `src/lib/core/rhyme/schemes/strict.ts` — 严式同韵母
- [x] `src/lib/core/rhyme/schemes/shisanzhe.ts` — 十三辙
- [x] `src/lib/core/rhyme/schemes/loose.ts` — 宽松邻韵（en/eng、in/ing、an/ang 等）
- [x] `src/lib/core/rhyme/matcher.ts` — 给定模式判定两序列是否押韵（FULL/TAIL/HEAD）
- [x] `src/lib/core/rhyme/relaxation.ts` — 分级宽松枚举（Level 0 ~ N）
- [x] 单元测试：36 用例全过

### P1.3 词库与索引（依赖 P1.2）✅（部分）

- [x] `src/lib/core/corpus/seed-data.ts` — 200+ 条 hand-curated 引导词库（覆盖 13 辙）
- [x] `src/lib/core/corpus/loader.ts` — 加载 + 解析 finals + 去重 + 长度索引
- [x] `src/lib/core/corpus/types.ts` — Lexicon / PhraseRecord 类型
- [ ] `data/lexicon-v0.bin` — 50k 条二进制词库（待 P1.4 Python 管道）
- [ ] 倒排索引（rhyme pattern → phrase IDs）— 待词库扩到 ~10k+ 后再做（现在 byLength 够用）

### P1.4 数据准备脚本（Python，离线，依赖：无）

- [ ] `scripts/crawlers/` — 公开语料源采集（详见 docs/CORPUS.md，待补）
- [ ] `scripts/clean/` — 去重、敏感词过滤、标准化
- [ ] `scripts/score/` — 质量打分（实现 D-005 公式）
- [ ] `scripts/pack/` — 输出 .bin（紧凑二进制 + brotli 压缩）

### P1.5 多策略搜索（依赖 P1.3）

- [x] `src/lib/core/corpus/search.ts` — 直接匹配 + 分级宽松（Q16 自动遍历）
- [ ] `splice_2_2.ts` — 2+2 拼接（需要更大词库才有意义）
- [ ] `template_fill.ts` — 模板填充（待 P1.4 拿到模板抽取数据）
- [x] phonology 强校验（已嵌在 corpus/loader 里）
- [x] 排序（按 quality desc + 文本字典序，stable）

### P1.6 Cluster 挖掘 ✅

- [x] `src/lib/core/discover/miner.ts` — TypeScript 版 cluster 挖掘（200 词条数十毫秒级）
- [x] `src/lib/core/discover/types.ts` — RhymeCluster / ClusterCatalog
- [x] D-006 巧妙度公式（avgQuality × diversity × log(K) × memberBonus）
- [x] 7 单元测试，含合成数据 + seed 数据 smoke
- [ ] Python 版离线挖掘（待 P1.4 词库扩充后再做，避免运行时压力）
- [ ] 预排序 cluster catalog 二进制（同上）

### P1.7 Discover UI ✅（基础版）

- [x] `src/routes/discover/+page.svelte` — Discover 页面 + cluster 卡片列表
- [x] 实时调节：scheme / 最低押韵深度 / 最少成员 / 仅尾部 vs 全位置
- [x] 一键复制 cluster 成员列表
- [ ] 4 个发现透镜（精选今日 / 未被发现的宝藏 / 多押排行榜 / 主题押韵集）— 推迟到 Phase 2
- [ ] localStorage 收藏 — 推迟到 Phase 2

### P1.8 Search UI（依赖 P1.5）✅

- [x] `src/routes/search/+page.svelte` — 输入框 + 分级宽松结果展示（Level 0 → N）
- [x] Scheme 即时切换（严式 / 十三辙 / 宽松邻韵）
- [x] 韵母 chip 展示 + 匹配/未匹配色块
- [ ] 多音字交互式选择（气泡）— 推迟到 Phase 2

### P1.9 Analyze UI（依赖 P1.2）✅

- [x] `src/lib/core/analyze/reverse.ts` — 反向分析算法（pair tail/head K + 同韵分组）
- [x] `src/routes/analyze/+page.svelte` — 粘贴歌词 → 色块高亮 + 行对行 K 押矩阵
- [x] 12 单元测试，含 Capper 三行段落金标准
- [ ] 内部押韵检测（同一行内的押韵）— 推迟到 Phase 2
- [ ] 跨位置错位押韵（A 句末 vs B 句中）— 推迟到 Phase 2

## Phase 2 · 体验打磨

- [ ] 分享卡片图导出（社交传播）
- [ ] 暗色模式
- [ ] 移动端响应式优化
- [ ] 键盘快捷键
- [ ] 词库扩展到 200k+

## Phase 3 · LLM Sidecar（可选）

- [ ] 用户 API key 配置面板
- [ ] Cluster 巧妙度的 LLM 解读
- [ ] 反向分析的 LLM 赏析

## Phase 4 · 高级功能

- [ ] 古典韵书支持（平水韵、词林正韵、平仄）
- [ ] 自定义韵表上传
- [ ] 中英混押扩展
- [ ] 风格分类器（trap / boombap / conscious / battle）
