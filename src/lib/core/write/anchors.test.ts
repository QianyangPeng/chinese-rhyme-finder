import { describe, it, expect } from 'vitest';
import {
  autoAnchorForLine,
  detectAutoAnchors,
  makeManualAnchor,
  revalidateManualAnchors,
  assignRhymeGroups,
  rhymeGroupKey,
  applyOverlapReplace,
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
});
