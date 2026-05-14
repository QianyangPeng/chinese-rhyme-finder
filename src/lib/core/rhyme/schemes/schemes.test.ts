import { describe, it, expect } from 'vitest';
import { strictScheme } from './strict.js';
import { shisanzheScheme, SHISANZHE } from './shisanzhe.js';
import { looseScheme } from './loose.js';
import { xinyunScheme, XINYUN } from './xinyun.js';
import { VALID_FINALS } from '../../pinyin/decomposer.js';

describe('strictScheme', () => {
  it('uses the rhyme body as the key', () => {
    expect(strictScheme.keyOf('iang')).toBe('ang');
    expect(strictScheme.keyOf('uei')).toBe('ei');
  });

  it('separates finals that 十三辙 would merge', () => {
    expect(strictScheme.keyOf('an')).not.toBe(strictScheme.keyOf('ian'));
    expect(strictScheme.keyOf('eng')).not.toBe(strictScheme.keyOf('ing'));
  });

  it('returns empty string for empty final', () => {
    expect(strictScheme.keyOf('')).toBe('');
  });
});

describe('shisanzheScheme · 13 traditional groups', () => {
  it('maps -ang family to 江阳辙', () => {
    expect(shisanzheScheme.keyOf('ang')).toBe(SHISANZHE.JIANGYANG);
    expect(shisanzheScheme.keyOf('iang')).toBe(SHISANZHE.JIANGYANG);
    expect(shisanzheScheme.keyOf('uang')).toBe(SHISANZHE.JIANGYANG);
  });

  it('maps -eng/-ing/-ong family to 中东辙', () => {
    expect(shisanzheScheme.keyOf('eng')).toBe(SHISANZHE.ZHONGDONG);
    expect(shisanzheScheme.keyOf('ing')).toBe(SHISANZHE.ZHONGDONG);
    expect(shisanzheScheme.keyOf('ong')).toBe(SHISANZHE.ZHONGDONG);
    expect(shisanzheScheme.keyOf('iong')).toBe(SHISANZHE.ZHONGDONG);
  });

  it('maps i/ü/er to 一七辙', () => {
    expect(shisanzheScheme.keyOf('i')).toBe(SHISANZHE.YIQI);
    expect(shisanzheScheme.keyOf('ü')).toBe(SHISANZHE.YIQI);
    expect(shisanzheScheme.keyOf('er')).toBe(SHISANZHE.YIQI);
  });

  it('maps ei/uei to 灰堆辙', () => {
    expect(shisanzheScheme.keyOf('ei')).toBe(SHISANZHE.HUIDUI);
    expect(shisanzheScheme.keyOf('uei')).toBe(SHISANZHE.HUIDUI);
  });

  it('maps ai/uai to 怀来辙', () => {
    expect(shisanzheScheme.keyOf('ai')).toBe(SHISANZHE.HUAILAI);
    expect(shisanzheScheme.keyOf('uai')).toBe(SHISANZHE.HUAILAI);
  });

  it('maps ao/iao to 遥条辙 and ou/iou to 由求辙', () => {
    expect(shisanzheScheme.keyOf('ao')).toBe(SHISANZHE.YAOTIAO);
    expect(shisanzheScheme.keyOf('iao')).toBe(SHISANZHE.YAOTIAO);
    expect(shisanzheScheme.keyOf('ou')).toBe(SHISANZHE.YOUQIU);
    expect(shisanzheScheme.keyOf('iou')).toBe(SHISANZHE.YOUQIU);
  });

  it('maps -an family to 言前辙 and -en family to 人辰辙', () => {
    for (const f of ['an', 'ian', 'uan', 'üan']) {
      expect(shisanzheScheme.keyOf(f)).toBe(SHISANZHE.YANQIAN);
    }
    for (const f of ['en', 'in', 'uen', 'ün']) {
      expect(shisanzheScheme.keyOf(f)).toBe(SHISANZHE.RENCHEN);
    }
  });

  it('groups e/o/uo as 梭波辙', () => {
    expect(shisanzheScheme.keyOf('e')).toBe(SHISANZHE.SUOBO);
    expect(shisanzheScheme.keyOf('o')).toBe(SHISANZHE.SUOBO);
    expect(shisanzheScheme.keyOf('uo')).toBe(SHISANZHE.SUOBO);
  });

  it('groups a/ia/ua as 发花辙, ie/üe as 乜斜辙, u as 姑苏辙', () => {
    expect(shisanzheScheme.keyOf('a')).toBe(SHISANZHE.FAHUA);
    expect(shisanzheScheme.keyOf('ia')).toBe(SHISANZHE.FAHUA);
    expect(shisanzheScheme.keyOf('ua')).toBe(SHISANZHE.FAHUA);
    expect(shisanzheScheme.keyOf('ie')).toBe(SHISANZHE.NIEXIE);
    expect(shisanzheScheme.keyOf('üe')).toBe(SHISANZHE.NIEXIE);
    expect(shisanzheScheme.keyOf('u')).toBe(SHISANZHE.GUSU);
  });

  it('covers every canonical final in the decomposer', () => {
    // Every final the decomposer recognizes must have a 辙. Otherwise the
    // matcher will silently fail to rhyme valid syllables.
    for (const final of VALID_FINALS) {
      const zhe = shisanzheScheme.keyOf(final);
      expect(zhe, `final '${final}' has no 辙 mapping`).not.toBe('');
    }
  });
});

describe('xinyunScheme · 中华新韵 14 部', () => {
  it('separates 齐 (regular i, ü) from 支 (apical -i, er)', () => {
    // This is the whole point of the scheme — 只 (shǐ, apical) and
    // 李 (lǐ, regular) do NOT rhyme in modern Mandarin.
    expect(xinyunScheme.keyOf('i')).toBe(XINYUN.QI);
    expect(xinyunScheme.keyOf('ü')).toBe(XINYUN.QI);
    expect(xinyunScheme.keyOf('-i')).toBe(XINYUN.ZHI);
    expect(xinyunScheme.keyOf('er')).toBe(XINYUN.ZHI);
    expect(xinyunScheme.keyOf('i')).not.toBe(xinyunScheme.keyOf('-i'));
  });

  it('groups -ng nasal families correctly', () => {
    for (const f of ['ang', 'iang', 'uang']) {
      expect(xinyunScheme.keyOf(f)).toBe(XINYUN.TANG);
    }
    for (const f of ['eng', 'ing', 'ong', 'iong', 'ueng']) {
      expect(xinyunScheme.keyOf(f)).toBe(XINYUN.GENG);
    }
  });

  it('groups -n nasal families correctly', () => {
    for (const f of ['an', 'ian', 'uan', 'üan']) {
      expect(xinyunScheme.keyOf(f)).toBe(XINYUN.HAN);
    }
    for (const f of ['en', 'in', 'uen', 'ün']) {
      expect(xinyunScheme.keyOf(f)).toBe(XINYUN.WEN);
    }
  });

  it('groups open-vowel families correctly', () => {
    expect(xinyunScheme.keyOf('a')).toBe(XINYUN.MA);
    expect(xinyunScheme.keyOf('ia')).toBe(XINYUN.MA);
    expect(xinyunScheme.keyOf('ua')).toBe(XINYUN.MA);
    expect(xinyunScheme.keyOf('o')).toBe(XINYUN.BO);
    expect(xinyunScheme.keyOf('e')).toBe(XINYUN.BO);
    expect(xinyunScheme.keyOf('uo')).toBe(XINYUN.BO);
    expect(xinyunScheme.keyOf('ie')).toBe(XINYUN.JIE);
    expect(xinyunScheme.keyOf('üe')).toBe(XINYUN.JIE);
  });

  it('groups diphthong families correctly', () => {
    expect(xinyunScheme.keyOf('ai')).toBe(XINYUN.KAI);
    expect(xinyunScheme.keyOf('uai')).toBe(XINYUN.KAI);
    expect(xinyunScheme.keyOf('ei')).toBe(XINYUN.WEI);
    expect(xinyunScheme.keyOf('uei')).toBe(XINYUN.WEI);
    expect(xinyunScheme.keyOf('ao')).toBe(XINYUN.HAO);
    expect(xinyunScheme.keyOf('iao')).toBe(XINYUN.HAO);
    expect(xinyunScheme.keyOf('ou')).toBe(XINYUN.YOU);
    expect(xinyunScheme.keyOf('iou')).toBe(XINYUN.YOU);
  });

  it('puts 姑苏-style u by itself', () => {
    expect(xinyunScheme.keyOf('u')).toBe(XINYUN.GU);
    // 齐 and 支 must not collide with 姑 (all are "single high vowel"
    // but still perceptually distinct).
    expect(xinyunScheme.keyOf('u')).not.toBe(xinyunScheme.keyOf('i'));
    expect(xinyunScheme.keyOf('u')).not.toBe(xinyunScheme.keyOf('-i'));
  });

  it('covers every canonical final', () => {
    for (const f of VALID_FINALS) {
      const k = xinyunScheme.keyOf(f);
      expect(k, `final '${f}' has no 新韵 mapping`).not.toBe('');
    }
  });
});

describe('looseScheme · neighbor-rhyme bridges', () => {
  it('merges 中东辙 with 人辰辙', () => {
    // eng (中东) and en (人辰) get the same key
    expect(looseScheme.keyOf('eng')).toBe(looseScheme.keyOf('en'));
    expect(looseScheme.keyOf('ing')).toBe(looseScheme.keyOf('in'));
    expect(looseScheme.keyOf('ong')).toBe(looseScheme.keyOf('uen'));
  });

  it('merges 江阳辙 with 言前辙', () => {
    expect(looseScheme.keyOf('ang')).toBe(looseScheme.keyOf('an'));
    expect(looseScheme.keyOf('iang')).toBe(looseScheme.keyOf('ian'));
    expect(looseScheme.keyOf('uang')).toBe(looseScheme.keyOf('uan'));
  });

  it('keeps unbridged 辙 separate', () => {
    expect(looseScheme.keyOf('i')).not.toBe(looseScheme.keyOf('ei'));
    expect(looseScheme.keyOf('a')).not.toBe(looseScheme.keyOf('o'));
    expect(looseScheme.keyOf('u')).not.toBe(looseScheme.keyOf('ü'));
  });
});
