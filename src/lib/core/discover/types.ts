/**
 * Discover-mode types: rhyme clusters mined from the lexicon and scored
 * for "cleverness" — the headline feature of the product.
 *
 * A cluster is a set of phrases that share a multi-syllable rhyme
 * pattern at some position (typically the tail). Discover surfaces the
 * most interesting clusters proactively so users can browse for
 * inspiration instead of having to know what to search for.
 */

import type { PhraseRecord } from '../corpus/types.js';

/** Where in a phrase the matching key sub-sequence starts and ends. */
export interface ClusterMember {
  /** Index into `Lexicon.phrases`. */
  readonly phraseId: number;
  /**
   * 0 means the matching pattern aligns with the phrase's last syllable.
   * Larger values mean the pattern ends N syllables before the phrase end.
   * Useful for highlighting the matching positions in the UI.
   */
  readonly tailOffset: number;
}

/**
 * One rhyme cluster: a multi-syllable rhyme-key pattern plus the
 * phrases that contain it.
 */
export interface RhymeCluster {
  /** Stable cluster ID for client-side dedup / keyed renders. */
  readonly id: string;
  /** The shared rhyme-group key sequence (e.g., ["江阳辙", "灰堆辙", "发花辙", "一七辙"]). */
  readonly pattern: readonly string[];
  /** Pattern length (= multi-押 depth; 4 means "4 押"). */
  readonly patternLength: number;
  /** Members in input order. */
  readonly members: readonly ClusterMember[];
  /** Cleverness score — higher = more interesting cluster. */
  readonly cleverness: number;
  /** Convenience: distinct tag set across all members. */
  readonly distinctTags: readonly string[];
}

/** Catalog of clusters returned by the miner. */
export interface ClusterCatalog {
  /** All clusters, sorted by cleverness desc. */
  readonly clusters: readonly RhymeCluster[];
  /** Lexicon used to build the catalog (for resolving phraseId → phrase). */
  readonly lexiconRef: ReadonlyArray<PhraseRecord>;
}
