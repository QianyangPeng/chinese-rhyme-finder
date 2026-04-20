# 写作页 v3 设计文档

**日期**: 2026-04-20
**状态**: Draft — 用户口头批准开始实现（"可以开始实现了，看好你哦"）
**前一版**: `docs/superpowers/specs/2026-04-19-write-page-design.md`（v1 IDE-scheme 设想，未实施）

## 1. 目标

把 `/write` 从 v2 的 "每段一个圆角卡片 + 右侧每 anchor 一个 sub-card" 结构改造成一个 IDE 感的多段落编辑器（左）+ 右侧固定候选面板。押韵关系通过**颜色自动分组**呈现 —— 用户不需要手动告诉系统谁和谁押韵，系统看尾韵自动分组并上色。

核心价值：
- 写歌词时一眼看出 "这句和哪句押"（同色就是同组）
- 非押韵的字不做高亮，避免视觉噪音
- 点选句中任意词可加为额外押韵锚点（句中押韵）

## 2. Non-goals (v1)

- 跨段落押韵分组（每段独立染色）
- 自动 AABB/ABAB pattern enforcement（放弃 v1 spec 的 scheme enforcement）
- LRC 导出 / 分享卡片图 / AI 续写
- 移动端手势优化（响应式可用即可）
- 深色模式定制配色（CSS var 走网页的主题切换）

## 3. Visual 设计（锁定 v4 mockup）

参见 `.superpowers/brainstorm/…/direction-v4.html`。关键决定：

- **页面结构**：顶栏（简洁）+ 主区 grid `1fr 22rem`（编辑器 / 候选面板）
- **段落结构**：横向 flex = `[4px 纯色条 | 32px line-num gutter | 内容区]`，无圆角框
- **行间**：zebra 条纹（暖琥珀 4% / 透明交替）
- **Anchor 词**：在编辑器里用**色框 + 淡色背景**包围（边框 1.5px + 圆角 4px + bg 10% alpha）
- **颜色**：tailwind-500 饱和度，同押韵组共色
- **字体**：
  - 编辑器正文：`Noto Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, system-ui, sans-serif`
  - 标题：同上 + weight 500-700，"写作" 顶栏可用 `Noto Serif SC` 粗体作唯一装饰
  - 行号 / pinyin：`JetBrains Mono, ui-monospace`
  - **禁用**：所有 ZCOOL 装饰字体 / 手写体 / emoji 装饰 / 倾斜元素
- **"+ 加为押韵锚点"按钮**：水平放置，纯色橙 (`#f59e0b`)，不倾斜不渐变

## 4. 押韵组数据模型

### 4.1 类型

```ts
// 已有的 Anchor 扩展：
interface Anchor {
  id: string
  text: string
  start: number   // 段落内字符偏移
  end: number
  toneMode: ToneMode
  auto: boolean    // 自动检测 vs 用户选中
  lineIndex?: number
  // 新增：
  groupId: string  // 同押韵组共享
  colorIdx: number // 0..N−1，调色板下标
  showsPanel: boolean  // 是否在右侧候选面板里占一块
}

// 派生视图：
interface RhymeGroup {
  id: string
  colorIdx: number
  members: Anchor[]  // 按 start 升序
}
```

### 4.2 调色板

10 色 tailwind-500（够用；冲突概率低）：
```
blue-500, pink-500, green-500, amber-500, purple-500,
teal-500, rose-500, indigo-500, lime-500, orange-500
```

第 N 组轮换 `palette[N % 10]`。

### 4.3 组指派算法

对每段独立运行：

```ts
function assignRhymeGroups(anchors: Anchor[]): Anchor[] {
  const sorted = [...anchors].sort((a, b) => a.start - b.start)
  const groupByKey = new Map<string, { id: string; colorIdx: number }>()
  let groupCount = 0

  return sorted.map(a => {
    const syl = parseSyllables(a.text)
    const lastFinal = syl.length > 0 ? syl[syl.length - 1].final : ''
    const key = strictScheme.keyOf(lastFinal) || '_unknown'

    let group = groupByKey.get(key)
    if (!group) {
      group = { id: `g${groupCount}`, colorIdx: groupCount }
      groupByKey.set(key, group)
      groupCount++
    }
    return { ...a, groupId: group.id, colorIdx: group.colorIdx }
  })
}
```

### 4.4 `showsPanel` 规则

- **Manual anchor**: 永远 `showsPanel = true`（用户显式添加的，要看候选）
- **Auto anchor**: 该组内 start-偏移最小的才 `showsPanel = true`。后续同组的 auto anchor 是 "纯高亮"，不占面板空间。

用户的诉求："L2 尾如果和 L1 不押，转到 L3 时 L2 成新 anchor，L3 若押 L1 或 L2 就共色" —— 正是此逻辑的自然结果。

### 4.5 组判定的 rhyme 严格度

v1 固定用 `strictScheme.keyOf(最后一个 final)` —— 只看最后一个字的韵母 key 是否相等。这是 "押尾韵" 的中文传统定义，对普通写作场景够用。

未来可扩展：
- 用户切到 "+声调" 时组判定也考虑声调
- 多字押：不只看最后一个字，看 last-2 或 last-3
- Scheme 切到十三辙 / 宽韵

## 5. 编辑器实现：overlay 技巧

### 5.1 问题
`<textarea>` 是纯文本，不能在字上渲染带色框的 span。我们要：
- 用户仍在 textarea 里打字、选中、IME 输入都正常
- 视觉上看到 anchor 词有色框

### 5.2 方案：透明 textarea 叠在装饰层上方

```html
<div class="editor-body" style="position: relative; min-height: auto;">
  <!-- 装饰层（overlay）：anchor spans + zebra stripes，文字不可见（transparent） -->
  <div class="overlay" aria-hidden="true">
    <div class="line line-0">观众们拍手<span class="anchor" style="border-color: var(--c0)">叫好</span></div>
    <div class="line line-1">剪裁的相对<span class="anchor" style="border-color: var(--c0)">华丽</span></div>
    ...
  </div>

  <!-- textarea：透明底 + 可见文字，在上层接收交互 -->
  <textarea class="text" value={text} oninput={...}></textarea>
</div>
```

CSS:
```css
.overlay, .text {
  position: absolute; inset: 0;
  padding: 6px 14px;
  font: inherit;
  line-height: 1.75;
  white-space: pre;         /* 禁换行，避免 overlay 和 textarea 对不齐 */
  overflow: hidden;
}
.overlay { color: transparent; user-select: none; pointer-events: none; }
.overlay .line:nth-child(even) { background: rgba(245,158,11,0.04); }
.overlay .anchor { border: 1.5px solid; border-radius: 4px; padding: 0 5px; background: color-mix(...); }
.text { background: transparent; color: var(--text-primary); border: 0; resize: none; overflow-x: auto; }
```

### 5.3 对齐要点
- 两层 padding / font / line-height / white-space / letter-spacing 完全一致
- `white-space: pre` 禁换行；长行横向滚动。绝大多数歌词行不会长到需要 wrap
- CJK 固定宽度字符 → 对齐稳定；混 Latin 字符时可能有 <1px 抖动，肉眼忽略

### 5.4 Overlay 渲染
每次 `text` 或 `anchors` 变化时重建 overlay HTML：
- 按 `\n` 切行
- 对每行，找出覆盖该行的 anchors（按 anchor.start/end 是否落在行的 [lineStart, lineEnd] 区间）
- 在 plain-text 上插入 `<span class="anchor" style="...">…</span>` 包裹 anchor 文字
- 处理 XSS：text 要 escape（`<>&`）

## 6. 交互

### 6.1 选中 → 加为押韵锚点
- Textarea 的 `onselectionchange` / `onkeyup` / `onmouseup` 监听 selectionStart/End
- 若 selectionEnd > selectionStart 且选中 text 全是 CJK：右上角浮出 "+ 加为押韵锚点" 按钮
- 点击按钮：
  1. 构造 manual anchor（`makeManualAnchor`）
  2. 执行**重叠替换**（见 6.2）
  3. `onManualAnchorsChange(new list)`

### 6.2 重叠替换规则
用户说 "如果选中的字段包含已经在押韵列表的文字，会覆盖掉之前需要押韵的文字"。解释为：

> 新 anchor 的 `[newStart, newEnd]` 如果与任何现有 anchor 的 `[a, b]` 有区间重叠（非空交集），则移除所有重叠者，再插入新 anchor。

实现：
```ts
function addWithOverlapReplace(existing: Anchor[], newA: Anchor): Anchor[] {
  const kept = existing.filter(a =>
    a.end <= newA.start || a.start >= newA.end  // 无重叠
  )
  return [...kept, newA]
}
```

同时适用于 auto 和 manual anchors？—— auto 是算法产物，不应被用户显式删除。实现上：只对 manual anchors 应用重叠替换。auto anchor 和 manual 的重叠是允许的（两者 independently 维护）；渲染时要分开跟踪。

**修正**：应用于所有 manual anchors 时，auto anchors 不受影响（它们在下一轮自动重算时会根据新的 text 更新）。

### 6.3 点击候选 → 插入
保留 v2 行为：点击候选卡的某条 hit → 插入到当前光标处（`insertAtCursor`）。

## 7. 候选面板（右 22rem）

### 7.1 内容范围
只显示当前 focused paragraph 的 anchors（且 `showsPanel=true`）。非 focused paragraph 的 anchors 不加载候选。

### 7.2 Anchor 块结构
每个 anchor 一块，从上到下：
```
[色条 border-left] [Anchor 文字 + 色框] [pinyin] [L<N> 尾/中] ·········· [韵/韵+调 toggle] [×]
  ----------------------------------------------------
  [Level 0 · 全押 · N 条]
    [色条 源区] [▾ 成语 5 种·11 条]
      [chip] [chip] [chip]
    [色条 源区] [▸ 词典 8 种·15 条]
  [Level 1 · 1位放宽 · …]
  …
```

### 7.3 复用现有结构
Level / source section / tail-group chip / 展开看 hits —— 完全沿用 `AnchorCard.svelte` v2 里已有的 UI。改动只是：
- 最外层的 "bordered rounded card" → "color-bar + header + body"
- 颜色 prop 从 `anchor.auto ? blue : amber` → `palette[anchor.colorIdx]`
- 点击 hit → `onInsertCandidate(text)` 保留

## 8. 实施阶段

| 阶段 | 内容 | 预计提交 |
|---|---|---|
| P1 | 数据模型：Anchor 加 groupId/colorIdx/showsPanel；assignRhymeGroups 函数 + 测试 | 1 commit |
| P2 | ParagraphCard 布局重构（色条 + gutter + 内容），候选面板升格为 page-level 右栏 | 1 commit |
| P3 | 编辑器 overlay 实现：带 anchor 色框 + zebra + 行号对齐 | 1 commit |
| P4 | 选中 → 浮动按钮 → 加锚点 + 重叠替换 | 1 commit |
| P5 | Polish：顶栏字体 / 颜色微调 / deploy verify | 1 commit |

每阶段 build + typecheck 绿后 commit。失败立刻回滚。

## 9. 已知 risks

- **Overlay 对齐**：跨浏览器字体 metric 差异。缓解：测试 Chrome/Safari/Firefox，font-face 固定
- **长段落性能**：每次打字 reassignRhymeGroups。段落 ≤100 行 × anchors ≤20 → 耗时 ~1ms。OK
- **IME 输入**：textarea 原生 OK；overlay 是只读装饰，不干扰
- **重叠替换对 auto anchors 是否生效**：定了只影响 manual，auto 自己在下一轮 detect 时更新
- **颜色对比度**：tailwind-500 在 light 模式对比够，dark 模式需要 bg 10% alpha 调整为更淡

## 10. Open questions

暂无。所有决定在上述各节显式写明。用户若临开发中想改，单独 commit 作为 follow-up。
