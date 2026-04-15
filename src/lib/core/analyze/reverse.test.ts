import { describe, it, expect } from 'vitest';
import { reverseAnalyze } from './reverse.js';
import { strictScheme, shisanzheScheme } from '../rhyme/schemes/index.js';

describe('reverseAnalyze · empty / trivial inputs', () => {
  it('handles empty input gracefully', () => {
    const r = reverseAnalyze('', strictScheme);
    expect(r.lines).toEqual([{ text: '', index: 0, syllables: [], keys: [] }]);
    expect(r.pairs).toEqual([]);
    expect(r.groups).toEqual([]);
    expect(r.maxTailK).toBe(0);
  });

  it('treats a single line with no Chinese as no rhymes', () => {
    const r = reverseAnalyze('hello world', strictScheme);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].syllables).toHaveLength(0);
    expect(r.pairs).toHaveLength(0);
  });
});

describe('reverseAnalyze · two-line tail rhyme', () => {
  it('detects a 1-syllable tail rhyme (ending on the same final)', () => {
    // 你好 (ni3-hao3) vs 我好 (wo3-hao3) — both end in 'ao'/遥条辙
    const r = reverseAnalyze('你好\n我好', strictScheme);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]).toMatchObject({ indexA: 0, indexB: 1, tailK: 1 });
    expect(r.maxTailK).toBe(1);
  });

  it('detects a 2-syllable tail rhyme', () => {
    // "我爱你" (wo3-ai4-ni3) vs "他爱你" (ta1-ai4-ni3)
    // Both end in 'ai'+'i' — tail K should be 2.
    const r = reverseAnalyze('我爱你\n他爱你', strictScheme);
    expect(r.pairs[0].tailK).toBe(2);
    expect(r.maxTailK).toBe(2);
  });
});

describe('reverseAnalyze · scheme sensitivity', () => {
  it('extends the matching tail under 十三辙 vs strict', () => {
    // 山 (shan1, 言前辙) vs 天 (tian1, 言前辙) — different finals (an vs ian),
    // same 辙. Strict: K=0, 十三辙: K=1.
    expect(reverseAnalyze('山\n天', strictScheme).maxTailK).toBe(0);
    expect(reverseAnalyze('山\n天', shisanzheScheme).maxTailK).toBe(1);
  });
});

describe('reverseAnalyze · head rhyme', () => {
  it('detects a head rhyme separately from tail', () => {
    // 你好世界 vs 你好朋友 — share a 2-syllable head ("你好") but tails differ.
    const r = reverseAnalyze('你好世界\n你好朋友', strictScheme);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0].headK).toBe(2);
    expect(r.pairs[0].tailK).toBe(0);
  });
});

describe('reverseAnalyze · grouping by last-syllable key', () => {
  it('groups lines that end on the same rhyme', () => {
    const r = reverseAnalyze('你好\n他好\n他妈', strictScheme);
    // 你好 / 他好 end on 'ao'; 他妈 ends on 'a'. Two groups but one is singleton.
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].lineIndices).toEqual([0, 1]);
  });

  it('treats lines with no Chinese as ungroupable', () => {
    const r = reverseAnalyze('你好\nhello\n他好', strictScheme);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].lineIndices).toEqual([0, 2]); // skips the 'hello' line
  });
});

describe('reverseAnalyze · the canonical Capper passage', () => {
  // Three lines from "年轻的国王们" — they end on 相对华丽 / 姜维的戏 / 降维打击.
  const passage = `观众们拍手叫好剪裁的相对华丽
都喜欢动画片儿看不懂姜维的戏
都是同龄人我本来没想降维打击`;

  it('finds a 4-syllable tail rhyme between L1 and L3 under 十三辙', () => {
    const r = reverseAnalyze(passage, shisanzheScheme);
    // L1 vs L3: 相对华丽 vs 降维打击 →
    //   -4: 江阳辙=江阳辙, -3: 灰堆辙=灰堆辙,
    //   -2: 发花辙=发花辙 (ua and a both 发花),
    //   -1: 一七辙=一七辙
    // → tailK = 4
    const l1l3 = r.pairs.find((p) => p.indexA === 0 && p.indexB === 2);
    expect(l1l3).toBeDefined();
    expect(l1l3!.tailK).toBe(4);
  });

  it('reports a smaller tail between L1 and L2 (the third position breaks)', () => {
    const r = reverseAnalyze(passage, shisanzheScheme);
    // L1 vs L2: 相对华丽 vs 姜维的戏 → -2 is 发花 vs 梭波 (ua vs e), break.
    // tailK = 1 (only -1 一七辙 matches).
    const l1l2 = r.pairs.find((p) => p.indexA === 0 && p.indexB === 1);
    expect(l1l2!.tailK).toBe(1);
  });

  it('reports maxTailK = 4 for the whole passage', () => {
    const r = reverseAnalyze(passage, shisanzheScheme);
    expect(r.maxTailK).toBe(4);
  });

  it('groups all three lines together because they share 一七辙 at the tail', () => {
    const r = reverseAnalyze(passage, shisanzheScheme);
    // All three end on 一七辙 → one group of 3 lines.
    const group = r.groups.find((g) => g.lineIndices.length === 3);
    expect(group).toBeDefined();
    expect(group!.lineIndices).toEqual([0, 1, 2]);
  });
});
