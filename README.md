# 押韵集 · Chinese Rhymes

> 中文多音节押韵词典 — 80 万条短语，10 个开源语料库，算法挖掘双押到八押。
> A Chinese multi-syllable rhyme dictionary — 800k+ phrases across 10 open corpora, algorithm-mined rhymes from 2- to 8-syllable depth.

**在线使用 · Try it online**：[qianyangpeng.github.io/chinese-rhyme-finder](https://qianyangpeng.github.io/chinese-rhyme-finder/)

---

## 三大功能 · Three features

| | 中文 | English |
|---|---|---|
| 🔥 | **押韵灵感** — 浏览算法自动发现的押韵组合，适合找灵感、看巧妙搭配 | **Discover** — Browse algorithm-mined rhyme clusters, great for inspiration and unexpected pairings |
| 🔍 | **找押韵** — 输入一个词，从语料库里找出所有押韵候选，适合写歌词 / rap / 对联 | **Search** — Enter a phrase, get every rhyme candidate from the corpus. For lyrics, rap, couplets |
| 📝 | **歌词分析** — 粘贴歌词，自动标注押韵位置、类型和深度 | **Analyze** — Paste lyrics to see rhyme positions, types, and depth auto-labeled |

## 语料库 · Corpora

| 中文 · Chinese | English | 条目 · Phrases | 协议 · License |
|---|---|---:|---|
| 成语（新华） | Xinhua Idioms | 20,191 | MIT |
| 说唱歌词（70+ 歌手） | Hip-Hop Lyrics (70+ artists) | 53,355 | MIT |
| 流行歌词（500+ 歌手） | Pop Lyrics (500+ artists) | 538,954 | MIT |
| 电影字幕（OpenSubtitles） | Movie Subtitles | 73,468 | CC-BY-ND |
| 词典（CC-CEDICT） | Dictionary | 104,305 | CC-BY-SA |
| 萌娘百科 ACG | Moegirlpedia ACG | 35,746 | CC-BY-NC-SA |
| 歇后语（新华） | Xiehouyu (folk two-part sayings) | 6,534 | MIT |
| 唐诗三百首 | 300 Tang Poems | 3,267 | MIT |
| 宋词三百首 | 300 Song Ci | 5,078 | MIT |
| 网络流行语 | Internet slang (Wiktionary) | 274 | CC-BY-SA |
| **总计 · Total** | | **840,172** | |

## 押韵算法 · Rhyme algorithm

中文：
- 拼音分解：每个汉字拆成声母 + 韵母 + 声调
- 韵身匹配：只比较韵腹+韵尾，忽略韵头（妈/瓜/家 同韵）
- 多音节对齐：双押 = 最后两个韵母一致，N押 = 最后 N 个
- 不使用 AI 生成 — 所有结果来自真实语料

English:
- Pinyin decomposition: every syllable → initial + final + tone
- Rhyme-body matching: compare only the nucleus + coda, ignore the medial glide (so 妈/瓜/家 all rhyme)
- Multi-syllable alignment: 2-rhyme = last two finals match, N-rhyme = last N finals match
- No AI generation — every result comes from real corpora

## 本地开发 · Local development

```bash
git clone https://github.com/QianyangPeng/chinese-rhyme-finder.git
cd chinese-rhyme-finder
npm install
npm run dev          # http://localhost:5173
```

### 重建词库 · Rebuild the corpus

```bash
cd scripts
pip install -r pipeline/requirements.txt
python -m pipeline.build
python split_lexicon.py
npx tsx precompute_clusters.ts
```

## 参与贡献 · Contributing

中文：
- 报告不准确的押韵判断
- 提供新的语料来源
- 优化押韵排序算法

Pull Request 直接提，或者在 [Issues](https://github.com/QianyangPeng/chinese-rhyme-finder/issues) 里提建议。

English:
- Report incorrect rhyme judgments
- Suggest new data sources
- Improve the cluster ranking algorithm

Open a PR directly, or file suggestions in [Issues](https://github.com/QianyangPeng/chinese-rhyme-finder/issues).

## 许可 · License

MIT License

---

觉得好用？给个 ⭐ 支持一下！
Finding this useful? Drop a ⭐!

Built with [Claude Code](https://claude.com/claude-code)
