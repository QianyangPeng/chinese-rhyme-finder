import { describe, it, expect } from 'vitest';
import { parsePhrase, parseSyllables, extractFinals } from './parser.js';

describe('parseSyllables · single-char syllables', () => {
  it('parses 姜 as iang', () => {
    const [s] = parseSyllables('姜');
    expect(s.char).toBe('姜');
    expect(s.initial).toBe('j');
    expect(s.final).toBe('iang');
    expect(s.tone).toBe(1);
  });

  it('parses 维 as null-initial uei', () => {
    const [s] = parseSyllables('维');
    expect(s.char).toBe('维');
    expect(s.initial).toBe('');
    expect(s.final).toBe('uei');
    expect(s.tone).toBe(2);
  });

  it('parses 戏 as xi', () => {
    const [s] = parseSyllables('戏');
    expect(s.initial).toBe('x');
    expect(s.final).toBe('i');
    expect(s.tone).toBe(4);
  });
});

describe('parseSyllables · the canonical "姜维的戏" example', () => {
  it('produces four syllables with finals iang, uei, e, i', () => {
    const finals = extractFinals('姜维的戏');
    expect(finals).toEqual(['iang', 'uei', 'e', 'i']);
  });

  it('marks 的 as 轻声 (tone 0) when used as a particle', () => {
    const sylls = parseSyllables('姜维的戏');
    // tone for 的 may be 0 (轻声) or 5 depending on dictionary; allow either.
    expect([0, 5]).toContain(sylls[2].tone);
    expect(sylls[2].final).toBe('e');
  });
});

describe('parseSyllables · the second canonical example, 降维打击', () => {
  it('produces finals iang, uei, a, i', () => {
    expect(extractFinals('降维打击')).toEqual(['iang', 'uei', 'a', 'i']);
  });
});

describe('parseSyllables · multi-char words & 多音字 in context', () => {
  it('parses 中国 as zhong + guo', () => {
    const finals = extractFinals('中国');
    expect(finals).toEqual(['ong', 'uo']);
  });

  it('parses 北京 with high tones for 北 and 京', () => {
    const sylls = parseSyllables('北京');
    expect(sylls[0].final).toBe('ei');
    expect(sylls[1].final).toBe('ing');
  });

  it('parses 长城 — 长 should be cháng (chang2), not zhǎng', () => {
    const sylls = parseSyllables('长城');
    expect(sylls[0].initial).toBe('ch');
    expect(sylls[0].final).toBe('ang');
    expect(sylls[0].tone).toBe(2);
  });
});

describe('parsePhrase · mixed Chinese / English / punctuation', () => {
  it('separates Chinese syllables from English letters', () => {
    const tokens = parsePhrase('hip-hop 手势');
    const syllables = tokens.filter((t) => t.kind === 'syllable');
    const others = tokens.filter((t) => t.kind === 'other');
    expect(syllables.length).toBe(2);
    // 手 shou3 → final ou; 势 shì → apical "-i" (not regular i).
    expect(syllables.every((t) => t.kind === 'syllable')).toBe(true);
    if (syllables[0].kind === 'syllable' && syllables[1].kind === 'syllable') {
      expect(syllables[0].syllable.final).toBe('ou');
      expect(syllables[1].syllable.final).toBe('-i');
    }
    // English letters come through as 'other'
    expect(others.length).toBeGreaterThan(0);
    const englishChars = others.filter(
      (t) => t.kind === 'other' && t.category === 'english'
    );
    expect(englishChars.length).toBe(6); // 'h','i','p','h','o','p'
  });

  it('classifies digits, whitespace, and punctuation', () => {
    const tokens = parsePhrase('a 1, 嗨!');
    const cats = tokens
      .filter((t) => t.kind === 'other')
      .map((t) => (t.kind === 'other' ? t.category : ''));
    expect(cats).toContain('english');
    expect(cats).toContain('digit');
    expect(cats).toContain('whitespace');
    expect(cats).toContain('punct');
  });
});

describe('extractFinals · empty / non-Chinese inputs', () => {
  it('returns empty array for empty string', () => {
    expect(extractFinals('')).toEqual([]);
  });

  it('returns empty array for purely non-Chinese input', () => {
    expect(extractFinals('hello world')).toEqual([]);
  });
});

describe('parsePhrase · token order is preserved', () => {
  it('emits tokens in input order', () => {
    const tokens = parsePhrase('a姜b');
    expect(tokens.length).toBe(3);
    expect(tokens[0].kind).toBe('other');
    expect(tokens[1].kind).toBe('syllable');
    expect(tokens[2].kind).toBe('other');
    if (tokens[1].kind === 'syllable') {
      expect(tokens[1].syllable.char).toBe('姜');
    }
  });
});
