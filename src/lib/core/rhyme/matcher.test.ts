import { describe, it, expect } from 'vitest';
import { matchFull, matchTail, matchHead, keysFor } from './matcher.js';
import { strictScheme } from './schemes/strict.js';
import { shisanzheScheme } from './schemes/shisanzhe.js';
import { looseScheme } from './schemes/loose.js';

describe('matchFull · strict mode', () => {
  it('declares a strict full match when finals are identical', () => {
    const target = ['iang', 'uei', 'a', 'i'];
    const candidate = ['iang', 'uei', 'a', 'i']; // 降维打击
    const m = matchFull(target, candidate, strictScheme);
    expect(m).not.toBeNull();
    expect(m!.isFullMatch).toBe(true);
    expect(m!.relaxationLevel).toBe(0);
    expect(m!.matchedPositions).toEqual([0, 1, 2, 3]);
  });

  it('counts each mismatched position', () => {
    // 姜维的戏 vs 降维打击 — differ at positions 2 (e vs a)
    const a = ['iang', 'uei', 'e', 'i'];
    const b = ['iang', 'uei', 'a', 'i'];
    const m = matchFull(a, b, strictScheme);
    expect(m!.relaxationLevel).toBe(1);
    expect(m!.unmatchedPositions).toEqual([2]);
  });

  it('returns null when sequence lengths differ', () => {
    expect(matchFull(['iang'], ['iang', 'uei'], strictScheme)).toBeNull();
  });

  it('treats unknown finals as never rhyming under schemes whose keyOf returns empty', () => {
    // Under 十三辙, an unrecognized final like '??' maps to '' (no 辙).
    // Two unknown finals must NOT be considered a match — empty-key
    // never rhymes, even with another empty-key.
    const m = matchFull(['??' as string], ['??' as string], shisanzheScheme);
    expect(m!.relaxationLevel).toBe(1);
    expect(m!.isFullMatch).toBe(false);
    // (For the strict scheme, where keyOf is identity, two identical
    // strings DO match — that is the strict contract; tested elsewhere.)
  });
});

describe('matchFull · 十三辙 vs strict comparison', () => {
  it('considers ang & iang & uang the same in 十三辙 but distinct in strict', () => {
    const a = ['ang'];
    const b = ['iang'];
    expect(matchFull(a, b, strictScheme)!.isFullMatch).toBe(false);
    expect(matchFull(a, b, shisanzheScheme)!.isFullMatch).toBe(true);
  });

  it('treats eng & ing as same in 十三辙', () => {
    expect(
      matchFull(['eng'], ['ing'], shisanzheScheme)!.isFullMatch
    ).toBe(true);
    expect(
      matchFull(['eng'], ['ing'], strictScheme)!.isFullMatch
    ).toBe(false);
  });

  it('does NOT cross 中东辙 ↔ 人辰辙 in 十三辙', () => {
    // eng (中东) vs en (人辰) — different in 十三辙 strict
    expect(
      matchFull(['eng'], ['en'], shisanzheScheme)!.isFullMatch
    ).toBe(false);
  });
});

describe('matchFull · loose neighbor-rhyme', () => {
  it('crosses 中东辙 ↔ 人辰辙 in loose mode', () => {
    expect(matchFull(['eng'], ['en'], looseScheme)!.isFullMatch).toBe(true);
    expect(matchFull(['ing'], ['in'], looseScheme)!.isFullMatch).toBe(true);
  });

  it('crosses 江阳辙 ↔ 言前辙 in loose mode', () => {
    expect(matchFull(['ang'], ['an'], looseScheme)!.isFullMatch).toBe(true);
    expect(matchFull(['iang'], ['ian'], looseScheme)!.isFullMatch).toBe(true);
  });
});

describe('matchTail', () => {
  it('aligns by the right edge and compares the overlap', () => {
    // target ends in [..., a, i]; candidate ends in [..., a, i] → tail rhymes
    const target = ['iang', 'uei', 'a', 'i'];
    const candidate = ['ou', 'a', 'i']; // shorter
    const m = matchTail(target, candidate, strictScheme, 2);
    expect(m.comparedLength).toBe(2);
    expect(m.isFullMatch).toBe(true);
  });

  it('clamps the window to the shorter sequence', () => {
    const target = ['a', 'i'];
    const candidate = ['x', 'y', 'a', 'i'];
    const m = matchTail(target, candidate, strictScheme, 10);
    expect(m.comparedLength).toBe(2);
    expect(m.isFullMatch).toBe(true);
  });

  it('reports zero comparison when k=0', () => {
    const m = matchTail(['a'], ['b'], strictScheme, 0);
    expect(m.comparedLength).toBe(0);
    expect(m.isFullMatch).toBe(true); // vacuously
  });
});

describe('matchHead', () => {
  it('aligns by the left edge and compares the overlap', () => {
    const target = ['iang', 'uei', 'a', 'i'];
    const candidate = ['iang', 'uei', 'ou']; // shorter, but heads agree
    const m = matchHead(target, candidate, strictScheme, 2);
    expect(m.comparedLength).toBe(2);
    expect(m.isFullMatch).toBe(true);
  });

  it('detects head mismatch', () => {
    const m = matchHead(['a', 'b'], ['x', 'b'], strictScheme, 2);
    expect(m.unmatchedPositions).toEqual([0]);
    expect(m.relaxationLevel).toBe(1);
  });
});

describe('keysFor', () => {
  it('maps a final list to scheme keys for indexing', () => {
    expect(keysFor(['iang', 'uei', 'a', 'i'], strictScheme))
      .toEqual(['iang', 'uei', 'a', 'i']);
    expect(keysFor(['iang', 'uei', 'a', 'i'], shisanzheScheme))
      .toEqual(['江阳辙', '灰堆辙', '发花辙', '一七辙']);
  });
});
