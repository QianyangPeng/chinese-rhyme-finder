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
      composeKey(f, p.tones?.[i] ?? 0, scheme, opts.toneMode)
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

/** Score a cluster's "cleverness". See DECISIONS.md D-006 for the
 *  rationale. Tuned for the mixed-corpus era (idioms + OpenSubtitles).
 *
 *  Key signal added in 2026-04: **tail diversity**. When every member
 *  of a cluster shares the exact same last K characters (K = pattern
 *  length), they're template variants ("叫什么名字 / 你叫什么名字 /
 *  他叫什么名字") — not genuine rhyme discovery. Severely penalizes
 *  these so creative clusters like "相对华丽 / 洋洋得意 / 降维打击"
 *  rank above trivial pattern-fillers. */
function scoreCluster(
  members: readonly ClusterMember[],
  lexicon: Lexicon,
  patternLength: number,
  distinctTags: readonly string[]
): number {
  // Average quality of member phrases, with a per-phrase penalty for
  // repeated characters (反反复复, 打打杀杀 etc. — same-char repetition
  // isn't clever rhyming, just reduplication).
  let qSum = 0;
  for (const m of members) {
    let q = lexicon.phrases[m.phraseId].quality;
    const chars = [...lexicon.phrases[m.phraseId].text];
    const uniqueRatio = new Set(chars).size / chars.length;
    // uniqueRatio = 1.0 for all-distinct, 0.5 for 反反复复 (2 unique / 4)
    // Penalize when < 0.75 (at least 25% repeated chars).
    if (uniqueRatio < 0.75) q *= 0.5 + uniqueRatio * 0.5;
    qSum += q;
  }
  const avgQuality = qSum / members.length;

  // Source diversity: count distinct source values across members.
  // A cluster mixing idioms + rap lyrics + pop is more interesting
  // than one that's all pop-lyrics fragments.
  const sources = new Set<string>();
  for (const m of members) sources.add(lexicon.phrases[m.phraseId].source);
  // 1 source → 0.3, 2 → 0.6, 3+ → 1.0
  const diversity = Math.min(sources.size, 3) / 3;

  // Mild depth nudge — deeper rhymes get a small bonus but DON'T
  // dominate. A great 2-push (q=0.95) beats a mediocre 4-push (q=0.7).
  //   1押: 1.0,  2押: 1.1,  3押: 1.2,  4押: 1.3,  5押: 1.4
  // Old formula (log2) gave 2押=1.58, 4押=2.32 — way too aggressive.
  const lengthBonus = 1 + 0.1 * (patternLength - 1);

  // Member count: enough to be browsable but capped (clusters of 50
  // shouldn't overshadow tighter ones with 4 sharp members).
  const memberBonus = Math.min(members.length, 8) / 8;

  // ── Diversity penalties ─────────────────────────────────────────────
  //
  // Two levels of tail-sameness detection:
  //
  // 1. CHAR-LEVEL tail: last K literal characters (K = patternLength).
  //    Catches "叫什么名字 / 你叫什么名字 / 他叫什么名字" (all share
  //    exact "什么名字" as tail text).
  //
  // 2. WORD-LEVEL last segment: the last jieba token (via phrase.segments).
  //    Catches "活着的时候 / 开车的时候 / 唱歌的时候" — their last-4 chars
  //    differ ('着的时候' vs '车的时候') but the meaningful last WORD is
  //    the same: '时候'. Same for X先生, X自己, X意思 patterns.
  //
  // We take the MINIMUM of the two diversity ratios to penalize clusters
  // that are template-like on either dimension.

  const tailTexts = new Set<string>();
  const lastSegTexts = new Set<string>();
  for (const m of members) {
    const phrase = lexicon.phrases[m.phraseId];
    const chars = [...phrase.text];
    tailTexts.add(chars.slice(Math.max(0, chars.length - patternLength)).join(''));

    // Last content segment (skip trailing function words like 的/了/啊).
    const segs = phrase.segments;
    if (segs && segs.length > 0) {
      // Walk backwards to find the last non-particle segment.
      let lastSeg = segs[segs.length - 1].text;
      for (let si = segs.length - 1; si >= 0; si--) {
        const pos = segs[si].pos;
        // Skip pure function words: particles (u*), auxiliaries (y),
        // modal (e), interjections (o), punctuation (x), conjunctions (c)
        if (!'uyeoxc'.includes(pos[0])) {
          lastSeg = segs[si].text;
          break;
        }
      }
      lastSegTexts.add(lastSeg);
    } else {
      // No segments (seed entries) — use last 2 chars as proxy.
      lastSegTexts.add(chars.slice(-2).join(''));
    }
  }

  const charTailDiv = tailTexts.size / members.length;
  const segTailDiv = lastSegTexts.size / members.length;
  // Use the harsher of the two signals, floored at 0.12.
  const rawTailDiv = Math.max(Math.min(charTailDiv, segTailDiv), 0.12);

  // Disable tailDiv for 2-push: at depth 2 with medial stripping there
  // are only ~20 unique rhyme keys → 400 possible pairs → each pattern
  // has thousands of members sharing tails. Penalizing them kills ALL
  // 2-push clusters. For depth 3, soften. For 4+, full penalty.
  const tailDiv = patternLength <= 2 ? 1.0
    : patternLength === 3 ? Math.pow(rawTailDiv, 0.5)
    : rawTailDiv;

  return avgQuality * (0.5 + diversity) * lengthBonus * memberBonus * tailDiv;
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
