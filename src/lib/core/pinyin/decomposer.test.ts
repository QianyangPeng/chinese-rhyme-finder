import { describe, it, expect } from 'vitest';
import { decompose, VALID_FINALS } from './decomposer.js';

describe('decompose · simple syllables', () => {
  it('splits jiang into j + iang', () => {
    expect(decompose('jiang')).toEqual({
      initial: 'j',
      final: 'iang',
      medial: 'i',
      nucleus: 'a',
      coda: 'ng'
    });
  });

  it('splits hao into h + ao', () => {
    expect(decompose('hao')).toEqual({
      initial: 'h',
      final: 'ao',
      medial: '',
      nucleus: 'a',
      coda: 'o'
    });
  });

  it('splits xi into x + i', () => {
    expect(decompose('xi')).toEqual({
      initial: 'x',
      final: 'i',
      medial: '',
      nucleus: 'i',
      coda: ''
    });
  });
});

describe('decompose · two-character initials (zh/ch/sh)', () => {
  it('splits zhang into zh + ang', () => {
    expect(decompose('zhang')).toEqual({
      initial: 'zh',
      final: 'ang',
      medial: '',
      nucleus: 'a',
      coda: 'ng'
    });
  });

  it('splits chuang into ch + uang', () => {
    expect(decompose('chuang')).toEqual({
      initial: 'ch',
      final: 'uang',
      medial: 'u',
      nucleus: 'a',
      coda: 'ng'
    });
  });

  it('splits shi into sh + "-i" (apical — distinct final from regular i)', () => {
    expect(decompose('shi')).toEqual({
      initial: 'sh',
      final: '-i',
      medial: '',
      nucleus: 'i',
      coda: ''
    });
  });

  it('emits "-i" for every apical-i initial (zh/ch/sh/r/z/c/s)', () => {
    for (const init of ['zh', 'ch', 'sh', 'r', 'z', 'c', 's']) {
      const r = decompose(init + 'i');
      expect(r, `${init}i should decompose`).not.toBeNull();
      expect(r!.final, `${init}i final should be "-i"`).toBe('-i');
      expect(r!.initial).toBe(init);
    }
  });

  it('keeps regular "i" for j/q/x and other non-apical initials', () => {
    for (const init of ['j', 'q', 'x', 'l', 'm', 'b', 'p', 'n', 'd', 't']) {
      const r = decompose(init + 'i');
      expect(r, `${init}i should decompose`).not.toBeNull();
      expect(r!.final, `${init}i final should stay "i"`).toBe('i');
    }
  });
});

describe('decompose · null-initial syllables', () => {
  it('handles bare i (was "yi" on the surface)', () => {
    expect(decompose('i')).toEqual({
      initial: '',
      final: 'i',
      medial: '',
      nucleus: 'i',
      coda: ''
    });
  });

  it('handles bare uei (was "wei")', () => {
    expect(decompose('uei')).toEqual({
      initial: '',
      final: 'uei',
      medial: 'u',
      nucleus: 'e',
      coda: 'i'
    });
  });

  it('handles bare ü (was "yu")', () => {
    expect(decompose('ü')).toEqual({
      initial: '',
      final: 'ü',
      medial: '',
      nucleus: 'ü',
      coda: ''
    });
  });

  it('handles bare iong (was "yong")', () => {
    expect(decompose('iong')).toEqual({
      initial: '',
      final: 'iong',
      medial: 'i',
      nucleus: 'o',
      coda: 'ng'
    });
  });
});

describe('decompose · jqx + ü family', () => {
  it('splits jü into j + ü', () => {
    expect(decompose('jü')).toEqual({
      initial: 'j',
      final: 'ü',
      medial: '',
      nucleus: 'ü',
      coda: ''
    });
  });

  it('splits xüan into x + üan', () => {
    expect(decompose('xüan')).toEqual({
      initial: 'x',
      final: 'üan',
      medial: 'ü',
      nucleus: 'a',
      coda: 'n'
    });
  });
});

describe('decompose · special finals', () => {
  it('handles er as a single nucleus', () => {
    expect(decompose('er')).toEqual({
      initial: '',
      final: 'er',
      medial: '',
      nucleus: 'er',
      coda: ''
    });
  });

  it('treats in as nucleus i + coda n (no medial)', () => {
    const r = decompose('jin');
    expect(r?.medial).toBe('');
    expect(r?.nucleus).toBe('i');
    expect(r?.coda).toBe('n');
  });

  it('treats ing as nucleus i + coda ng (no medial)', () => {
    const r = decompose('ming');
    expect(r?.medial).toBe('');
    expect(r?.nucleus).toBe('i');
    expect(r?.coda).toBe('ng');
  });

  it('treats ün as nucleus ü + coda n (no medial)', () => {
    const r = decompose('jün');
    expect(r?.medial).toBe('');
    expect(r?.nucleus).toBe('ü');
    expect(r?.coda).toBe('n');
  });

  it('treats ian as medial i + nucleus a + coda n', () => {
    const r = decompose('jian');
    expect(r?.medial).toBe('i');
    expect(r?.nucleus).toBe('a');
    expect(r?.coda).toBe('n');
  });
});

describe('decompose · invalid input', () => {
  it('returns null for empty string', () => {
    expect(decompose('')).toBeNull();
  });

  it('returns null for unknown final', () => {
    expect(decompose('jrx')).toBeNull();    // bogus
    expect(decompose('zzz')).toBeNull();    // bogus
  });

  it('returns null for known initial with no final', () => {
    expect(decompose('zh')).toBeNull();
  });
});

describe('decompose · canonical-finals coverage', () => {
  it('exposes 37 standard finals (36 + apical "-i")', () => {
    // Base 36: 6 monophthongs + 4 diphthongs + 5 simple-nasal
    //        + 9 i-finals + 8 u-finals + 3 ü-finals + er.
    // Plus the distinct apical-i final = 37.
    expect(VALID_FINALS.size).toBe(37);
  });

  it('every non-apical final is decomposable when used as a null-initial syllable', () => {
    for (const final of VALID_FINALS) {
      // "-i" is apical-only (zh/ch/sh/r/z/c/s), never null-initial.
      if (final === '-i') continue;
      const r = decompose(final);
      expect(r, `final '${final}' must decompose`).not.toBeNull();
      expect(r!.final).toBe(final);
      expect(r!.initial).toBe('');
    }
  });
});
