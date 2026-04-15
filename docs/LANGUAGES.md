# 多语言扩展设计备忘

chinese-rhyme-finder 当前只处理中文押韵（含少量 ~80 词的英文 rap
词表）。本文整理把工具扩展到**日文**和**系统性的英文**支持的路径，
每一步涉及哪些模块，以及预期工作量。

---

## 现有架构回顾

引擎三层：

```
    Syllable 序列                →  关键流程
 ───────────────────────────────────────────
 1. parseSyllables(text)           text → Syllable[]  (语言相关)
 2. scheme.keyOf(final)            final → rhyme-group key  (语言相关)
 3. matchFull/Tail/Head            key[] ⇔ key[]  (语言无关)
```

**好消息**：第 3 层（矩阵级匹配、分级宽松、cluster 挖掘、可视化）完全与
语言无关——只依赖一个 `string[]` 叫 rhyme-group key。换语言只需要
重写前两层。

**现状**：
- 第 1 层：`src/lib/core/pinyin/` 中文专用，加 `english.ts` 静态表做英文
- 第 2 层：`src/lib/core/rhyme/schemes/` 4 套中文 scheme

---

## 英文系统性支持

### 当前方案的局限

`src/lib/core/pinyin/english.ts` 是 ~80 词的**手工静态表**，够 demo
但不能扩到几千上万词。

### 完整方案

用 **CMU Pronouncing Dictionary**（公开域，~130k 英文单词，含音素序列）：

```
CAT    K AE1 T
CATS   K AE1 T S
FLOW   F L OW1
```

每条是音素序列 `[音素, 音素, …]`。规则：
- 取最后一个**重读元音**（带 1 或 2 数字的音素）
- 元音 + 该元音之后的所有辅音 = **英文 final**
- 比如 "flow" 最后重读元音 OW1 → final = "OW1"
- 比如 "cats" → 最后重读 AE1，后面 T + S → final = "AE1TS"

然后把每个英文 final 映射到一个**韵组 key**（跨语言的 unified rhyme-group）。
比如：
- OW1 → 相当于中文"尤韵"
- AE1 → 相当于中文"麻韵"（的近似）
- AY1 → 相当于中文"开韵"

这步是**语音近似**，需要研究 & 调表。优点：有了这层，英文和中文可以
真正跨语言押韵（"flow" 与 "高" 同韵）。

### 工作量

- `src/lib/core/english/` 新模块：加载 CMUdict (~2 MB 压缩)、提取 final
- 2-3 天工作量写语素规则 + 跨语言 final 映射表
- 加一个 `EnglishSyllable → UnifiedRhymeKey` 层，让中英 cluster 能共存

---

## 日语支持

### 日语押韵相对简单

日语只有 5 个元音 (a, i, u, e, o)，mora（拍）级对齐，无声调。押韵
本质上是最后一个 mora 的元音是否相同。

### 实现路径

**1. 分词**
日语需要分词才能从 raw 汉字/假名/汉字混合文本拆出词。社区有成熟的 JS 库：
- `kuromoji.js`（纯 JS MeCab 移植，~20 MB 字典）
- `budoux`（Google 的简易分词，KB 级）

**2. 注音**
分词后每个词有读音（假名序列）。可以直接用 kuromoji 的 reading 字段，
或者对汉字部分用 kanji→kana 转换。

**3. final 提取**
取每个 mora 的元音，最后一个 mora 的元音 = final。例如：
- 「歌う」(utau) → u, ta, u → final "u"
- 「日本」(nihon) → ni, ho, n → final "on" (n coda +前一个 vowel)
- 「桜」(sakura) → sa, ku, ra → final "a"

**4. scheme**
日语只要一个 "strict" scheme 就够：相同元音 + 相同 coda (N/無) = rhyme。
5 个元音 × 2 coda = 10 个 rhyme-group。

### 工作量

- `src/lib/core/japanese/` 新模块
- 加 kuromoji.js 依赖（bundle 会大增，考虑 lazy load）
- 写 hiragana → final 映射（简单）
- 2-3 天工作量

### 语料

- JMdict（公开的日语词典，~190k 词条）
- Wiktionary Japanese
- 日语歌词语料（版权风险，需谨慎）

---

## 跨语言 cluster（野心目标）

如果 1 和 2 都搞好，理论上可以做**跨语言 cluster 挖掘**：

```
cluster "韵组：-ou"
  中文成员：风起云涌 / 风雨无阻 / 同舟共济
  英文成员：flow / low / bro
  日文成员：葡萄(budou) / 凍う(kōu)
```

技术上：把三种语言的 final 都映射到一个 **跨语言统一韵组** 空间（
一个 IPA-like 表示），然后 matcher 不变。

UX 上：用户可以选择"只要中文 / 要中文+英文 / 全部三种"。

---

## 推荐实施顺序

1. **英文 CMUdict 版本**（中等工作量，直接提升用户体验）
   → 把现有静态表替换成 ~10k 常用英文词的完整支持
2. **日语基础支持**（较大工作量但自成一体）
   → 新增 "日语" 模式，有自己的 demo 页
3. **跨语言 cluster**（高风险高回报）
   → 需要精心设计跨语言韵组映射，质量风险大

---

## 相关决策

- [D-002](DECISIONS.md#d-002)：押韵匹配永远不走 LLM，语言扩展也遵循
- 新增语言不依赖网络资源；词典资源 ship 进 static/ 或 npm 依赖
