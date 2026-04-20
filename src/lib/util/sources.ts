/**
 * Shared source metadata: labels (bilingual), colors, and quality
 * priority ordering. One source of truth used by Discover, Search,
 * Write, and homepage so everything matches.
 */

export interface SourceMeta {
  /** Source ID as stored in PhraseRecord.source. */
  readonly id: string;
  /** Short label in Chinese (e.g. 成语, 歌词). */
  readonly zh: string;
  /** Short label in English (e.g. Idioms, Pop lyrics). */
  readonly en: string;
  /** Tailwind color classes for the small badge chip. */
  readonly badgeCls: string;
  /** Tailwind color classes for the thick left-edge bar indicator
   *  used in Search's source-grouped view. */
  readonly barCls: string;
  /** Priority for sorting source-groups in the Search results. Lower
   *  number = shown first (higher priority). Curated dictionaries go
   *  first, noisy corpora last. */
  readonly priority: number;
}

/**
 * Central registry. Priority order is what Search renders top-down:
 * 成语 & 词典 first (most authoritative), then poetry, then idioms
 * / lyrics, then noisier web sources.
 */
export const SOURCES: readonly SourceMeta[] = [
  { id: 'xinhua-idiom',        zh: '成语', en: 'Idioms',
    badgeCls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    barCls:   'bg-amber-400 dark:bg-amber-500', priority: 1 },
  { id: 'cedict',              zh: '词典', en: 'Dictionary',
    badgeCls: 'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200',
    barCls:   'bg-lime-400 dark:bg-lime-500', priority: 2 },
  { id: 'xinhua-xiehouyu',     zh: '歇后', en: 'Xiehouyu',
    badgeCls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
    barCls:   'bg-rose-400 dark:bg-rose-500', priority: 3 },
  { id: 'chinese-poetry/tang', zh: '唐诗', en: 'Tang poetry',
    badgeCls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    barCls:   'bg-violet-400 dark:bg-violet-500', priority: 4 },
  { id: 'chinese-poetry/song', zh: '宋词', en: 'Song ci',
    badgeCls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
    barCls:   'bg-indigo-400 dark:bg-indigo-500', priority: 5 },
  { id: 'lyrics-hiphop',       zh: '说唱', en: 'Hip-hop',
    badgeCls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    barCls:   'bg-red-400 dark:bg-red-500', priority: 6 },
  { id: 'lyrics-pop',          zh: '歌词', en: 'Pop lyrics',
    badgeCls: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200',
    barCls:   'bg-pink-400 dark:bg-pink-500', priority: 7 },
  { id: 'opensubtitles-zh',    zh: '口语', en: 'Colloquial',
    badgeCls: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200',
    barCls:   'bg-cyan-400 dark:bg-cyan-500', priority: 8 },
  { id: 'moegirl-acg',         zh: 'ACG', en: 'ACG',
    badgeCls: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-200',
    barCls:   'bg-fuchsia-400 dark:bg-fuchsia-500', priority: 9 },
  { id: 'wiktionary-slang',    zh: '网络', en: 'Net slang',
    badgeCls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    barCls:   'bg-emerald-400 dark:bg-emerald-500', priority: 10 }
];

const _byId = new Map<string, SourceMeta>(SOURCES.map((s) => [s.id, s]));

const _fallback: SourceMeta = {
  id: '?', zh: '?', en: '?',
  badgeCls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  barCls:   'bg-zinc-400 dark:bg-zinc-600',
  priority: 99
};

export function sourceMeta(sourceId: string): SourceMeta {
  return _byId.get(sourceId) ?? _fallback;
}

/** All source ids, ordered by priority. Used by toggle filters. */
export const SOURCE_IDS_BY_PRIORITY = SOURCES
  .map((s) => s.id)
  .slice()
  .sort((a, b) => (_byId.get(a)!.priority) - (_byId.get(b)!.priority));
