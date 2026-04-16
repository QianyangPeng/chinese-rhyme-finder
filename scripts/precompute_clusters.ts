/**
 * Pre-compute Discover clusters at build time.
 *
 * Runs the EXACT same miner algorithm the browser uses, but offline.
 * Outputs one JSON file per (depth, toneMode) combination into
 * static/data/clusters/. The Discover page fetches the matching file
 * and renders directly — zero runtime computation.
 *
 * Usage:
 *   npx tsx scripts/precompute_clusters.ts
 *
 * Reads per-source JSON files from static/data/*.json, builds a merged
 * lexicon (respecting default source toggles: no tang/song/xiehouyu),
 * and mines clusters for each config.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

// ── Import the actual miner + scheme code (same as browser) ──────
import { mineClusters } from '../src/lib/core/discover/miner.js';
import { strictScheme } from '../src/lib/core/rhyme/schemes/strict.js';
import { composeKey } from '../src/lib/core/rhyme/tone.js';
import type { Lexicon, PhraseRecord } from '../src/lib/core/corpus/types.js';
import type { ToneMode } from '../src/lib/core/rhyme/tone.js';

// ── Config ───────────────────────────────────────────────────────
const DATA_DIR = join(import.meta.dirname ?? '.', '..', 'static', 'data');
const OUT_DIR = join(DATA_DIR, 'clusters');

// Default ON sources (matches Discover UI defaults).
const DEFAULT_SOURCES = new Set([
  'xinhua-idiom',
  'opensubtitles-zh',
  'wiktionary-slang',
  'lyrics-hiphop',
  'lyrics-pop',
]);

const DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const TONE_MODES: ToneMode[] = ['none', 'exact'];
const MIN_MEMBERS = 3;
const MAX_CLUSTERS = 8000;

// ── Load + merge lexicon from per-source files ──────────────────
function loadLexicon(): Lexicon {
  const phrases: PhraseRecord[] = [];
  const seen = new Set<string>();

  for (const file of readdirSync(DATA_DIR)) {
    if (!file.endsWith('.json') || file === 'manifest.json') continue;
    if (file.startsWith('clusters')) continue;

    const raw = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'));
    if (!raw.phrases || !Array.isArray(raw.phrases)) continue;

    const source = raw.source ?? raw.phrases[0]?.source ?? '';
    if (!DEFAULT_SOURCES.has(source)) continue;

    for (const entry of raw.phrases) {
      if (seen.has(entry.text)) continue;
      seen.add(entry.text);
      phrases.push({
        text: entry.text,
        language: entry.language ?? 'zh',
        length: entry.length,
        finals: entry.rhymeKeys ?? entry.finals ?? [],
        tones: entry.tones,
        pinyinWithTone: entry.syllables ?? entry.pinyinWithTone,
        segments: entry.segments,
        quality: entry.quality,
        tags: entry.tags ?? [],
        source: entry.source,
      });
    }
  }

  // Build byLength index.
  const byLength = new Map<number, number[]>();
  for (let id = 0; id < phrases.length; id++) {
    const L = phrases[id].length;
    let bucket = byLength.get(L);
    if (!bucket) { bucket = []; byLength.set(L, bucket); }
    bucket.push(id);
  }

  console.error(`[precompute] loaded ${phrases.length.toLocaleString()} phrases from ${DEFAULT_SOURCES.size} sources`);
  return { phrases, byLength };
}

// ── Stem dedup (same logic as Discover UI) ──────────────────────
function stemDedupe(
  members: readonly { phraseId: number; tailOffset: number }[],
  phrases: readonly PhraseRecord[],
  patternLength: number
): { visible: typeof members; collapsed: number } {
  type M = { phraseId: number; tailOffset: number };
  const byTail = new Map<string, M[]>();
  const byHead = new Map<string, M[]>();

  for (const m of members) {
    const phrase = phrases[m.phraseId];
    const chars = [...phrase.text].filter(ch => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch));
    const tailKey = chars.slice(Math.max(0, chars.length - patternLength)).join('');
    const firstSeg = phrase.segments?.[0]?.text ?? chars[0] ?? '';
    const pos = phrase.segments?.map(s => s.pos).join('|') ?? '';
    const headKey = `${firstSeg}::${pos}`;

    let g = byTail.get(tailKey);
    if (!g) { g = []; byTail.set(tailKey, g); }
    g.push(m);
    g = byHead.get(headKey);
    if (!g) { g = []; byHead.set(headKey, g); }
    g.push(m);
  }

  const hidden = new Set<number>();
  for (const groups of [byTail.values(), byHead.values()]) {
    for (const group of groups) {
      if (group.length <= 1) continue;
      const sorted = [...group].sort((a, b) => phrases[b.phraseId].quality - phrases[a.phraseId].quality);
      for (let i = 1; i < sorted.length; i++) hidden.add(sorted[i].phraseId);
    }
  }

  return hidden.size === 0
    ? { visible: members, collapsed: 0 }
    : { visible: members.filter(m => !hidden.has(m.phraseId)), collapsed: hidden.size };
}

// ── Main ─────────────────────────────────────────────────────────
const lexicon = loadLexicon();
mkdirSync(OUT_DIR, { recursive: true });

let fileCount = 0;
for (const depth of DEPTHS) {
  for (const toneMode of TONE_MODES) {
    const catalog = mineClusters(lexicon, strictScheme, {
      minPatternLength: depth,
      minMembers: MIN_MEMBERS,
      tailOnly: true,
      toneMode,
      maxClusters: MAX_CLUSTERS,
    });

    // Apply stemDedupe + minMembers on visible, take top 200.
    const processed = catalog.clusters
      .map(cluster => {
        const deduped = stemDedupe(cluster.members, lexicon.phrases, cluster.patternLength);
        return { cluster, deduped };
      })
      .filter(({ deduped }) => deduped.visible.length >= MIN_MEMBERS)
      .slice(0, 200);

    // Denormalize: embed full phrase data in each member so browser
    // doesn't need the lexicon to render Discover.
    const output = {
      config: { depth, toneMode, sources: [...DEFAULT_SOURCES] },
      totalPhrases: lexicon.phrases.length,
      clusters: processed.map(({ cluster, deduped }) => ({
        id: cluster.id,
        pattern: cluster.pattern,
        patternLength: cluster.patternLength,
        cleverness: Math.round(cluster.cleverness * 100) / 100,
        distinctTags: cluster.distinctTags.filter(t => !t.startsWith('freq:')),
        totalMembers: cluster.members.length,
        collapsedCount: deduped.collapsed,
        members: deduped.visible.map(m => {
          const p = lexicon.phrases[m.phraseId];
          return {
            text: p.text,
            source: p.source,
            quality: p.quality,
            pinyinWithTone: p.pinyinWithTone,
            finals: p.finals,
            segments: p.segments,
            tailOffset: m.tailOffset,
          };
        }),
      })),
    };

    const filename = `depth-${depth}-tone-${toneMode}.json`;
    const outPath = join(OUT_DIR, filename);
    writeFileSync(outPath, JSON.stringify(output, null, 0), 'utf-8');
    const sizeKB = Math.round(readFileSync(outPath).length / 1024);
    console.error(`  ${filename}: ${output.clusters.length} clusters, ${sizeKB} KB`);
    fileCount++;
  }
}

console.error(`[precompute] wrote ${fileCount} cluster files to ${OUT_DIR}`);
