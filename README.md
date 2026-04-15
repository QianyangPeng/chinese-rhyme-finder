# 中文押韵发现 · chinese-rhyme-finder

> **不是字典，是灵感引擎。**
>
> 中文多音节押韵工具，主动推送算法挖掘的巧妙押韵组合——为 rapper、词作者、
> 古诗爱好者而造。

**🌐 在线 demo**：[qianyangpeng.github.io/chinese-rhyme-finder](https://qianyangpeng.github.io/chinese-rhyme-finder/)
（纯静态站，零服务器；首次加载后断网也能用）

---

## 为什么

传统押韵字典是「用户输入词组 → 系统查韵脚」的 Google 模式。这套模式有三个致命弱点：

1. **冷启动失败**：打开空输入框，用户先得知道搜什么
2. **失败率高**：大部分随手输入的词组（比如"原神芭芭拉"）根本没有好的多音节押韵匹配
3. **顺序错了**：押韵是写词的**结果**，不是**起点**——真正卡住创作的是「想到 clever 的组合」

本工具反过来：**主动推送** 算法从语料里挖出来的押韵 cluster，用 Pinterest 式发现代替 Google 式查询。

---

## 四种模式

| 模式 | 功能 | 用例 |
|---|---|---|
| **🔥 [Discover](https://qianyangpeng.github.io/chinese-rhyme-finder/discover)** | 浏览算法挖出的押韵 cluster，按「巧妙度」排序 | 找灵感、看哪些短语能套一个韵脚 |
| **🔍 [Search](https://qianyangpeng.github.io/chinese-rhyme-finder/search)** | 输入词组，分级宽松查找押韵候选 | 有一句想押，要找第二句 |
| **📖 [Analyze](https://qianyangpeng.github.io/chinese-rhyme-finder/analyze)** | 粘贴歌词反向分析，多行 K 押矩阵 + 同韵分组色块 | 看人家歌词押得怎么样，学习结构 |
| **🏠 [主页](https://qianyangpeng.github.io/chinese-rhyme-finder/)** | 引擎实测：两个词组并排对比，韵母级色块高亮 | 快速验证某两个词押不押 |

### 核心能力

- **3 种押韵 scheme**：严式同韵母 / **十三辙**（曲艺/说唱标准）/ 宽松邻韵（en↔eng、an↔ang 等 rap 常用通押）
- **分级宽松遍历** *(Q16)*：用户不标位置，系统自动从 Level 0 严格到 Level N 全放宽，穷举展示
- **多策略搜索**：直接匹配为 Phase 1 基线；后续 Phase 会加 2+2 拼接 + 模板填充
- **巧妙度排序**：cluster 不按数量排，按 `avgQuality × 跨域多样性 × log(押韵深度) × 成员数 × 意外性`
- **暗色模式** + 系统主题自动跟随

---

## 核心原则

### 🚫 LLM 不参与押韵生成

因为它**不行**。实测 Claude Opus 4.6 生成 22 条押韵候选中有 5 条韵母完全错
（"蒋琬发力" 被标 iang-ui-a-i 实际是 iang-an-a-i；"项羽得意" 被标 iang-ui-e-i 实际是 iang-ü-e-i 等）。

根本原因：LLM 工作在 BPE token 上，看不见音素。押韵是硬约束，LLM 是概率生成——**原理不匹配**。

本工具押韵匹配 100% 走拼音表 + 静态韵表的确定性算法。LLM 只做降级职责：反向分析时的「为什么这组巧妙」解读、自然语言查询解析等只读场景（当前版本尚未接入 LLM sidecar）。

详见 [docs/DECISIONS.md](docs/DECISIONS.md#d-002)。

### ✅ 确定性算法 + 高质量语料 + 智能切片

「姜维的戏」「降维打击」这种创意组合不靠 LLM 编，靠：
- **大语料挖掘** — 这些短语本来就在三国典籍 / 《三体》 / 歌词里
- **模板化拼接** — 「[人名]+的+[名词]」「[科技术语]+[动作]」等模式组合
- **phonology 强校验** — 每条候选经拼音库确定性验证后才返回

---

## 技术栈

- **运行时**：TypeScript + SvelteKit + Vite + Tailwind CSS，编译为纯静态站部署到 GitHub Pages
- **拼音引擎**：基于 pinyin-pro，覆盖 36 个普通话韵母 + 13 辙映射 + 邻韵桥接
- **数据层**：**30,695 词条**，由两部分组成：
  - ~800 条手工 curated 种子库（`src/lib/core/corpus/seeds/`），带 scifi/lyric/modern/cultural 等风格标签
  - 30k 条成语来自 [pwxcoo/chinese-xinhua](https://github.com/pwxcoo/chinese-xinhua)（MIT）
  - 构建脚本：`node scripts/build_lexicon.mjs` 下载 + 清洗 + 算韵母 + 评分，输出 `static/data/lexicon.json`
  - 运行时异步 fetch，失败自动降级到种子库，保证可用性
- **测试**：vitest，~130 单元测试覆盖所有核心逻辑

## 项目结构

```
chinese-rhyme-finder/
├── src/
│   ├── routes/              # 4 个页面：/, /discover, /search, /analyze
│   ├── lib/
│   │   ├── components/      # TopNav, ThemeToggle, etc.
│   │   └── core/
│   │       ├── pinyin/      # 字 → 拼音 → 韵母分解
│   │       ├── rhyme/       # 3 个 scheme + matcher + 分级宽松
│   │       ├── corpus/      # 词库 + 分桶搜索
│   │       ├── discover/    # cluster 挖掘 + 巧妙度打分
│   │       └── analyze/     # 反向押韵分析
│   ├── app.html / app.css
│   └── routes/+layout.*     # 共享布局
├── scripts/                 # Python 离线数据管道 (P1.4)
│   ├── pipeline/            # clean / score / pack
│   └── sources/             # 每个数据源一个适配器
├── data/                    # 词库二进制产物目录 (P1.4+)
├── docs/
│   ├── DECISIONS.md         # 10 项关键设计决策及理由
│   └── ROADMAP.md           # 阶段任务 + 进度
└── .github/workflows/       # GitHub Pages 自动部署
```

## 本地开发

```bash
git clone https://github.com/QianyangPeng/chinese-rhyme-finder.git
cd chinese-rhyme-finder
npm install
npm run dev          # → http://localhost:5173
```

常用命令：

```bash
npm run build        # 产出静态站到 build/
npm run test         # 跑 vitest 单元测试
npm run test:watch   # 监听模式
npm run check        # svelte-check 类型检查
```

### 重建词库

主词库（xinhua 成语）由 Node 脚本构建：

```bash
# 自动下载数据源（首次用）或使用缓存
node scripts/build_lexicon.mjs

# 用本地 JSON 代替：
node scripts/build_lexicon.mjs --xinhua=/path/to/idiom.json

# 试跑小样：
node scripts/build_lexicon.mjs --max=1000
```

输出：`static/data/lexicon.json`（~3.9 MB）。

Python 管道（实验性，未接入运行时）：

```bash
cd scripts
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pipeline.build    # 目前只有 seed_export 一个源
```

详见 [scripts/README.md](scripts/README.md)。

## 数据源致谢

- 30k 成语来自 [pwxcoo/chinese-xinhua](https://github.com/pwxcoo/chinese-xinhua)（MIT）
- 额外 800 条手工 curated 种子（见 `src/lib/core/corpus/seeds/`）

---

## 路线图

Phase 0 ✅：项目骨架 + 部署
Phase 1 ✅：核心引擎 + 四个模式 + 800 词种子库
Phase 1.4 ✅：接入 xinhua 成语库，词库到 30k+（**当前**）
Phase 2 🚧：Discover 四个透镜（精选今日/未被发现的宝藏/多押排行榜/主题押韵集）、分享卡片图、多音字气泡、内部押韵检测（已完成基础版）
Phase 3 📅：可选 LLM sidecar（赏析解读 + 查询理解；永远不参与押韵生成）
Phase 4 📅：古典韵书（平水韵 / 词林正韵 / 平仄）、中英混押、自定义韵表、词库接更多源（歌词 / 网络流行语 / 人名地名）

完整清单：[docs/ROADMAP.md](docs/ROADMAP.md)

---

## 参与贡献

欢迎：
- 给种子词库加词条（编辑 `src/lib/core/corpus/seeds/*.ts`）
- 报告押错的边界情况（包括你觉得该押但工具没找到 / 不该押但工具给出的 case）
- 优化巧妙度打分公式（`src/lib/core/discover/miner.ts`）
- 接入一个新数据源到 Python 管道（`scripts/pipeline/sources/`）

Pull Request 直接提，流程不 fancy。

---

## 许可

MIT License. See [LICENSE](LICENSE).

---

<sub>Built with [Claude Code](https://claude.com/claude-code). Every design
decision documented in [docs/DECISIONS.md](docs/DECISIONS.md).</sub>
