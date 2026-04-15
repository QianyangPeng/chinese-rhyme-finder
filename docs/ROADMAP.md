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

### P1.3 词库与索引（依赖 P1.2）

- [ ] `data/lexicon-v0.bin` — 第一版 50k 词条（成语 + jieba 高频词 + 简单流行词）
- [ ] `src/core/corpus/loader.ts` — 加载 .bin（TypedArray）
- [ ] `src/core/corpus/index.ts` — 倒排索引（rhyme pattern → phrase IDs）
- [ ] `src/core/corpus/lookup.ts` — 多 K-gram 查询

### P1.4 数据准备脚本（Python，离线，依赖：无）

- [ ] `scripts/crawlers/` — 公开语料源采集（详见 docs/CORPUS.md，待补）
- [ ] `scripts/clean/` — 去重、敏感词过滤、标准化
- [ ] `scripts/score/` — 质量打分（实现 D-005 公式）
- [ ] `scripts/pack/` — 输出 .bin（紧凑二进制 + brotli 压缩）

### P1.5 多策略搜索（依赖 P1.3）

- [ ] `src/core/search/strategies/direct_match.ts`
- [ ] `src/core/search/strategies/splice_2_2.ts`
- [ ] `src/core/search/strategies/template_fill.ts`
- [ ] `src/core/search/validator.ts` — phonology 强校验（守门员）
- [ ] `src/core/search/ranker.ts` — 多维度排序

### P1.6 Cluster 挖掘（Python 离线 + 前端展示）

- [ ] `scripts/discover/cluster_miner.py` — 扫描词库，按 K-gram 分桶
- [ ] `scripts/discover/cleverness.py` — 实现 D-006 巧妙度公式
- [ ] `data/clusters-v0.bin` — 预排序的 cluster catalog
- [ ] `src/core/discover/loader.ts` — 加载并按透镜筛选

### P1.7 Discover UI（依赖 P1.6）

- [ ] `src/routes/+page.svelte` — Discover 主页（瀑布流卡片）
- [ ] `src/lib/components/ClusterCard.svelte` — 押韵 cluster 卡片
- [ ] `src/lib/components/LensTabs.svelte` — 4 个透镜切换：精选今日 / 未被发现的宝藏 / 多押排行榜 / 主题押韵集
- [ ] `src/lib/components/RhymeVisual.svelte` — 韵母色块高亮
- [ ] localStorage 收藏

### P1.8 Search UI（依赖 P1.5）

- [ ] `src/routes/search/+page.svelte` — 输入框 + 分级宽松结果展示
- [ ] 多音字交互式选择（气泡）

### P1.9 Analyze UI（依赖 P1.2）

- [ ] `src/routes/analyze/+page.svelte` — 粘贴歌词 → 高亮押韵
- [ ] 反向分析算法（滑窗 + 聚类找押韵分组）

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
