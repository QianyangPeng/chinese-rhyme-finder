import { describe, it, expect } from 'vitest';
import {
  computeLetters,
  computeAnchors,
  evaluateLine,
  FREE_LETTER
} from './scheme.js';
import type { LineAnalysis } from '../analyze/types.js';

// Helper: fabricate a LineAnalysis with just the fields we need.
function line(keys: string[], text = ''): LineAnalysis {
  return {
    text,
    index: 0,
    syllables: [] as any,
    keys,
    internalGroups: new Map()
  };
}

describe('computeLetters', () => {
  it('free produces all dashes', () => {
    expect(computeLetters('free', 4)).toEqual(['-', '-', '-', '-']);
  });

  it('monorhyme produces all A', () => {
    expect(computeLetters('monorhyme', 3)).toEqual(['A', 'A', 'A']);
  });

  it('aabb groups lines in pairs', () => {
    expect(computeLetters('aabb', 6)).toEqual(['A', 'A', 'B', 'B', 'C', 'C']);
  });

  it('abab groups lines in quatrains', () => {
    expect(computeLetters('abab', 8)).toEqual(['A', 'B', 'A', 'B', 'C', 'D', 'C', 'D']);
  });

  it('custom pattern cycles short patterns', () => {
    expect(computeLetters('custom', 6, 'AB')).toEqual(['A', 'B', 'A', 'B', 'A', 'B']);
  });

  it('custom pattern truncates long patterns', () => {
    expect(computeLetters('custom', 3, 'AABBA')).toEqual(['A', 'A', 'B']);
  });

  it('custom lowercase input is normalized', () => {
    expect(computeLetters('custom', 4, 'aabb')).toEqual(['A', 'A', 'B', 'B']);
  });

  it('custom empty pattern falls back to free', () => {
    expect(computeLetters('custom', 3, '')).toEqual(['-', '-', '-']);
  });

  it('lineCount zero returns empty array', () => {
    expect(computeLetters('aabb', 0)).toEqual([]);
  });

  it('lines beyond 26 keep generating letters (AA, AB, ...)', () => {
    const letters = computeLetters('monorhyme', 3);
    expect(letters.every((l) => l === 'A')).toBe(true);
    // Push monorhyme hard: still all A
    const long = computeLetters('aabb', 54);  // 27 pairs, pair 26 → AA
    expect(long[52]).toBe('AA');
    expect(long[53]).toBe('AA');
  });
});

describe('computeAnchors', () => {
  it('assigns the first non-empty line of each letter as anchor', () => {
    const letters = ['A', 'B', 'A', 'B'];
    const lines = [
      line(['ao', 'ing']),   // A anchor
      line(['an', 'i']),     // B anchor
      line(['ou', 'ing']),   // A member
      line(['en', 'i'])      // B member
    ];
    const anchors = computeAnchors(letters, lines, 2);
    expect(anchors.get('A')?.lineIndex).toBe(0);
    expect(anchors.get('A')?.keys).toEqual(['ao', 'ing']);
    expect(anchors.get('B')?.lineIndex).toBe(1);
    expect(anchors.get('B')?.keys).toEqual(['an', 'i']);
  });

  it('skips empty lines when finding anchor', () => {
    const letters = ['A', 'A', 'A'];
    const lines = [line([]), line([]), line(['iang', 'ao'])];
    const anchors = computeAnchors(letters, lines, 2);
    expect(anchors.get('A')?.lineIndex).toBe(2);
  });

  it('truncates anchor keys to depth', () => {
    const letters = ['A'];
    const lines = [line(['a', 'b', 'c', 'd'])];
    const anchors = computeAnchors(letters, lines, 2);
    expect(anchors.get('A')?.keys).toEqual(['c', 'd']);
  });

  it('handles depth larger than line length', () => {
    const letters = ['A'];
    const lines = [line(['a', 'b'])];
    const anchors = computeAnchors(letters, lines, 4);
    expect(anchors.get('A')?.keys).toEqual(['a', 'b']);
  });

  it('skips free letters entirely', () => {
    const letters = ['-', 'A'];
    const lines = [line(['a']), line(['b'])];
    const anchors = computeAnchors(letters, lines, 1);
    expect(anchors.has('-')).toBe(false);
    expect(anchors.get('A')?.lineIndex).toBe(1);
  });
});

describe('evaluateLine', () => {
  const letters = ['A', 'A', 'A'];

  it('returns "free" for dash letter', () => {
    const lines = [line(['ao'])];
    const anchors = new Map();
    const m = evaluateLine(0, ['-'], lines, anchors, 2);
    expect(m.state).toBe('free');
  });

  it('returns "anchor" for the anchor row', () => {
    const lines = [line(['iang', 'ao']), line(['ing', 'ao'])];
    const anchors = computeAnchors(letters, lines, 2);
    const m = evaluateLine(0, letters, lines, anchors, 2);
    expect(m.state).toBe('anchor');
  });

  it('returns "hit" when all target positions match', () => {
    const lines = [
      line(['iang', 'ao']),
      line(['uan', 'iang', 'ao'])  // tail ['iang', 'ao'] matches anchor
    ];
    const anchors = computeAnchors(letters, lines, 2);
    const m = evaluateLine(1, letters, lines, anchors, 2);
    expect(m.state).toBe('hit');
    expect(m.matchedCount).toBe(2);
    expect(m.comparedCount).toBe(2);
    expect(m.perPosition).toEqual([true, true]);
  });

  it('returns "partial" when only tail matches', () => {
    const lines = [
      line(['iang', 'ao']),        // anchor
      line(['ou', 'ao'])           // only last matches
    ];
    const anchors = computeAnchors(letters, lines, 2);
    const m = evaluateLine(1, letters, lines, anchors, 2);
    expect(m.state).toBe('partial');
    expect(m.matchedCount).toBe(1);
    expect(m.perPosition).toEqual([false, true]);
  });

  it('returns "miss" when nothing matches', () => {
    const lines = [
      line(['iang', 'ao']),
      line(['ou', 'en'])
    ];
    const anchors = computeAnchors(letters, lines, 2);
    const m = evaluateLine(1, letters, lines, anchors, 2);
    expect(m.state).toBe('miss');
    expect(m.matchedCount).toBe(0);
  });

  it('returns "empty" for lines without syllables', () => {
    const lines = [line(['iang', 'ao']), line([])];
    const anchors = computeAnchors(letters, lines, 2);
    const m = evaluateLine(1, letters, lines, anchors, 2);
    expect(m.state).toBe('empty');
  });
});
