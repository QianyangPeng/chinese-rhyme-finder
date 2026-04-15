# 中文押韵发现 · chinese-rhyme-finder

> **不是字典，是灵感引擎。**

主动给 rapper / 词作者推送巧妙的多音节押韵组合，
而不是被动等用户输入词组去查询。

---

## 状态

🚧 **Phase 0** — 项目骨架就绪，核心引擎开发中。

## 三种模式

| 模式 | 说明 | 优先级 |
|---|---|---|
| 🔥 **Discover** | 系统主动展示算法挖掘出的押韵 cluster，按巧妙度排序 | P0 主打 |
| 🔍 **Search** | 输入词组，查找多音节押韵候选（含分级宽松遍历） | P1 |
| 📖 **Analyze** | 粘贴歌词，反向分析押韵模式 + 推荐相似 pattern | P1 |

## 核心设计原则

- **押韵匹配 100% 走确定性算法**：拼音 → 韵母 → 韵组查询，绝不让 LLM 生成韵脚（验证过 LLM 会幻觉错韵母）
- **大语料 + 质量打分**：词库不收"垃圾词"，每条都过质量门槛
- **多策略搜索**：整体匹配 / 2+2 拼接 / 模板填充，覆盖各种创意组合
- **分级宽松遍历**：从严式到邻韵自动展开 N 个层级
- **纯静态站**：TypeScript + SvelteKit + GitHub Pages，零服务器、永远在线

## 技术栈

- **运行时**: TypeScript + SvelteKit + Vite + Tailwind CSS
- **拼音处理**: pinyin-pro
- **数据准备**: Python 离线脚本（爬虫、清洗、质量打分、cluster 挖掘）
- **部署**: GitHub Pages（静态站）
- **LLM**: 可选 sidecar，用户自填 API key，仅做"为什么这组押韵巧妙"的解读

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 目录结构

```
chinese-rhyme-finder/
├── src/
│   ├── routes/          # SvelteKit 页面（Discover / Search / Analyze）
│   ├── lib/             # 共享组件、stores
│   └── core/            # 押韵核心引擎（拼音、韵母、搜索、cluster）
├── data/                # 预生成词库（.bin 文件）
├── scripts/             # Python 数据准备脚本
├── docs/                # 设计文档与决策记录
└── .github/workflows/   # CI / Pages 部署
```

## 文档

- [设计决策记录](docs/DECISIONS.md) — 为什么是这套架构
- [开发路线图](docs/ROADMAP.md) — 分阶段任务清单

## 许可

MIT
