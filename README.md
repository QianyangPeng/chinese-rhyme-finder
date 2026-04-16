# 世界最强押韵网站

> 收录 84 万条中文短语，9 个语料库，纯算法押韵发现引擎。

**在线使用**：[qianyangpeng.github.io/chinese-rhyme-finder](https://qianyangpeng.github.io/chinese-rhyme-finder/)

---

## 三大功能

| 功能 | 做什么 | 适合谁 |
|------|--------|--------|
| **🔥 押韵灵感** | 浏览算法自动发现的押韵组合 | 找灵感、看巧妙搭配 |
| **🔍 找押韵** | 输入一个词，找所有押韵候选 | 写歌词、rap、对联 |
| **📝 歌词分析** | 粘贴歌词，自动标注押韵位置和类型 | 分析 rap/歌词的押韵结构 |

## 语料库

| 来源 | 条目数 | 协议 |
|------|--------|------|
| 新华成语 | 20,191 | MIT |
| 说唱歌词（70+ 歌手） | 70,137 | MIT |
| 流行歌词（500+ 歌手） | 624,613 | MIT |
| 电影字幕（OpenSubtitles） | 73,468 | CC-BY-ND |
| 萌娘百科 ACG | 35,746 | CC-BY-NC-SA |
| 歇后语 | 6,534 | MIT |
| 唐诗三百首 | 3,267 | MIT |
| 宋词三百首 | 5,078 | MIT |
| 网络流行语 | 274 | CC-BY-SA |
| **总计** | **839,308** | |

## 押韵算法

- 拼音分解：每个汉字拆成声母 + 韵母 + 声调
- 韵身匹配：只比较韵腹+韵尾，忽略韵头（妈/瓜/家 同韵）
- 多音节对齐：双押 = 最后两个韵母一致，四押 = 最后四个
- 不使用 AI 生成 — 所有结果来自真实语料

## 本地开发

```bash
git clone https://github.com/QianyangPeng/chinese-rhyme-finder.git
cd chinese-rhyme-finder
npm install
npm run dev          # http://localhost:5173
```

### 重建词库

```bash
cd scripts
pip install -r pipeline/requirements.txt
python -m pipeline.build
python split_lexicon.py
npx tsx precompute_clusters.ts
```

## 参与贡献

- 报告不准确的押韵判断
- 提供新的语料来源
- 优化押韵排序算法

Pull Request 直接提。

## 许可

MIT License

---

Built with [Claude Code](https://claude.com/claude-code)
