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
  opts: { tailOnly: boolean; maxPatternLength: number }
): Map<string, Map<number, ClusterMember>> {
  const buckets = new Map<string, Map<number, ClusterMember>>();
  const MIN_K = 2; // buckets start at depth 2; below that every phrase is a group

  for (let phraseId = 0; phraseId < lexicon.phrases.length; phraseId++) {
    const p = lexicon.phrases[phraseId];
    const keys = p.finals.map((f) => scheme.keyOf(f));
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

/** Score a cluster's "cleverness". See DECISIONS.md D-006 for the
 *  rationale. Phase 1 implementation; refined later as data grows. */
function scoreCluster(
  members: readonly ClusterMember[],
  lexicon: Lexicon,
  patternLength: number,
  distinctTags: readonly string[]
): number {
  // Average quality of member phrases.
  let qSum = 0;
  for (const m of members) qSum += lexicon.phrases[m.phraseId].quality;
  const avgQuality = qSum / members.length;

  // Domain diversity: more distinct tags = higher.
  const diversity = Math.min(distinctTags.length, 5) / 5;

  // Multi-syllable depth bonus (logarithmic so 4 押 doesn't dominate
  // 2 押 by a 2x factor).
  const lengthBonus = Math.log2(patternLength + 1);

  // Member count: enough to be browsable but capped (clusters of 50
  // shouldn't overshadow tighter ones with 4 sharp members).
  const memberBonus = Math.min(members.length, 8) / 8;

  return avgQuality * (0.5 + diversity) * lengthBonus * memberBonus;
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
  const opts = { ...DEFAULT_OPTS, ...options };
  const cacheKey = opts.tailOnly ? `${scheme.id}:tail` : `${scheme.id}:all`;
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
