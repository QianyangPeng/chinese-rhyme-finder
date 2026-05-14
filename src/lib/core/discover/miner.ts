/**
 * Mine rhyme clusters from a lexicon: scan every phrase's rhyme-key
 * sequence (under a given scheme), enumerate all K-grams, bucket by
 * pattern, and emit groups with at least N members.
 *
 * Algorithm cost is O(P * Lmax^2) where P is the lexicon size and Lmax
 * is the longest phrase. For 200-50k phrases with Lmax ~ 6 this is
 * trivially fast; we still pre-compute at app start and cache.
 */

import type { RhymeScheme } from '../rhyme/types.js';
import type { Lexicon } from '../corpus/types.js';
import type { Tone } from '../pinyin/types.js';
import { composeKey, type ToneMode } from '../rhyme/tone.js';
import type { ClusterCatalog, ClusterMember, RhymeCluster } from './types.js';

export interface MineOptions {
  /** Minimum number of distinct phrases that must share a pattern. Default 3. */
  readonly minMembers?: number;
  /** Minimum K-gram length (i.e., minimum 押 depth). Default 2. */
  readonly minPatternLength?: number;
  /** Maximum K-gram length to consider. Default 6 (covers most rap lines). */
  readonly maxPatternLength?: number;
  /** Cap on the number of clusters returned. Default 200. */
  readonly maxClusters?: number;
  /**
   * If true, only consider patterns that align with the END of each
   * phrase (tail-only). If false, scan every starting position. Default
   * true — tail rhymes dominate practical use.
   */
  readonly tailOnly?: boolean;
  /** Tone strictness: 'none' = 韵母 only (default); 'pingze' = 韵母+平仄;
   *  'exact' = 韵母+具体声调. */
  readonly toneMode?: ToneMode;
}

const DEFAULT_OPTS = {
  minMembers: 3,
  minPatternLength: 2,
  // Raised from 6 to 10 so 5/6/7/8-character idioms and xiehouyu
  // answers can form deep multi-押 clusters when enough of them share
  // a tail. Cache is per-(lexicon, scheme), so the one-time cost of
  // scanning longer K-grams is amortized across filter clicks.
  maxPatternLength: 10,
  maxClusters: 200,
  tailOnly: true
} as const;

/**
 * Two-level cache: Lexicon → scheme-key → pre-built bucket map. Uses
 * WeakMap against the Lexicon reference so different lexicons don't
 * pollute each other and the cache releases when a lexicon goes out
 * of scope (e.g., when the extended corpus replaces the seed).
 */
const BUCKET_CACHE = new WeakMap<
  Lexicon,
  Map<string, Map<string, Map<number, ClusterMember>>>
>();

/**
 * The expensive part: scan every phrase × K × start-position once,
 * produce the bucket map. Result is independent of minMembers /
 * minPatternLength / maxClusters so those can filter cheaply after.
 */
function buildBuckets(
  lexicon: Lexicon,
  scheme: RhymeScheme,
  opts: { tailOnly: boolean; maxPatternLength: number; toneMode: ToneMode }
): Map<string, Map<number, ClusterMember>> {
  const buckets = new Map<string, Map<number, ClusterMember>>();
  const MIN_K = 2; // buckets start at depth 2; below that every phrase is a group

  for (let phraseId = 0; phraseId < lexicon.phrases.length; phraseId++) {
    const p = lexicon.phrases[phraseId];
    // Compose keys with tone info if the user requested tone-aware mining.
    const keys = p.finals.map((f, i) =>
      composeKey(f, (p.tones?.[i] ?? 0) as Tone, scheme, opts.toneMode)
    );
    if (keys.some((k) => !k)) continue;

    const maxK = Math.min(opts.maxPatternLength, p.length);
    for (let K = MIN_K; K <= maxK; K++) {
      const startPositions = opts.tailOnly ? [p.length - K] : [];
      if (!opts.tailOnly) {
        for (let s = 0; s <= p.length - K; s++) startPositions.push(s);
      }
      for (const start of startPositions) {
        const sub = keys.slice(start, start + K);
        if (sub.some((k) => !k)) continue;
        const patternKey = sub.join('|') + '#' + K;
        let bucket = buckets.get(patternKey);
        if (!bucket) {
          bucket = new Map();
          buckets.set(patternKey, bucket);
        }
        bucket.set(phraseId, { phraseId, tailOffset: p.length - (start + K) });
      }
    }
  }
  return buckets;
}

/** Score a cluster's "cleverness".
 *
 *  Evolution notes:
 *  - 2026-04 (early): added TAIL diversity (char-level + last-segment-level)
 *    to kill template variants like "叫什么名字 / 你叫什么名字".
 *  - 2026-04 (mid): noticed top-200 was 199× depth-4 and full of garbage
 *    like "美丽的天地 / 美丽的间隙 / 美丽的园地" (shared prefix, only tail
 *    varies = not real rhyme discovery). Added PREFIX diversity + CHAR-POOL
 *    diversity. Rebalanced depth bonus so depth-3/5 can surface.
 *
 *  The four diversity signals now measured:
 *    1. source diversity  — 成语+口语+ACG > pure-lyrics
 *    2. tail diversity    — each member has a different ending
 *    3. prefix diversity  — each member has a different opening
 *    4. char-pool div     — unique chars across all members
 *
 *  A clever cluster scores high on ALL four. Templates score low on prefix.
 *  Near-duplicates score low on char-pool.
 */
function scoreCluster(
  members: readonly ClusterMember[],
  lexicon: Lexicon,
  patternLength: number,
  _distinctTags: readonly string[]
): number {
  // ── 1. Average member quality (with reduplication penalty) ───────────
  let qSum = 0;
  for (const m of members) {
    let q = lexicon.phrases[m.phraseId].quality;
    const chars = [...lexicon.phrases[m.phraseId].text];
    const uniqueRatio = new Set(chars).size / chars.length;
    // 反反复复 (2 unique / 4 = 0.5) penalized; most phrases pass clean.
    if (uniqueRatio < 0.75) q *= 0.5 + uniqueRatio * 0.5;
    qSum += q;
  }
  const avgQuality = qSum / members.length;

  // Min quality matters too — one bad apple shouldn't hide in an average.
  let minQ = 1.0;
  for (const m of members) {
    const q = lexicon.phrases[m.phraseId].quality;
    if (q < minQ) minQ = q;
  }
  // Blend: 70% avg + 30% min — a 0.3 outlier drags a 0.9-avg cluster down.
  const quality = avgQuality * 0.7 + minQ * 0.3;

  // ── 2. Source diversity (cross-register mixing is 惊艳) ──────────────
  const sources = new Set<string>();
  for (const m of members) sources.add(lexicon.phrases[m.phraseId].source);
  const srcDiv = sources.size === 1 ? 0.3
    : sources.size === 2 ? 0.7
    : sources.size === 3 ? 1.2
    : 1.6;

  // ── 3. Depth bonus ───────────────────────────────────────────────────
  // Two-phase: a gentle curve for 2→4 (they're all easy to rhyme in
  // Chinese — 4-char idioms are the natural density), then a steeper
  // rise at 5+ because depth-5 matches are hard to find in nature and
  // deserve to surface against the depth-4 flood.
  //   2押: 1.00, 3押: 1.18, 4押: 1.30, 5押: 1.52, 6押: 1.68, 7押: 1.78
  const lengthBonus = patternLength <= 4
    ? 1 + 0.18 * Math.log2(patternLength - 1)
    : 1.30 + 0.22 * Math.log2(patternLength - 3);

  // ── 4. Member count (flat — we don't want huge clusters crushing
  //      tight deep ones) ──────────────────────────────────────────────
  //  3: 0.61, 4: 0.64, 6: 0.68, 10: 0.73, 20: 0.80
  const memberBonus = 0.5 + 0.07 * Math.log2(members.length);

  // ── 5. Tail diversity (char-level + last-content-segment-level) ──────
  const tailTexts = new Set<string>();
  const lastSegTexts = new Set<string>();
  for (const m of members) {
    const phrase = lexicon.phrases[m.phraseId];
    const chars = [...phrase.text];
    tailTexts.add(chars.slice(Math.max(0, chars.length - patternLength)).join(''));

    const segs = phrase.segments;
    if (segs && segs.length > 0) {
      let lastSeg = segs[segs.length - 1].text;
      for (let si = segs.length - 1; si >= 0; si--) {
        const pos = segs[si].pos;
        if (!'uyeoxc'.includes(pos[0])) {
          lastSeg = segs[si].text;
          break;
        }
      }
      lastSegTexts.add(lastSeg);
    } else {
      lastSegTexts.add(chars.slice(-2).join(''));
    }
  }
  const rawTailDiv = Math.max(
    Math.min(tailTexts.size / members.length, lastSegTexts.size / members.length),
    0.12
  );
  // Depth 2 has too few possible tails to penalize; soften depth 3.
  const tailDiv = patternLength <= 2 ? 1.0
    : patternLength === 3 ? Math.pow(rawTailDiv, 0.5)
    : rawTailDiv;

  // ── 6. Prefix diversity (first non-rhyming segment) ──────────────────
  // Catches templates like "美丽的天地 / 美丽的间隙 / 美丽的园地" where
  // everyone shares "美丽的" and only the tail varies. prefixDiv counts
  // unique FIRST content segments; if members share a prefix, ratio drops.
  //
  // For short phrases (length == patternLength), there IS no prefix — the
  // whole phrase is the rhyming part, so prefix diversity is undefined.
  // In that case we fall back to the whole-phrase identity (1 per unique).
  const prefixTexts = new Set<string>();
  for (const m of members) {
    const phrase = lexicon.phrases[m.phraseId];
    const chars = [...phrase.text];
    const prefixLen = chars.length - patternLength;
    if (prefixLen <= 0) {
      // Whole phrase IS the rhyme — use the phrase text itself as identity.
      prefixTexts.add(phrase.text);
      continue;
    }
    // Prefer the FIRST content segment; fall back to first char.
    const segs = phrase.segments;
    let firstSeg: string | null = null;
    if (segs && segs.length > 0) {
      for (const s of segs) {
        if (!'uyeoxc'.includes(s.pos[0])) {
          firstSeg = s.text;
          break;
        }
      }
    }
    prefixTexts.add(firstSeg ?? chars.slice(0, Math.min(2, prefixLen)).join(''));
  }
  const rawPrefixDiv = Math.max(prefixTexts.size / members.length, 0.2);
  // Full penalty at depth 4+, soften at 2-3.
  const prefixDiv = patternLength <= 2 ? 1.0
    : patternLength === 3 ? Math.pow(rawPrefixDiv, 0.5)
    : rawPrefixDiv;

  // ── 7. Char-pool diversity (how much unique vocabulary is in the pool) ─
  // "美丽的天地 / 美丽的间隙 / 美丽的园地" = ~8 unique chars across 15
  //     → ratio 0.53 (template, penalized)
  // "基本基础没有打好 / 寂寞人最后法宝 / 没有打扰" = 15/17
  //     → ratio 0.88 (diverse, rewarded)
  const charPool = new Set<string>();
  let totalChars = 0;
  for (const m of members) {
    for (const c of lexicon.phrases[m.phraseId].text) {
      charPool.add(c);
      totalChars++;
    }
  }
  const charPoolRatio = charPool.size / Math.max(totalChars, 1);
  // Map ratio to a 0.5–1.2 multiplier: 0.4 → 0.5, 0.7 → 1.0, 1.0 → 1.2.
  const charPoolDiv = Math.max(0.5, Math.min(1.2, 0.5 + (charPoolRatio - 0.4) * 1.17));

  return (
    quality *
    (0.5 + srcDiv) *
    lengthBonus *
    memberBonus *
    tailDiv *
    prefixDiv *
    charPoolDiv
  );
}

/**
 * Mine clusters. Returns a catalog sorted by cleverness desc.
 *
 * Internally memoizes the expensive bucket-building pass by
 * (lexicon identity, scheme.id, tailOnly) so flipping min-depth /
 * min-members / max-clusters in the UI is cheap.
 */
export function mineClusters(
  lexicon: Lexicon,
  scheme: RhymeScheme,
  options: MineOptions = {}
): ClusterCatalog {
  const opts = { ...DEFAULT_OPTS, toneMode: 'none' as ToneMode, ...options };
  const cacheKey =
    `${scheme.id}:${opts.toneMode}:${opts.tailOnly ? 'tail' : 'all'}`;
  let lexCache = BUCKET_CACHE.get(lexicon);
  if (!lexCache) {
    lexCache = new Map();
    BUCKET_CACHE.set(lexicon, lexCache);
  }
  let buckets = lexCache.get(cacheKey);
  if (!buckets) {
    buckets = buildBuckets(lexicon, scheme, opts);
    lexCache.set(cacheKey, buckets);
  }

  const clusters: RhymeCluster[] = [];
  for (const [patternKey, members] of buckets) {
    // The bucket-level cache spans ALL K and membership counts; this
    // consumer filters on minPatternLength / minMembers per-call.
    if (members.size < opts.minMembers) continue;

    const memberList = Array.from(members.values()).sort(
      (a, b) => a.phraseId - b.phraseId
    );

    // Reconstruct pattern + length from the key.
    const hashPos = patternKey.lastIndexOf('#');
    const patternStr = patternKey.slice(0, hashPos);
    const patternLength = parseInt(patternKey.slice(hashPos + 1), 10);
    // Client-side filter on pattern length (cached bucket may contain
    // shorter patterns the user doesn't currently want to see).
    if (patternLength < opts.minPatternLength) continue;
    const pattern = patternStr.split('|');

    // Distinct tags across members.
    const tagSet = new Set<string>();
    for (const m of memberList) {
      for (const t of lexicon.phrases[m.phraseId].tags) tagSet.add(t);
    }
    const distinctTags = Array.from(tagSet).sort();

    const cleverness = scoreCluster(memberList, lexicon, patternLength, distinctTags);

    clusters.push({
      id: `${scheme.id}::${patternKey}`,
      pattern,
      patternLength,
      members: memberList,
      cleverness,
      distinctTags
    });
  }

  clusters.sort((a, b) => {
    if (b.cleverness !== a.cleverness) return b.cleverness - a.cleverness;
    if (b.patternLength !== a.patternLength) return b.patternLength - a.patternLength;
    return b.members.length - a.members.length;
  });

  return {
    clusters: clusters.slice(0, opts.maxClusters),
    lexiconRef: lexicon.phrases
  };
}
