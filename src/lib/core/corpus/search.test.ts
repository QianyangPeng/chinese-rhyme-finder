import { describe, it, expect } from 'vitest';
import { buildLexicon } from './loader.js';
import { searchByFinals, searchByTail } from './search.js';
import { strictScheme, shisanzheScheme } from '../rhyme/schemes/index.js';
import { extractFinals } from '../pinyin/parser.js';

const lex = buildLexicon();

describe('buildLexicon', () => {
  it('produces a non-empty lexicon from the seed data', () => {
    expect(lex.phrases.length).toBeGreaterThan(50);
  });

  it('every entry has a non-empty finals sequence', () => {
    for (const p of lex.phrases) {
      expect(p.finals.length).toBeGreaterThan(0);
      expect(p.finals.every((f) => f.length > 0)).toBe(true);
    }
  });

  it('byLength index covers every entry exactly once', () => {
    let total = 0;
    for (const ids of lex.byLength.values()) total += ids.length;
    expect(total).toBe(lex.phrases.length);
  });
});

describe('searchByFinals · strict matches', () => {
  it('finds 降维打击 when searching for finals iang/uei/a/i', () => {
    const target = ['iang', 'uei', 'a', 'i'];
    const r = searchByFinals(target, strictScheme, lex);
    const strictHits = r.buckets.find((b) => b.level === 0);
    expect(strictHits).toBeDefined();
    const texts = strictHits!.hits.map((h) => h.phrase.text);
    expect(texts).toContain('降维打击');
  });

  it('returns same-length results only', () => {
    const target = ['iang', 'uei', 'a', 'i']; // length 4
    const r = searchByFinals(target, strictScheme, lex);
    for (const bucket of r.buckets) {
      for (const hit of bucket.hits) {
        expect(hit.phrase.length).toBe(4);
      }
    }
    expect(r.targetLength).toBe(4);
  });

  it('excludes the input phrase itself when excludeText is set', () => {
    const target = extractFinals('降维打击');
    const r = searchByFinals(target, strictScheme, lex, {
      excludeText: '降维打击'
    });
    const allTexts = r.buckets.flatMap((b) => b.hits.map((h) => h.phrase.text));
    expect(allTexts).not.toContain('降维打击');
  });
});

describe('searchByFinals · scheme widens match set', () => {
  it('十三辙 produces at least as many strict-level (0) hits as 严式', () => {
    const target = extractFinals('星辰大海');
    const strictRes = searchByFinals(target, strictScheme, lex, {
      excludeText: '星辰大海'
    });
    const zheRes = searchByFinals(target, shisanzheScheme, lex, {
      excludeText: '星辰大海'
    });
    const strictLevel0 = strictRes.buckets.find((b) => b.level === 0)?.hits.length ?? 0;
    const zheLevel0 = zheRes.buckets.find((b) => b.level === 0)?.hits.length ?? 0;
    expect(zheLevel0).toBeGreaterThanOrEqual(strictLevel0);
  });
});

describe('searchByFinals · graded relaxation', () => {
  it('returns buckets in ascending level order', () => {
    const target = extractFinals('降维打击');
    const r = searchByFinals(target, shisanzheScheme, lex);
    const levels = r.buckets.map((b) => b.level);
    const sorted = [...levels].sort((a, b) => a - b);
    expect(levels).toEqual(sorted);
  });

  it('respects maxPerBucket', () => {
    const target = extractFinals('降维打击');
    const r = searchByFinals(target, shisanzheScheme, lex, { maxPerBucket: 2 });
    for (const bucket of r.buckets) {
      expect(bucket.hits.length).toBeLessThanOrEqual(2);
    }
  });

  it('respects maxLevel', () => {
    const target = extractFinals('降维打击');
    const r = searchByFinals(target, shisanzheScheme, lex, { maxLevel: 1 });
    for (const bucket of r.buckets) {
      expect(bucket.level).toBeLessThanOrEqual(1);
    }
  });
});

describe('searchByTail', () => {
  it('returns buckets in DESCENDING tailK order', () => {
    const target = extractFinals('降维打击');
    const r = searchByTail(target, shisanzheScheme, lex, { excludeText: '降维打击' });
    const ks = r.buckets.map((b) => b.tailK);
    const sortedDesc = [...ks].sort((a, b) => b - a);
    expect(ks).toEqual(sortedDesc);
  });

  it('finds different-length candidates that share a tail', () => {
    const target = extractFinals('降维打击'); // 4 syllables
    const r = searchByTail(target, shisanzheScheme, lex, {
      minTailK: 2,
      excludeText: '降维打击'
    });
    const allLengths = new Set(
      r.buckets.flatMap((b) => b.hits.map((h) => h.phrase.length))
    );
    // Seed has 2,3,4,5-syllable phrases; tail search should bring some
    // non-4-length matches through when the tail rhymes.
    expect(allLengths.size).toBeGreaterThan(1);
  });

  it('respects minTailK', () => {
    const target = extractFinals('降维打击');
    const r = searchByTail(target, shisanzheScheme, lex, { minTailK: 3 });
    for (const b of r.buckets) {
      expect(b.tailK).toBeGreaterThanOrEqual(3);
    }
  });

  it('respects maxPerBucket', () => {
    const target = extractFinals('降维打击');
    const r = searchByTail(target, shisanzheScheme, lex, { maxPerBucket: 2 });
    for (const b of r.buckets) {
      expect(b.hits.length).toBeLessThanOrEqual(2);
    }
  });

  it('every hit reports isFullMatch on its match window', () => {
    const target = extractFinals('降维打击');
    const r = searchByTail(target, shisanzheScheme, lex, { minTailK: 2 });
    for (const b of r.buckets) {
      for (const h of b.hits) {
        expect(h.match.isFullMatch).toBe(true);
        expect(h.match.comparedLength).toBe(h.tailK);
      }
    }
  });

  it('empty target returns no buckets', () => {
    expect(searchByTail([], shisanzheScheme, lex).totalHits).toBe(0);
  });
});

describe('searchByFinals · empty / no-match cases', () => {
  it('returns no buckets when the lexicon has no phrases of that length', () => {
    // length 100 — nothing in seed has 100 syllables
    const target = new Array(100).fill('a');
    const r = searchByFinals(target, strictScheme, lex);
    expect(r.totalHits).toBe(0);
    expect(r.buckets).toHaveLength(0);
  });

  it('returns no buckets for an empty target', () => {
    const r = searchByFinals([], strictScheme, lex);
    expect(r.totalHits).toBe(0);
  });
});
