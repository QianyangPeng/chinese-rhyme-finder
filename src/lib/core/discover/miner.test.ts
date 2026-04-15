import { describe, it, expect } from 'vitest';
import { mineClusters } from './miner.js';
import { buildLexicon } from '../corpus/loader.js';
import { shisanzheScheme, strictScheme } from '../rhyme/schemes/index.js';
import type { SeedPhrase } from '../corpus/seed-data.js';

describe('mineClusters · synthetic lexicon', () => {
  it('finds a cluster of phrases sharing a 2-tail pattern', () => {
    // All five end on -ang -i (江阳辙 / 一七辙 in 十三辙).
    const seeds: SeedPhrase[] = [
      { text: '相对华丽', tags: ['idiom'] },     // iang/uei/ua/i → ...发花/一七
      { text: '降维打击', tags: ['scifi'] },     // iang/uei/a/i → ...发花/一七
      { text: '想为打击', tags: ['lyric'] },     // iang/uei/a/i → ...发花/一七
      { text: '锦上添花', tags: ['idiom'] },     // …a/ua → 发花/发花 — different
      { text: '春暖花开', tags: ['idiom'] }      // …ua/ai → 发花/怀来 — different
    ];
    const lex = buildLexicon(seeds);
    const cat = mineClusters(lex, shisanzheScheme, {
      minMembers: 3,
      minPatternLength: 2
    });

    // Expect at least one cluster containing all three -发花-一七 enders.
    const target = cat.clusters.find(
      (c) => c.pattern.length >= 2 && c.members.length >= 3
    );
    expect(target).toBeDefined();
    const memberTexts = target!.members.map((m) => lex.phrases[m.phraseId].text);
    expect(memberTexts).toEqual(
      expect.arrayContaining(['相对华丽', '降维打击', '想为打击'])
    );
  });

  it('respects minMembers', () => {
    const seeds: SeedPhrase[] = [
      { text: '降维打击', tags: ['scifi'] },
      { text: '想为打击', tags: ['lyric'] }
    ];
    const lex = buildLexicon(seeds);
    const cat = mineClusters(lex, shisanzheScheme, { minMembers: 3 });
    expect(cat.clusters).toHaveLength(0);
  });

  it('produces no clusters from a single phrase', () => {
    const lex = buildLexicon([{ text: '降维打击', tags: ['scifi'] }]);
    const cat = mineClusters(lex, shisanzheScheme);
    expect(cat.clusters).toHaveLength(0);
  });

  it('can scan all positions when tailOnly is false', () => {
    // 春暖花开 (春/暖/花/开) — at start it's chun/nuan/hua/kai
    // 床前明月 (chuang/qian/ming/yue) — different start
    // For a head-position cluster to appear we need synthetic data.
    const seeds: SeedPhrase[] = [
      { text: '春暖花开', tags: ['idiom'] },
      { text: '春风又绿', tags: ['classical'] },
      { text: '春光明媚', tags: ['idiom'] }
    ];
    const lex = buildLexicon(seeds);
    const cat = mineClusters(lex, shisanzheScheme, {
      tailOnly: false,
      minMembers: 3,
      minPatternLength: 1
    });
    // All three start with 春 (chun → 人辰辙) — a head cluster of size 3 should appear.
    const headCluster = cat.clusters.find(
      (c) => c.pattern[0] === '人辰辙' && c.members.length === 3
    );
    expect(headCluster).toBeDefined();
  });
});

describe('mineClusters · seed lexicon (smoke)', () => {
  it('produces some clusters from the default seed', () => {
    const lex = buildLexicon();
    const cat = mineClusters(lex, shisanzheScheme);
    expect(cat.clusters.length).toBeGreaterThan(0);
    // Top cluster should have >= 2 syllable depth and >= 3 members.
    const top = cat.clusters[0];
    expect(top.patternLength).toBeGreaterThanOrEqual(2);
    expect(top.members.length).toBeGreaterThanOrEqual(3);
  });

  it('orders clusters by cleverness desc', () => {
    const lex = buildLexicon();
    const cat = mineClusters(lex, shisanzheScheme);
    for (let i = 1; i < cat.clusters.length; i++) {
      expect(cat.clusters[i - 1].cleverness).toBeGreaterThanOrEqual(
        cat.clusters[i].cleverness
      );
    }
  });

  it('strict scheme produces fewer or smaller clusters than 十三辙', () => {
    const lex = buildLexicon();
    const strictCat = mineClusters(lex, strictScheme);
    const zheCat = mineClusters(lex, shisanzheScheme);
    // 十三辙 is a coarser equivalence relation than strict, so it must
    // produce at least as many cluster opportunities.
    expect(zheCat.clusters.length).toBeGreaterThanOrEqual(
      strictCat.clusters.length
    );
  });
});
