# 写作页 (`/write`) 设计文档

**日期**：2026-04-19
**状态**：Draft — 待用户审阅

---

## 1. Goal

把现有的 Search（查押韵候选）+ Analyze（分析已有文本的押韵）两个工具融合成一个「边写边押」的创作页面。用户在一个多行编辑器里写歌词/诗/rap，系统实时显示每行的押韵状态，并针对目标韵脚提供可一键插入的候选词。

核心价值：让「押韵集」从查询工具升级成创作工具，同时零新数据、零新算法、零后端，完全建立在现有基础设施之上。

## 2. Non-goals (v1)

明确不做的事，避免 scope creep：

- **分享图卡**：把草稿渲染成美图发朋友圈。Canvas 字体加载 + 文本排版复杂，延后
- **LRC 导出**：没有 beat / 时间戳信息，生成的 LRC 无意义
- **URL 分享**：多行文本塞不进 URL（浏览器 ~2000 字符上限）
- **实时协作**：需要后端，违背 static site 架构
- **Flow / 节奏分析**：目前没有 beat 数据源
- **AI 续写**：跟「纯算法」品牌定位冲突
- **移动端手势优化**：v1 只保证响应式可用，手势在 v2 打磨

## 3. User journey

```
1. 用户点导航「✍ 写作」进入 /write
2. 默认打开一个空白草稿，韵式=自由、深度=2、严格度=韵母
3. 在编辑区开始敲：
   "观众们拍手叫好"    ← L1
   "剪裁的相对华丽"    ← L2，右栏显示 "L1 和 L2 不押（自由模式）"
4. 用户从韵式下拉选「AABB」
   ─ L1 和 L2 现在被视为 A 组 + B 组的锚定行
   ─ 编辑区左侧出现 A / B 角色标签
   ─ 右栏顶部显示当前韵式结构
5. 用户敲 L3 "都是同龄人"
   ─ 右栏：角色 A，目标押 "叫好"，当前 "龄人" 没对上，✗ 0/2 押
   ─ 候选栏自动列出和 "叫好" 押韵的词（"红尘拂晓 / 岁月静好 / ..."）
6. 用户按 Tab → 把第一条候选 "红尘拂晓" 接到 L3 末尾
7. 右栏更新：L3 现在 ✓ 2/2 押
8. 用户继续写 L4，重复循环
9. 打字停顿 2 秒 → 自动保存到 localStorage 当前草稿
10. 写完点「复制」按钮 → 纯文本到剪贴板
```

## 4. Architecture

### 4.1 Page layout

```
┌────────────────────── TopNav ──────────────────────┐
│                                                    │
│ ┌─ Editor (60%) ───────┐ ┌─ AssistPanel (40%) ──┐ │
│ │                      │ │ SchemeBar            │ │
│ │  [A] 观众们拍手叫好  │ │ ├────────────────────┤ │
│ │  [B] 剪裁的相对华丽  │ │ │ LineAnalysis       │ │
│ │  [A] 都是同龄人|     │ │ │ (当前行卡片)        │ │
│ │  [B]                 │ │ ├────────────────────┤ │
│ │                      │ │ │ CandidateList      │ │
│ │  ...                 │ │ │ (可滚动)           │ │
│ │                      │ │ │                    │ │
│ └──────────────────────┘ │ └────────────────────┘ │
│                                                    │
│ Bottom bar: [Tab]补全 [⌘S]保存 [💾]草稿 [📋]复制  │
└────────────────────────────────────────────────────┘
```

### 4.2 Component tree

```
/write/+page.svelte                        (route shell)
 ├─ write/Editor.svelte                    (编辑区)
 │   ├─ 内部用 contenteditable 或 textarea
 │   └─ 维护 activeLineIndex + cursor 状态
 ├─ write/AssistPanel.svelte               (右栏容器)
 │   ├─ write/SchemeBar.svelte             (韵式 / 深度 / 严格度)
 │   ├─ write/LineAnalysis.svelte          (当前行卡)
 │   └─ write/CandidateList.svelte         (候选 + 过滤)
 ├─ write/DraftsPanel.svelte               (草稿列表抽屉)
 └─ write/BottomBar.svelte                 (快捷键提示 + 按钮)
```

### 4.3 State stores

```ts
// src/lib/stores/drafts.svelte.ts — 草稿管理
class DraftsStore {
  drafts = $state<Draft[]>([]);       // 数组上限 20
  currentDraftId = $state<string>();  // 指向正在编辑的那条
  // load / save / create / delete / rename
}

// /write/+page.svelte 内部 (不用全局 store)
let scheme = $state<SchemeConfig>({ type: 'free', depth: 2, toneMode: 'none' });
let editorText = $state('');
let activeLineIndex = $state(0);
```

### 4.4 Reused modules

| 现有模块 | 复用方式 |
|---|---|
| `searchByFinals` | 生成候选词列表 |
| `reverseAnalyze` | 每次 editorText 变化重新算所有行的 finals / keys / pairs |
| `strictScheme` | 唯一 scheme (UI 不暴露多 scheme) |
| `composeKey` + `parseSyllables` | tone-aware 匹配 |
| `sourceBadge` helper | 候选卡源角标 |
| `posFamily` helper | 分段色块（如需显示） |
| `t()` + `lang` | 所有字符串中英对照 |
| `hoveredKey` 模式 | 跨区悬停高亮 |

## 5. Scheme engine

### 5.1 Supported patterns

| ID | 含义 | Pattern 字符串 |
|---|---|---|
| `free` | 无约束 | — |
| `monorhyme` | 一韵到底 | `AAAA...`（按行数延展） |
| `aabb` | 两两成对 | `AABBCCDD...`（每组 2 行，每组换字母） |
| `abab` | 交替四行 | `ABABCDCD...`（每组 4 行，每组换字母；想要全诗交替同韵可用 `custom` 填 `AB`） |
| `custom` | 用户手填 | 任意字母串，如 `AABBA`，短则循环 |

模型上所有 scheme 都归一化成一个字母串 per line（`letters[i] = 'A' | 'B' | ...`）。自由模式所有行都是空角色 `'-'`。

### 5.2 Anchor computation

对每个非 `'-'` 角色字母，第一个出现该字母的非空行 = 该组 anchor。
后续同字母行以 anchor 的尾韵为目标。

```ts
function computeAnchors(letters: string[], lines: Line[], depth: number) {
  const anchorByLetter = new Map<string, { index: number; keys: string[] }>();
  for (let i = 0; i < letters.length; i++) {
    const L = letters[i];
    if (L === '-' || !lines[i].keys.length) continue;
    if (!anchorByLetter.has(L)) {
      const keys = lines[i].keys.slice(-depth);
      anchorByLetter.set(L, { index: i, keys });
    }
  }
  return anchorByLetter;
}
```

### 5.3 Match evaluation per line

```ts
type MatchState = 'anchor' | 'hit' | 'partial' | 'miss' | 'free';

function evaluateLine(
  lineIndex: number, letter: string, lines: Line[],
  anchors: Map<string, Anchor>, depth: number, toneMode: ToneMode
): { state: MatchState; matchedCount: number; targetKeys: string[] } {
  // free → 'free'
  // anchor row → 'anchor' (自己就是锚)
  // otherwise compare lines[i].keys.slice(-depth) vs anchor.keys
  //   all match  → 'hit'
  //   some match → 'partial'
  //   none match → 'miss'
}
```

### 5.4 Soft enforcement (no blocking)

- 编辑区**左侧独立列**（flex 布局，`<div>` 列紧贴 textarea 左边，共享同样的 `line-height` / `font-family` / `padding-top` / scroll 位置），每行一个小标签：`A ✓` 绿、`A ~` 琥珀、`A ✗` 红、`A ★` 锚定紫、`—` 灰
  - textarea scroll 时用 `onscroll` 同步到标签列的 `translateY`
  - 行数从 `editorText.split('\n').length` 派生
- **行内字符级高亮**（末尾 N 字画下划线）v1 **不做** —— textarea 不支持，需要 overlay-sync 或 contenteditable，都有坑。v1 靠左侧标签 + LineAnalysis 卡就够用
- 从不拦截输入，用户永远能自由敲

## 6. Rhyme assistance engine

### 6.1 Candidate generation

```ts
function candidatesFor(activeLineIndex: number): SearchResult | null {
  const letter = letters[activeLineIndex];
  const anchor = letter !== '-' ? anchors.get(letter) : null;
  let targetKeys: string[];
  if (anchor) {
    targetKeys = anchor.keys;                    // 约束模式：锚定的尾韵
  } else if (lines[activeLineIndex].keys.length > 0) {
    targetKeys = lines[activeLineIndex].keys.slice(-scheme.depth);
  } else {
    return null;                                  // 空行 + 自由 → 不显示候选
  }
  return searchByFinals(targetKeys, strictScheme, lexicon, {
    toneMode: scheme.toneMode,
    maxPerBucket: 200,
    requireTailMatch: true,
    windowMode: 'tail',
  });
}
```

- 用默认 tail windowMode（句中模式可作为候选过滤器暴露给用户，但默认 tail 更符合写作场景）
- 直接复用 Search 页的 `matchOffset` / tier 排序

### 6.2 Line analysis card

显示内容：
- 行号 + 角色 + 目标韵脚 finals 序列
- 当前行 chars + finals（同 Analyze 页的音节 chip）
- 尾 N 个字画参考下划线
- 命中状态句子：`✓ 2/2 押` / `~ 1/2 押` / `✗ 0/2 押` / `★ 锚定` / `— 自由`
- 目标韵 finals 和当前尾 finals 并排对照（红/绿色差比对）

### 6.3 Candidate insertion mechanics

- **Tab** 键按下行为（在编辑器有焦点且光标在行尾时）：
  - 第一次按：记录当前光标位置为 `tabAnchor`，把候选栏第一条文本插入光标处，维护一个 `tabCycleIndex=0`
  - 连按 Tab：把文本回退到 `tabAnchor`，`tabCycleIndex++`，插入候选列表第 `tabCycleIndex` 条
  - `Esc` 或任意非 Tab 字符输入：清空 `tabAnchor` 和 `tabCycleIndex`，Tab 循环结束；已插入文本保留
  - Ctrl+Z：正常 textarea 原生 undo（undo 的粒度是单次整体插入，符合预期）
- **点击候选卡** / 候选获焦时按 Enter：插入候选文本到当前行末尾（不经过 Tab 循环，点击时 `tabCycleIndex` 被清空）
- 插入永远 append，不替换已有字符，不自动加空格/标点
- Tab 循环不是无限索引增长：到候选数末尾回到 0

### 6.4 Hover-to-highlight

沿用 Search 页的 `hoveredKey` 机制。作用域扩展到编辑区：
- 悬停编辑区任意字 → 右栏所有同 key 的韵母方块 + 编辑区其他行同 key 字高亮
- 悬停候选卡或 LineAnalysis 里的韵母方块 → 编辑区对应位置高亮

## 7. Drafts & persistence

### 7.1 Draft data shape

```ts
interface Draft {
  id: string;           // crypto.randomUUID()（回退 Date.now()+Math.random 用于极老浏览器）
  title: string;        // 用户可改，默认取 content 前 12 字或 "未命名草稿"
  content: string;      // 编辑器全文
  scheme: SchemeConfig; // { type, depth, toneMode, customPattern? }
  createdAt: number;    // ms epoch
  updatedAt: number;
}

interface SchemeConfig {
  type: 'free' | 'monorhyme' | 'aabb' | 'abab' | 'custom';
  depth: 1 | 2 | 3 | 4;
  toneMode: 'none' | 'exact';
  customPattern?: string;  // 仅 type === 'custom'
}
```

### 7.2 Storage

- Key：`rhyme-finder.drafts.v1`
- Value：`{ drafts: Draft[]; currentDraftId: string }` JSON
- 上限 20 条；超了删最老（按 updatedAt 升序）
- localStorage 空间压力评估：每条 ~2KB × 20 = 40KB，远低于浏览器 5MB 配额

### 7.3 Auto-save

- 打字停顿 2 秒：保存当前草稿（只改 `updatedAt` 和 `content`）
- tab blur / 页面隐藏：立即保存
- 切换草稿或新建：先保存当前再切
- 从不在每次按键上同步写，避免 localStorage 抖动

### 7.4 Drafts UI

```
[💾 草稿] 按钮 → 侧抽屉：
┌─────────────────────────────┐
│ 草稿 (3/20)       [+ 新建]  │
├─────────────────────────────┤
│ ✓ 春天的韵                  │
│   "柳色青青 / 燕子..."      │
│   2 小时前    ×             │
├─────────────────────────────┤
│   夜路                       │
│   "街灯摇晃..."              │
│   昨天       ×              │
└─────────────────────────────┘
```

- 当前草稿带 ✓ 标记
- 点击任意条 → 载入到编辑器（先保存当前）
- × → 确认删除 (confirm dialog)
- + 新建 → 当前草稿保存后切到空白新草稿

## 8. Export

- **📋 复制**：按钮复制编辑器纯文本到剪贴板。Flash "✓ 已复制"反馈 1.5 秒
- **⬇ 下载 .txt**：浏览器触发下载 `{title}.txt`（UTF-8，LF 换行）

没有 markdown / 韵母注释 / 分享图卡。

## 9. i18n

所有新 UI 字符串走现有 `t(zh, en)` 模式。主要新增：

| zh | en |
|---|---|
| 写作 | Write |
| 韵式 | Scheme |
| 自由 | Free |
| 一韵到底 | Monorhyme |
| AABB（两两成对） | AABB (couplets) |
| ABAB（交替） | ABAB (alternating) |
| 自定义 | Custom |
| 深度 | Depth |
| 严格度 | Strictness |
| 当前行 | Current line |
| 目标押韵 | Target rhyme |
| 候选 | Candidates |
| 锚定 | Anchor |
| 草稿 | Drafts |
| 新建 | New |
| 复制 | Copy |
| 下载 | Download |
| 专注模式 | Focus mode |
| 同长度 / 短 / 长 | Same / Shorter / Longer |

## 10. Data flow

```
editorText ──┐
             ├──► reverseAnalyze(editorText, strictScheme, toneMode)
             │          │
             │          ▼
             │     lines[]: { text, chars, keys, syllables }
             │          │
scheme ──────┼──► computeLetters(scheme.type, scheme.customPattern, lines.length)
             │          │
             │          ▼
             │     letters[]: ('A'|'B'|'-')[]
             │          │
             ▼          ▼
        computeAnchors(letters, lines, scheme.depth)
                        │
                        ▼
                   anchors: Map<letter, Anchor>
                        │
         ┌──────────────┼───────────────┐
         ▼              ▼               ▼
   matchState[i]   labelColor[i]   candidatesFor(activeLine)
         │              │               │
         └──► render in Editor + AssistPanel
```

所有派生值用 `$derived` 表达，让 Svelte runtime 自动最小重算。

## 11. File layout

新增：

```
src/
  routes/
    write/
      +page.svelte                 (路由 shell + 状态)
  lib/
    components/write/
      Editor.svelte
      AssistPanel.svelte
      SchemeBar.svelte
      LineAnalysis.svelte
      CandidateList.svelte
      DraftsPanel.svelte
      BottomBar.svelte
    stores/
      drafts.svelte.ts
    core/write/
      scheme.ts                    (pattern → letters[] → anchors)
      scheme.test.ts
```

修改：

```
src/lib/components/TopNav.svelte   (加「✍ 写作」链接)
src/routes/+page.svelte            (首页入口卡改成 4 个功能)
static/sitemap.xml                 (新增 /write/ URL)
README.md                          (在「三大功能」表格加一行)
```

## 12. Testing strategy

### 12.1 Unit tests

- `scheme.test.ts`：
  - `computeLetters('monorhyme', 5)` → `['A','A','A','A','A']`
  - `computeLetters('aabb', 6)` → `['A','A','B','B','C','C']`
  - `computeLetters('abab', 8)` → `['A','B','A','B','C','D','C','D']`
  - `computeLetters('custom', 4, 'AB')` → `['A','B','A','B']` (循环)
  - `computeAnchors` 正确找出每字母的第一个非空行
  - 深度调整时 anchor keys 随之更新

- `drafts.test.ts`：
  - 添加 → 取出 → 删除 → 上限 21 条截断到 20
  - localStorage 反序列化容错（脏数据）

### 12.2 Integration

- 手动走通 `§3 user journey` 所有 10 步
- 韵式切换时，已有内容的 label/match state 立刻更新
- Tab 循环候选：连按 N 次 Tab 的每次插入都覆盖上一次
- Esc 退出 Tab 循环保留最后一次选择
- Drafts 切换时旧稿自动保存
- 纯英文行 / 空行的 edge cases

### 12.3 手动性能冒烟

- 输入 100 行各 20 字的文本：重算 < 200ms
- 候选栏 1000 条滚动：60 fps

## 13. Rollout & risks

### 13.1 Phases

1. **Phase 1 — Core editor + scheme**：editor、scheme bar、line analysis。用户能写、看到押韵状态，但候选栏是空的
2. **Phase 2 — Candidates**：CandidateList + Tab 补全 + hover 高亮
3. **Phase 3 — Drafts**：DraftsPanel + localStorage sync + auto-save
4. **Phase 4 — Polish**：复制/下载按钮、专注模式、快捷键、移动端响应式
5. **Phase 5 — SEO + 导航**：sitemap / TopNav / 首页入口卡 / README

每 phase 独立可部署；分开提 commit。

### 13.2 已知风险

- **性能**：长草稿（500+ 行）每次击键重算 reverseAnalyze 可能卡顿 → 应对：debounce 100ms，只重算 activeLineIndex 所在行 + 锚定行
- **contenteditable 坑**：浏览器实现差异大；光标位置 + 多字符输入法（IME）行为复杂 → v1 方案：用 `<textarea>` + 左侧 flex 标签列（见 §5.4）。`activeLineIndex` 由 `selectionStart` 到第几个 `\n` 之前算出来。彩色内联字符标注留作 v2（那时再评估 contenteditable 或 overlay-sync）
- **Tab 劫持**：Tab 被占用后，键盘用户 tab 出编辑器的辅助功能变难 → 应对：只在光标位于行尾时吃 Tab；否则 Tab 正常 focus-advance
- **localStorage 清空**：用户清浏览器数据会丢草稿 → 文档里提醒，v2 可考虑导出全部草稿 JSON

### 13.3 Graceful degradation

- 搜索引擎无 JS 抓取：`/write/` SSR 出空 shell + h1「写作」+ 一段描述 → 有 SEO 价值即可
- 无 localStorage（隐身模式）：仍能编辑，只是关页就丢，给个 banner 提醒

## 14. Future (v2+)

- Share image card（canvas 渲染）
- 逐行 Flow 分析（节奏 / 音节时长）
- 多光标实时协作（需后端）
- 自动断行（输入过长的句子给分行建议）
- 主题配色（深色模式以外的主题）
- LaTeX / Markdown 导出
- 集成到 VSCode 扩展（共享核心引擎）

## 15. Open questions

暂无。所有决定已在上述各节显式写明。

---

*本文档写定后即交用户审阅。审阅通过后由 writing-plans skill 生成实施计划。*
