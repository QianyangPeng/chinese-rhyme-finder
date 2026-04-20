import { describe, it, expect } from 'vitest';
import {
  autoAnchorForLine,
  detectAutoAnchors,
  makeManualAnchor,
  revalidateManualAnchors
} from './anchors.js';

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
