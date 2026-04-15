# scripts/ · 数据准备管道

Python 离线工具链。目标：把**种子词库（~800）** 扩展到 **~50k+** 高质量词条，
配合 pinyin-pro 引擎提供更丰富的 Search / Discover 结果。

这些脚本**不进生产构建**。它们的产物（一份 JSON 词库文件）被检入仓库，
前端在运行时 fetch。

## 为什么是 Python？

因为 Chinese NLP 生态 —— jieba、pypinyin、HanLP —— 成熟，数据处理用 pandas 顺手。
运行时引擎（浏览器里跑的那些）和这些脚本完全解耦，所以语言选择可以各挑最合适的。

## 管道总览

```
sources/       →  clean.py    →   score.py     →   pack.py
(多种数据源)    (去重+规范)      (质量打分)      (输出 JSON)
    │              │                │                 │
    ▼              ▼                ▼                 ▼
  原始列表       干净条目         带分条目         data/lexicon.json
```

| 阶段 | 做什么 | 输入 | 输出 |
|---|---|---|---|
| **sources** | 从公开语料源拉数据（成语表、歌词、流行词等） | 外部 URL / 文件 | 原始短语列表 |
| **clean** | 去重、过滤敏感词、标准化空格与标点 | 原始列表 | 干净列表 |
| **score** | 按 D-005 公式打质量分 | 干净列表 | `{text, quality, tags}` |
| **pack** | 输出前端消费的 JSON / .bin | 带分条目 | `data/lexicon.json` |

## 使用

```bash
# 一次性安装依赖（建议用虚拟环境）
cd scripts
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 跑完整管道
python -m pipeline.build

# 或单独跑某步
python -m pipeline.clean < raw_input.txt > cleaned.txt
python -m pipeline.score cleaned.txt > scored.json
python -m pipeline.pack scored.json ../static/data/lexicon.json
```

## 如何加一个新数据源

1. 在 `pipeline/sources/` 下新建文件，比如 `lyrics_neteaseCloud.py`
2. 实现一个返回 `Iterable[str]`（或 `Iterable[RawPhrase]`）的函数
3. 在 `pipeline/build.py` 里注册进 `SOURCE_REGISTRY`
4. 跑 `python -m pipeline.build --sources lyrics_neteaseCloud`

每个 source 模块应该：
- 负责**自己的请求策略**（重试、限流、UA 伪装）
- 不做清洗（留给 `clean.py`）
- 原则上**不破坏版权**：只取公开、可索引、可引用的短句片段

## 质量打分维度（D-005）

见 `pipeline/score.py`。权重可在 `config.py` 中调。

```
quality =
    0.25 × domain_frequency      # 在说唱/歌词语料中的频率
  + 0.20 × cultural_relevance    # 专有名词/梗/IP 加权
  + 0.15 × lyrical_attestation   # 是否真的出现在歌词里
  + 0.15 × pos_validity          # 词性组合合理度
  + 0.10 × distinctiveness       # TF-IDF（避免烂大街）
  + 0.10 × surprise              # 跨域组合度
  − 0.20 × blacklist_penalty     # 粗口/敏感
  − 0.10 × common_filler_penalty # "的/了/是" 开头扣分
```

当前实现是 Phase 1 骨架版——依赖简单启发式；Phase 1.4 接真实语料后再调整权重与特征。

## 数据源候选（尚未接入）

公开、可用的中文语料参考（仅列举，不代表已经用）：

- **成语**：GitHub 上有多个 5000+ 条的 JSON/TXT 列表
- **现代汉语词典**：CC-CEDICT（开源）
- **歌词**：网易云音乐/QQ 音乐的公开播放页面（需注意 ToS）
- **流行词**：微博热搜历史、知乎热榜、B 站弹幕
- **文化 IP**：维基百科的各类列表页面（三国人物、武侠招式、等等）

建议优先顺序：**成语词典 → CC-CEDICT 高频词 → 公开歌词数据集**。先把数量做到 10k+，再考虑质量更复杂的源。
