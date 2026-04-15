import { describe, it, expect } from 'vitest';
import { binByRelaxation, nonEmptyBins } from './relaxation.js';
import { strictScheme } from './schemes/strict.js';
import { shisanzheScheme } from './schemes/shisanzhe.js';

describe('binByRelaxation', () => {
  it('returns n+1 bins for a length-n target', () => {
    const result = binByRelaxation(
      ['iang', 'uei', 'a', 'i'],
      [],
      strictScheme
    );
    expect(result.bins.length).toBe(5); // 0..4
    expect(result.targetLength).toBe(4);
  });

  it('places strict full matches in level 0', () => {
    const target = ['iang', 'uei', 'a', 'i'];
    const candidates = [
      ['iang', 'uei', 'a', 'i'], // index 0 — perfect
      ['iang', 'uei', 'a', 'i'], // index 1 — perfect (duplicate)
      ['iang', 'uei', 'e', 'i'], // index 2 — one off
      ['ong',  'ei',  'u', 'a']  // index 3 — all off
    ];
    const r = binByRelaxation(target, candidates, strictScheme);
    expect(r.bins[0].candidateIndices).toEqual([0, 1]);
    expect(r.bins[1].candidateIndices).toEqual([2]);
    expect(r.bins[4].candidateIndices).toEqual([3]);
  });

  it('skips candidates with mismatched length (FULL contract)', () => {
    const target = ['a', 'i'];
    const candidates = [['a', 'i'], ['a', 'i', 'o']];
    const r = binByRelaxation(target, candidates, strictScheme);
    expect(r.bins[0].candidateIndices).toEqual([0]);
    // index 1 should not appear in any bin
    const allIndices = r.bins.flatMap((b) => [...b.candidateIndices]);
    expect(allIndices).not.toContain(1);
  });

  it('uses the scheme to decide what counts as matching', () => {
    const target = ['ang', 'eng'];
    const candidates = [
      ['iang', 'ing'] // strict: 0 match, shisanzhe: 2 match
    ];
    const strict = binByRelaxation(target, candidates, strictScheme);
    const zhe = binByRelaxation(target, candidates, shisanzheScheme);
    expect(strict.bins[2].candidateIndices).toEqual([0]); // both off in strict
    expect(zhe.bins[0].candidateIndices).toEqual([0]);    // both match in 辙
  });
});

describe('nonEmptyBins', () => {
  it('drops empty bins for compact UI rendering', () => {
    const r = binByRelaxation(
      ['a', 'i'],
      [['a', 'i'], ['a', 'i'], ['o', 'i']],
      strictScheme
    );
    const nonEmpty = nonEmptyBins(r);
    // Levels 0 and 1 are populated; level 2 is empty and should be dropped.
    expect(nonEmpty.length).toBe(2);
    expect(nonEmpty[0].level).toBe(0);
    expect(nonEmpty[1].level).toBe(1);
  });
});
