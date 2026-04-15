import { describe, it, expect } from 'vitest';
import { normalizePinyin } from './normalizer.js';

describe('normalizePinyin · tone stripping', () => {
  it('strips tone 1-4 marks from standard vowels', () => {
    expect(normalizePinyin('jiāng').tone).toBe(1);
    expect(normalizePinyin('wéi').tone).toBe(2);
    expect(normalizePinyin('hǎo').tone).toBe(3);
    expect(normalizePinyin('xì').tone).toBe(4);
  });

  it('returns tone 0 for unmarked syllables', () => {
    expect(normalizePinyin('de').tone).toBe(0);
    expect(normalizePinyin('ma').tone).toBe(0);
  });

  it('handles tone marks on ü', () => {
    expect(normalizePinyin('lǖ').tone).toBe(1);
    expect(normalizePinyin('lǘ').tone).toBe(2);
    expect(normalizePinyin('lǚ').tone).toBe(3);
    expect(normalizePinyin('lǜ').tone).toBe(4);
  });

  it('preserves the full canonical syllable (initial + final) after tone stripping', () => {
    // canonical includes the initial; the decomposer is responsible for
    // splitting initial vs final later.
    expect(normalizePinyin('jiāng').canonical).toBe('jiang');
    expect(normalizePinyin('hǎo').canonical).toBe('hao');
  });
});

describe('normalizePinyin · y- conventions', () => {
  it('collapses yi → i, yin → in, ying → ing', () => {
    expect(normalizePinyin('yi').canonical).toBe('i');
    expect(normalizePinyin('yīn').canonical).toBe('in');
    expect(normalizePinyin('yíng').canonical).toBe('ing');
  });

  it('expands ya/ye/yao/you/yan/yang/yong to i-medial form', () => {
    expect(normalizePinyin('yā').canonical).toBe('ia');
    expect(normalizePinyin('yé').canonical).toBe('ie');
    expect(normalizePinyin('yǎo').canonical).toBe('iao');
    expect(normalizePinyin('yǒu').canonical).toBe('iou');
    expect(normalizePinyin('yán').canonical).toBe('ian');
    expect(normalizePinyin('yáng').canonical).toBe('iang');
    expect(normalizePinyin('yóng').canonical).toBe('iong');
  });

  it('converts yu/yue/yuan/yun to ü-medial form', () => {
    expect(normalizePinyin('yú').canonical).toBe('ü');
    expect(normalizePinyin('yuè').canonical).toBe('üe');
    expect(normalizePinyin('yuán').canonical).toBe('üan');
    expect(normalizePinyin('yún').canonical).toBe('ün');
  });
});

describe('normalizePinyin · w- conventions', () => {
  it('collapses wu → u', () => {
    expect(normalizePinyin('wū').canonical).toBe('u');
  });

  it('expands wa/wo/wai/wei/wan/wen/wang/weng to u-medial form', () => {
    expect(normalizePinyin('wā').canonical).toBe('ua');
    expect(normalizePinyin('wǒ').canonical).toBe('uo');
    expect(normalizePinyin('wài').canonical).toBe('uai');
    expect(normalizePinyin('wéi').canonical).toBe('uei');
    expect(normalizePinyin('wàn').canonical).toBe('uan');
    expect(normalizePinyin('wén').canonical).toBe('uen');
    expect(normalizePinyin('wáng').canonical).toBe('uang');
    expect(normalizePinyin('wēng').canonical).toBe('ueng');
  });
});

describe('normalizePinyin · jqx + u → ü', () => {
  it('treats u after j/q/x as ü', () => {
    expect(normalizePinyin('jū').canonical).toBe('jü');
    expect(normalizePinyin('qū').canonical).toBe('qü');
    expect(normalizePinyin('xū').canonical).toBe('xü');
    expect(normalizePinyin('jué').canonical).toBe('jüe');
    expect(normalizePinyin('xuán').canonical).toBe('xüan');
    expect(normalizePinyin('qún').canonical).toBe('qün');
  });

  it('does NOT touch real u after other consonants', () => {
    expect(normalizePinyin('lū').canonical).toBe('lu');
    expect(normalizePinyin('nù').canonical).toBe('nu');
    expect(normalizePinyin('zhú').canonical).toBe('zhu');
  });
});

describe('normalizePinyin · truncated finals after consonants', () => {
  it('expands -iu to -iou', () => {
    expect(normalizePinyin('liú').canonical).toBe('liou');
    expect(normalizePinyin('jiǔ').canonical).toBe('jiou');
    expect(normalizePinyin('xiū').canonical).toBe('xiou');
  });

  it('expands -ui to -uei', () => {
    expect(normalizePinyin('guī').canonical).toBe('guei');
    expect(normalizePinyin('shuǐ').canonical).toBe('shuei');
    expect(normalizePinyin('tuī').canonical).toBe('tuei');
  });

  it('expands -un to -uen (after consonant, NOT after j/q/x)', () => {
    expect(normalizePinyin('lún').canonical).toBe('luen');
    expect(normalizePinyin('chūn').canonical).toBe('chuen');
    expect(normalizePinyin('zūn').canonical).toBe('zuen');
  });

  it('does NOT expand standalone iou/uei/uen forms (they are not truncated)', () => {
    expect(normalizePinyin('yǒu').canonical).toBe('iou');
    expect(normalizePinyin('wéi').canonical).toBe('uei');
    expect(normalizePinyin('wén').canonical).toBe('uen');
  });
});

describe('normalizePinyin · 儿化', () => {
  it('detects -r erhua suffix and strips it', () => {
    const r = normalizePinyin('huār');
    expect(r.canonical).toBe('hua');
    expect(r.erhua).toBe(true);
  });

  it('does not treat the standalone "er" syllable as 儿化', () => {
    const r = normalizePinyin('ér');
    expect(r.canonical).toBe('er');
    expect(r.erhua).toBe(false);
    expect(r.tone).toBe(2);
  });

  it('handles erhua on tone-marked input', () => {
    const r = normalizePinyin('huār');
    expect(r.canonical).toBe('hua');
    expect(r.erhua).toBe(true);
  });
});

describe('normalizePinyin · ASCII v shortcut', () => {
  it('accepts v as substitute for ü', () => {
    expect(normalizePinyin('lv').canonical).toBe('lü');
    expect(normalizePinyin('nv').canonical).toBe('nü');
  });
});

describe('normalizePinyin · edge cases', () => {
  it('handles empty string gracefully', () => {
    const r = normalizePinyin('');
    expect(r.canonical).toBe('');
    expect(r.tone).toBe(0);
    expect(r.erhua).toBe(false);
  });

  it('lowercases input', () => {
    expect(normalizePinyin('JIĀNG').canonical).toBe('jiang');
    expect(normalizePinyin('Wéi').canonical).toBe('uei');
  });

  it('trims whitespace', () => {
    expect(normalizePinyin('  jiāng  ').canonical).toBe('jiang');
  });

  it('preserves surface form pre-normalization', () => {
    expect(normalizePinyin('Wéi').surface).toBe('wéi');
  });
});
