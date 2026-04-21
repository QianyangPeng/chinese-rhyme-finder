import { describe, it, expect } from 'vitest';
import {
  autoAnchorForLine,
  detectAutoAnchors,
  makeManualAnchor,
  revalidateManualAnchors,
  assignRhymeGroups,
  rhymeGroupKey,
  applyOverlapReplace,
  detectEchoAnchors,
  type Anchor
} from './anchors.js';

// Helper for constructing fake Anchor records in tests.
function anchor(
  id: string,
  text: string,
  start: number,
  opts: { auto?: boolean; lineIndex?: number } = {}
): Anchor {
  return {
    id,
    text,
    start,
    end: start + text.length,
    toneMode: 'exact',
    auto: opts.auto ?? true,
    lineIndex: opts.lineIndex
  };
}

// Small fake dictionary for tests.
const DICT = new Set([
  '傻瓜', '糟糕', '一个', '只是', '世界', '降维打击', '大海',
  '开学', '岁月静好', '玻璃', '魔力', '剥离', '作弊'
]);

describe('autoAnchorForLine', () => {
  it('picks the 2-char dictionary word at the tail', () => {
    const a = autoAnchorForLine('我只是一个傻瓜', 0, 0, DICT);
    expect(a).not.toBeNull();
    expect(a!.text).toBe('傻瓜');
    expect(a!.start).toBe(5);
    expect(a!.end).toBe(7);
    expect(a!.auto).toBe(true);
    expect(a!.toneMode).toBe('exact');
  });

  it('prefers the longest match (4 > 3 > 2)', () => {
    const a = autoAnchorForLine('今日的岁月静好', 0, 0, DICT);
    expect(a!.text).toBe('岁月静好');
    expect(a!.start).toBe(3);
  });

  it('falls back to last 2 chars when no dictionary match', () => {
    const a = autoAnchorForLine('我吃饭了哎呀', 0, 0, DICT);
    expect(a).not.toBeNull();
    // "哎呀" is not in our fake dict but 2-char fallback still applies
    expect(a!.text).toBe('哎呀');
  });

  it('returns null for lines with < 2 CJK chars', () => {
    expect(autoAnchorForLine('a', 0, 0, DICT)).toBeNull();
    expect(autoAnchorForLine('我', 0, 0, DICT)).toBeNull();
    expect(autoAnchorForLine('', 0, 0, DICT)).toBeNull();
  });

  it('skips trailing punctuation', () => {
    const a = autoAnchorForLine('我只是一个傻瓜！', 0, 0, DICT);
    expect(a!.text).toBe('傻瓜');
  });

  it('honors lineStartOffset for multi-line paragraphs', () => {
    // Second line starts at offset 8 (first line "我是好人\n" = 5 chars)
    const a = autoAnchorForLine('我只是一个傻瓜', 1, 8, DICT);
    expect(a!.start).toBe(8 + 5);
    expect(a!.end).toBe(8 + 7);
  });
});

describe('detectAutoAnchors', () => {
  it('finds one anchor per non-empty line', () => {
    const text = '我只是一个傻瓜\n世界对我糟糕';
    const anchors = detectAutoAnchors(text, DICT);
    expect(anchors).toHaveLength(2);
    expect(anchors[0].text).toBe('傻瓜');
    expect(anchors[0].lineIndex).toBe(0);
    expect(anchors[1].text).toBe('糟糕');
    expect(anchors[1].lineIndex).toBe(1);
    // Offsets align to the paragraph: line 2 starts at 8 (after '\n')
    expect(anchors[1].start).toBe(8 + 4);
  });

  it('skips blank lines', () => {
    const text = '我只是一个傻瓜\n\n世界对我糟糕';
    const anchors = detectAutoAnchors(text, DICT);
    expect(anchors).toHaveLength(2);
    expect(anchors[1].lineIndex).toBe(2);
  });
});

describe('makeManualAnchor', () => {
  it('creates an anchor from a valid selection', () => {
    const a = makeManualAnchor('我只是一个傻瓜', 1, 3);
    expect(a).not.toBeNull();
    expect(a!.text).toBe('只是');
    expect(a!.auto).toBe(false);
  });

  it('trims non-CJK edges', () => {
    const a = makeManualAnchor(' 只是 ', 0, 4);
    expect(a!.text).toBe('只是');
    expect(a!.start).toBe(1);
    expect(a!.end).toBe(3);
  });

  it('rejects selections mixed with punctuation inside', () => {
    const a = makeManualAnchor('只,是', 0, 3);
    expect(a).toBeNull();
  });

  it('rejects empty / whitespace-only selections', () => {
    expect(makeManualAnchor('   ', 0, 3)).toBeNull();
    expect(makeManualAnchor('abc', 0, 0)).toBeNull();
  });
});

describe('revalidateManualAnchors', () => {
  it('keeps anchors whose offsets still match', () => {
    const text = '我只是一个傻瓜';
    const anchors = [{ id: 'x', text: '只是', start: 1, end: 3, toneMode: 'exact' as const, auto: false }];
    const out = revalidateManualAnchors(text, anchors);
    expect(out).toEqual(anchors);
  });

  it('snaps anchor to new offset when text moves', () => {
    const text = '我真的只是一个傻瓜'; // inserted "真的" before "只是"
    const anchors = [{ id: 'x', text: '只是', start: 1, end: 3, toneMode: 'exact' as const, auto: false }];
    const out = revalidateManualAnchors(text, anchors);
    expect(out).toHaveLength(1);
    expect(out[0].start).toBe(3);
    expect(out[0].end).toBe(5);
  });

  it('drops anchors whose text no longer exists', () => {
    const text = '完全不一样';
    const anchors = [{ id: 'x', text: '只是', start: 0, end: 2, toneMode: 'exact' as const, auto: false }];
    const out = revalidateManualAnchors(text, anchors);
    expect(out).toHaveLength(0);
  });

  it('filters out auto anchors (they are regenerated, not revalidated)', () => {
    const anchors = [
      { id: 'a', text: '傻瓜', start: 0, end: 2, toneMode: 'exact' as const, auto: true },
      { id: 'b', text: '只是', start: 0, end: 2, toneMode: 'exact' as const, auto: false }
    ];
    const out = revalidateManualAnchors('只是', anchors);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('b');
  });
});

describe('rhymeGroupKey', () => {
  it('returns the same key for tails ending in the same final', () => {
    // 糟糕 (ao) and 岁月静好 (ao) both end with final "ao"
    expect(rhymeGroupKey('糟糕')).toBe(rhymeGroupKey('岁月静好'));
  });

  it('returns different keys for tails with different finals', () => {
    // 糟糕 (ao) vs 只是 (i) — distinct
    expect(rhymeGroupKey('糟糕')).not.toBe(rhymeGroupKey('只是'));
  });

  it('returns a sentinel for un-parseable text rather than collapsing everything', () => {
    const a = rhymeGroupKey('');
    const b = rhymeGroupKey('xyz');
    // At minimum it must be a string; distinct texts shouldn't share
    // one catch-all group.
    expect(typeof a).toBe('string');
    expect(typeof b).toBe('string');
  });
});

describe('assignRhymeGroups', () => {
  it('groups two anchors that rhyme and gives them the same colorIdx', () => {
    const out = assignRhymeGroups([
      anchor('a', '糟糕', 0, { lineIndex: 0 }),
      anchor('b', '岁月静好', 10, { lineIndex: 1 })
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].groupId).toBe(out[1].groupId);
    expect(out[0].colorIdx).toBe(out[1].colorIdx);
  });

  it('assigns different colorIdx to non-rhyming anchors', () => {
    const out = assignRhymeGroups([
      anchor('a', '糟糕', 0, { lineIndex: 0 }),
      anchor('b', '只是', 10, { lineIndex: 1 })
    ]);
    expect(out[0].colorIdx).not.toBe(out[1].colorIdx);
    expect(out[0].groupId).not.toBe(out[1].groupId);
  });

  it('auto anchors: only the first one in a group shows panel', () => {
    const out = assignRhymeGroups([
      anchor('a', '糟糕', 0, { lineIndex: 0 }),
      anchor('b', '岁月静好', 10, { lineIndex: 1 })
    ]);
    expect(out[0].showsPanel).toBe(true);
    expect(out[1].showsPanel).toBe(false); // same rhyme, later in paragraph
  });

  it('manual anchors always show panel even when group already has an anchor', () => {
    const out = assignRhymeGroups([
      anchor('a', '糟糕', 0, { auto: true, lineIndex: 0 }),
      anchor('m', '岁月静好', 10, { auto: false })
    ]);
    expect(out[0].groupId).toBe(out[1].groupId); // same group (both end in ao)
    expect(out[0].showsPanel).toBe(true);
    expect(out[1].showsPanel).toBe(true); // manual always shows
  });

  it("reproduces the user's L1+L3 share / L2 standalone scenario", () => {
    // L1 ends in ao, L2 ends in i, L3 ends in ao.
    // Expected: L1 and L3 share group+color; L2 gets its own group.
    // Expected: L1 shows panel, L2 shows panel (first in its group),
    //           L3 does not (second auto in L1's group).
    const out = assignRhymeGroups([
      anchor('l1', '糟糕', 0, { lineIndex: 0 }),
      anchor('l2', '只是', 10, { lineIndex: 1 }),
      anchor('l3', '岁月静好', 20, { lineIndex: 2 })
    ]);
    expect(out[0].groupId).toBe(out[2].groupId);
    expect(out[1].groupId).not.toBe(out[0].groupId);
    expect(out[0].showsPanel).toBe(true);
    expect(out[1].showsPanel).toBe(true);
    expect(out[2].showsPanel).toBe(false);
  });

  it('determines "first in group" by start offset, not input order', () => {
    // Input order reversed: l3 first, then l1. l1 has lower start.
    const out = assignRhymeGroups([
      anchor('l3', '岁月静好', 20, { lineIndex: 2 }),
      anchor('l1', '糟糕', 0, { lineIndex: 0 })
    ]);
    // Output preserves INPUT order (l3 first, l1 second) but group
    // membership is computed in start order (l1 first in group).
    const l3 = out.find((x) => x.id === 'l3')!;
    const l1 = out.find((x) => x.id === 'l1')!;
    expect(l1.showsPanel).toBe(true);  // leftmost auto in group
    expect(l3.showsPanel).toBe(false); // later auto in same group
  });

  it('color indices are assigned in order of first appearance (by start)', () => {
    const out = assignRhymeGroups([
      anchor('l1', '糟糕', 0),       // ao → colorIdx 0
      anchor('l2', '只是', 10),      // i  → colorIdx 1
      anchor('l3', '岁月静好', 20),  // ao → colorIdx 0 (same group as l1)
      anchor('l4', '大海', 30)       // ai → colorIdx 2
    ]);
    expect(out[0].colorIdx).toBe(0);
    expect(out[1].colorIdx).toBe(1);
    expect(out[2].colorIdx).toBe(0);
    expect(out[3].colorIdx).toBe(2);
  });

  it('handles empty anchor list', () => {
    expect(assignRhymeGroups([])).toEqual([]);
  });

  it('preserves input order in returned array', () => {
    const input = [
      anchor('third', '岁月静好', 20),
      anchor('first', '糟糕', 0),
      anchor('second', '只是', 10)
    ];
    const out = assignRhymeGroups(input);
    expect(out.map((a) => a.id)).toEqual(['third', 'first', 'second']);
  });
});

describe('applyOverlapReplace', () => {
  it('adds a non-overlapping anchor without removing others', () => {
    const existing = [anchor('a', '叫好', 0, { auto: false })]; // [0,2]
    const newA = anchor('b', '华丽', 10, { auto: false });        // [10,12]
    const out = applyOverlapReplace(existing, newA);
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.id).sort()).toEqual(['a', 'b']);
  });

  it('replaces an anchor whose range is fully contained by the new one', () => {
    const existing = [anchor('old', '打击', 6, { auto: false })]; // [6,8]
    const newA = anchor('new', '降维打击', 4, { auto: false });    // [4,8]
    const out = applyOverlapReplace(existing, newA);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('new');
  });

  it('replaces an existing anchor that contains the new one (shrink)', () => {
    const existing = [anchor('big', '降维打击', 4, { auto: false })]; // [4,8]
    const newA = anchor('small', '打击', 6, { auto: false });          // [6,8]
    const out = applyOverlapReplace(existing, newA);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('small');
  });

  it('replaces multiple overlapping anchors at once', () => {
    const e1 = anchor('e1', '降维', 4, { auto: false }); // [4,6]
    const e2 = anchor('e2', '打击', 6, { auto: false }); // [6,8]
    const newA = anchor('new', '降维打击', 4, { auto: false }); // [4,8] covers both
    const out = applyOverlapReplace([e1, e2], newA);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('new');
  });

  it('keeps touching-but-not-overlapping anchors (endpoint equality is not overlap)', () => {
    const e = anchor('e', '降维', 4, { auto: false }); // [4,6]
    const newA = anchor('new', '打击', 6, { auto: false }); // [6,8] touches at 6
    const out = applyOverlapReplace([e], newA);
    expect(out).toHaveLength(2);
  });

  it('handles partial overlap: replaces the overlapping one', () => {
    const existing = [anchor('e', '心情', 3, { auto: false })]; // [3,5]
    const newA = anchor('new', '情人', 4, { auto: false });      // [4,6]
    const out = applyOverlapReplace(existing, newA);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('new');
  });

  it('same-range add replaces (idempotent net effect)', () => {
    const existing = [anchor('old', '打击', 6, { auto: false })];
    const newA = anchor('new', '打击', 6, { auto: false });
    const out = applyOverlapReplace(existing, newA);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('new');
  });

  it('single-word guard: replaces old when old is a dict word', () => {
    // Text "呀土豆"; old anchor "土豆" (dict word); user selects "呀土"
    const existing = [anchor('old', '土豆', 1, { auto: false })]; // [1,3]
    const newA = anchor('new', '呀土', 0, { auto: false });       // [0,2]
    const dict = new Set(['土豆']);
    const out = applyOverlapReplace(existing, newA, (t) => dict.has(t));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('new');
  });

  it('single-word guard: rejects new when old is a user-composed phrase', () => {
    // Text "我们降维打击吧"; old anchor "我们降维" (hand-composed, not a
    // dict word); user selects "维打" which overlaps. Since old is
    // multi-word, preserve it — the new add is rejected.
    const existing = [anchor('composed', '我们降维', 0, { auto: false })]; // [0,4]
    const newA = anchor('new', '维打', 3, { auto: false });                 // [3,5]
    const dict = new Set(['降维打击', '打击', '我们']); // "我们降维" NOT in dict
    const out = applyOverlapReplace(existing, newA, (t) => dict.has(t));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('composed');
  });

  it('single-word guard: when ALL overlapping olds are single words, all are replaced', () => {
    const e1 = anchor('e1', '土豆', 0, { auto: false }); // [0,2]
    const e2 = anchor('e2', '薯条', 2, { auto: false }); // [2,4]
    // e1 and e2 don't overlap each other but both overlap newA.
    const newA = anchor('new', '土豆薯条', 0, { auto: false }); // [0,4]
    const dict = new Set(['土豆', '薯条']);
    const out = applyOverlapReplace([e1, e2], newA, (t) => dict.has(t));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('new');
  });

  it('single-word guard: mixed — one dict word + one phrase → rejects new (preserves phrase)', () => {
    const e1 = anchor('e1', '土豆', 0, { auto: false });       // [0,2], in dict
    const e2 = anchor('e2', '薯条的味道', 2, { auto: false }); // [2,7], NOT in dict
    const newA = anchor('new', '豆薯条的', 1, { auto: false }); // [1,5], overlaps both
    const dict = new Set(['土豆']); // only 土豆 is a "word"
    const out = applyOverlapReplace([e1, e2], newA, (t) => dict.has(t));
    // Since e2 is a non-dict phrase, reject the new add entirely.
    // Both e1 and e2 survive.
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.id).sort()).toEqual(['e1', 'e2']);
  });

  it('no single-word predicate → behaves like the original always-replace', () => {
    const existing = [anchor('old', '这个短语', 0, { auto: false })];
    const newA = anchor('new', '短语', 2, { auto: false });
    const out = applyOverlapReplace(existing, newA); // default predicate
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('new');
  });
});

describe('detectEchoAnchors', () => {
  // Dict covering the words we care about. rhymeGroupKey:
  //   相对 → uei, 姜维 → uei, 降维 → uei, 华丽 → i,
  //   打击 → i, 同龄 → ing, 糟糕 → ao
  const DICT = new Set([
    '相对', '姜维', '降维', '华丽', '打击', '同龄', '糟糕'
  ]);

  it("echoes mid-line dict words that rhyme with a seed's rhyme key", () => {
    // Paragraph: L1 has a manual anchor 相对 (uei) + an auto-tail
    // 华丽 (i). L3 has 姜维 mid-line (not a tail). Echo should find
    // 姜维 as a uei rhyme match.
    const text = '有个相对的华丽\n没有押\n看不懂姜维的戏';
    const seeds: Anchor[] = [
      // manual 相对 at offset 2 in line 0
      { id: 'm1', text: '相对', start: 2, end: 4, toneMode: 'exact', auto: false },
      // auto tail 华丽 at offset 5 in line 0
      { id: 'a1', text: '华丽', start: 5, end: 7, toneMode: 'exact', auto: true, lineIndex: 0 }
    ];
    const echoes = detectEchoAnchors(text, DICT, seeds);
    expect(echoes.length).toBeGreaterThanOrEqual(1);
    const texts = echoes.map((e) => e.text);
    expect(texts).toContain('姜维');
    // All echoes should be flagged echo=true, auto=true
    for (const e of echoes) {
      expect(e.echo).toBe(true);
      expect(e.auto).toBe(true);
    }
  });

  it('does not echo words that overlap an existing anchor', () => {
    // If 相对 is already a seed, don't re-emit 相对 as an echo.
    const text = '有个相对的戏';
    const seeds: Anchor[] = [
      { id: 'm1', text: '相对', start: 2, end: 4, toneMode: 'exact', auto: false }
    ];
    const echoes = detectEchoAnchors(text, DICT, seeds);
    expect(echoes.map((e) => e.text)).not.toContain('相对');
  });

  it('does not echo when no seeds are provided', () => {
    const text = '有个相对的华丽';
    const echoes = detectEchoAnchors(text, DICT, []);
    expect(echoes).toEqual([]);
  });

  it('does not echo words whose rhyme is not among seed rhymes', () => {
    // Only "ao" is seeded; uei words in the text should NOT be echoed.
    const text = '一个相对的糟糕\n还有个姜维';
    const seeds: Anchor[] = [
      { id: 's', text: '糟糕', start: 5, end: 7, toneMode: 'exact', auto: true, lineIndex: 0 }
    ];
    const echoes = detectEchoAnchors(text, DICT, seeds);
    // 相对 and 姜维 are uei — not matching ao seed.
    expect(echoes).toEqual([]);
  });

  it('echoes 2-char proper nouns NOT in dict when they rhyme with a seed', () => {
    // 姜维 and 降维 are names / modern compounds — not in our fake
    // dict, but they end in "uei" and should echo a uei seed.
    const text = '有个相对的事\n看不懂姜维的戏\n没想降维打击';
    const seeds: Anchor[] = [
      { id: 'm1', text: '相对', start: 2, end: 4, toneMode: 'exact', auto: false }
    ];
    // Dict notably does NOT contain 姜维 or 降维.
    const slimDict = new Set(['相对', '打击', '的事']);
    const echoes = detectEchoAnchors(text, slimDict, seeds);
    const texts = echoes.map((e) => e.text);
    expect(texts).toContain('姜维');
    expect(texts).toContain('降维');
  });

  it('does NOT accept 3/4-char non-dict candidates (avoids random CJK runs)', () => {
    // The line contains a 4-char run that isn't a dict word but
    // happens to end in a seed's rhyme. We must not echo it.
    const text = '不要乱说话随便维'; // "便维" hypothetical — trailing 维 rhymes uei
    const seeds: Anchor[] = [
      { id: 'm1', text: '相对', start: 0, end: 2, toneMode: 'exact', auto: false }
    ];
    const slimDict = new Set(['相对']);
    const echoes = detectEchoAnchors(text, slimDict, seeds);
    // The 4-char "乱说话随" isn't in dict and isn't allowed as a
    // fallback (only 2-char gets fallback). Any echoes should be
    // 2-char only, like "便维" if uei-rhyming.
    for (const e of echoes) expect(e.text.length).toBe(2);
  });

  it("assignRhymeGroups: echoes never show the panel, even if first-in-group", () => {
    // Build a group where an echo comes FIRST (by start offset) but
    // must still not take the panel slot.
    const echoFirst: Anchor = {
      id: 'echo', text: '姜维', start: 0, end: 2,
      toneMode: 'exact', auto: true, echo: true, lineIndex: 0
    };
    const autoTail: Anchor = {
      id: 'tail', text: '相对', start: 10, end: 12,
      toneMode: 'exact', auto: true, lineIndex: 1
    };
    const grouped = assignRhymeGroups([echoFirst, autoTail]);
    const gEcho = grouped.find((a) => a.id === 'echo')!;
    const gTail = grouped.find((a) => a.id === 'tail')!;
    expect(gEcho.showsPanel).toBe(false); // echoes never
    expect(gTail.showsPanel).toBe(true);  // first NON-echo auto
    // Same group (both uei), same colorIdx
    expect(gEcho.groupId).toBe(gTail.groupId);
  });
});
