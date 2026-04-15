/**
 * English-word → Mandarin-final approximation table.
 *
 * The job: make a verse like "今天 vibe 最好 / 抓住 every 个机会" legible
 * to the rhyme engine. Rap-adjacent English words get mapped to the
 * closest Mandarin 韵母 so Analyze and Search see them as syllables
 * that can participate in rhyme clusters with Chinese characters.
 *
 * This is a *static lookup*, not a generator — we pick one canonical
 * final per word based on typical rap-circle pronunciation. LLM-based
 * phonetic inference is explicitly out of scope (see DECISIONS.md D-002
 * for why).
 *
 * Scope for v1: ~80 words that routinely appear in Chinese rap / hip-hop
 * lyrics. Plenty of glaring omissions; the table is meant to grow.
 *
 * Conventions:
 *   - Word lookup is lowercase, punctuation-stripped
 *   - Words that are really two syllables (e.g. "beatbox", "hip-hop",
 *     "brother") yield an array of syllable entries
 *   - final is one of the 37 canonical Mandarin finals OR "-i" (apical)
 *     — kept to the same alphabet so schemes/matchers don't need to
 *     special-case English
 *   - initial is best-effort for display; if the English onset has no
 *     Mandarin equivalent we set it to '' and treat the syllable as
 *     null-initial for decomposition purposes
 */

import type { Syllable } from './types.js';

/** What one English "syllable" looks like when fed through the pipeline. */
export interface EnglishSyllable {
  /** Display form (e.g. "hip", "hop", "beat"). Mixed case as users wrote it. */
  readonly text: string;
  /** Canonical final — one of the 37 Mandarin final codes. */
  readonly final: string;
  /** Medial/nucleus/coda: set to match the final string via the same
   *  decomposition rules as native Mandarin syllables. */
  readonly medial: string;
  readonly nucleus: string;
  readonly coda: string;
  /** English has no tone; always 0. */
  readonly tone: 0;
}

interface RawEntry {
  syllables: Array<{ text: string; final: string }>;
}

/**
 * Minimal mapping from {final → (medial, nucleus, coda)} duplicated
 * from decomposer.ts. Duplicating a small static table is simpler than
 * importing from the decomposer and risking a circular import.
 */
const FINAL_DECOMP: Record<string, [string, string, string]> = {
  a: ['', 'a', ''],       ai: ['', 'a', 'i'],     an: ['', 'a', 'n'],   ang: ['', 'a', 'ng'],
  ao: ['', 'a', 'o'],     e: ['', 'e', ''],       ei: ['', 'e', 'i'],   en: ['', 'e', 'n'],
  eng: ['', 'e', 'ng'],   er: ['', 'er', ''],     i: ['', 'i', ''],     in: ['', 'i', 'n'],
  ing: ['', 'i', 'ng'],   o: ['', 'o', ''],       ong: ['', 'o', 'ng'], ou: ['', 'o', 'u'],
  u: ['', 'u', ''],       'ü': ['', 'ü', ''],     '-i': ['', 'i', '']
};

/** The core table. Keys are lowercase, stripped form. */
const ENGLISH_DICT: Readonly<Record<string, RawEntry>> = {
  // ─ i / 齐 / 支 family (close front vowels) ─
  'beat':      { syllables: [{ text: 'beat', final: 'i' }] },
  'beats':     { syllables: [{ text: 'beats', final: '-i' }] }, // ending "-s" pushed to apical
  'me':        { syllables: [{ text: 'me', final: 'i' }] },
  'we':        { syllables: [{ text: 'we', final: 'i' }] },
  'free':      { syllables: [{ text: 'free', final: 'i' }] },
  'see':       { syllables: [{ text: 'see', final: 'i' }] },
  'feel':      { syllables: [{ text: 'feel', final: 'i' }] },
  'real':      { syllables: [{ text: 'real', final: 'i' }] },
  'deal':      { syllables: [{ text: 'deal', final: 'i' }] },
  'kill':      { syllables: [{ text: 'kill', final: 'i' }] },
  'mic':       { syllables: [{ text: 'mic', final: 'ai' }] }, // diphthong, belongs to 开
  'king':      { syllables: [{ text: 'king', final: 'ing' }] },
  'bling':     { syllables: [{ text: 'bling', final: 'ing' }] },
  'ring':      { syllables: [{ text: 'ring', final: 'ing' }] },
  'thing':     { syllables: [{ text: 'thing', final: 'ing' }] },
  'swing':     { syllables: [{ text: 'swing', final: 'ing' }] },
  'sing':      { syllables: [{ text: 'sing', final: 'ing' }] },

  // ─ ai / 开 (long i / i-diphthong) ─
  'like':      { syllables: [{ text: 'like', final: 'ai' }] },
  'life':      { syllables: [{ text: 'life', final: 'ai' }] },
  'style':     { syllables: [{ text: 'style', final: 'ai' }] },
  'ride':      { syllables: [{ text: 'ride', final: 'ai' }] },
  'vibe':      { syllables: [{ text: 'vibe', final: 'ai' }] },
  'tight':     { syllables: [{ text: 'tight', final: 'ai' }] },
  'right':     { syllables: [{ text: 'right', final: 'ai' }] },
  'fight':     { syllables: [{ text: 'fight', final: 'ai' }] },
  'time':      { syllables: [{ text: 'time', final: 'ai' }] },
  'mine':      { syllables: [{ text: 'mine', final: 'ai' }] },
  'line':      { syllables: [{ text: 'line', final: 'ai' }] },
  'mind':      { syllables: [{ text: 'mind', final: 'ai' }] },
  'grind':     { syllables: [{ text: 'grind', final: 'ai' }] },
  'rhyme':     { syllables: [{ text: 'rhyme', final: 'ai' }] },

  // ─ ei / 微 ─
  'day':       { syllables: [{ text: 'day', final: 'ei' }] },
  'way':       { syllables: [{ text: 'way', final: 'ei' }] },
  'say':       { syllables: [{ text: 'say', final: 'ei' }] },
  'play':      { syllables: [{ text: 'play', final: 'ei' }] },
  'stay':      { syllables: [{ text: 'stay', final: 'ei' }] },
  'hate':      { syllables: [{ text: 'hate', final: 'ei' }] },
  'hey':       { syllables: [{ text: 'hey', final: 'ei' }] },
  'fame':      { syllables: [{ text: 'fame', final: 'ei' }] },
  'game':      { syllables: [{ text: 'game', final: 'ei' }] },
  'name':      { syllables: [{ text: 'name', final: 'ei' }] },
  'change':    { syllables: [{ text: 'change', final: 'ei' }] },
  'chain':     { syllables: [{ text: 'chain', final: 'ei' }] },
  'pain':      { syllables: [{ text: 'pain', final: 'ei' }] },
  'brain':     { syllables: [{ text: 'brain', final: 'ei' }] },
  'k':         { syllables: [{ text: 'k', final: 'ei' }] }, // "OK", standalone letter
  'ok':        { syllables: [{ text: 'ok', final: 'ei' }] },

  // ─ ou / 尤 ─
  'flow':      { syllables: [{ text: 'flow', final: 'ou' }] },
  'yo':        { syllables: [{ text: 'yo', final: 'ou' }] },
  'pro':       { syllables: [{ text: 'pro', final: 'ou' }] },
  'bro':       { syllables: [{ text: 'bro', final: 'ou' }] },
  'dope':      { syllables: [{ text: 'dope', final: 'ou' }] },
  'hope':      { syllables: [{ text: 'hope', final: 'ou' }] },
  'mode':      { syllables: [{ text: 'mode', final: 'ou' }] },
  'low':       { syllables: [{ text: 'low', final: 'ou' }] },
  'snow':      { syllables: [{ text: 'snow', final: 'ou' }] },
  'show':      { syllables: [{ text: 'show', final: 'ou' }] },
  'go':        { syllables: [{ text: 'go', final: 'ou' }] },
  'no':        { syllables: [{ text: 'no', final: 'ou' }] },
  'so':        { syllables: [{ text: 'so', final: 'ou' }] },
  'oh':        { syllables: [{ text: 'oh', final: 'ou' }] },

  // ─ a / ao / 麻 / 豪 ─
  'rap':       { syllables: [{ text: 'rap', final: 'a' }] },
  'fat':       { syllables: [{ text: 'fat', final: 'a' }] },
  'flat':      { syllables: [{ text: 'flat', final: 'a' }] },
  'black':     { syllables: [{ text: 'black', final: 'a' }] },
  'back':      { syllables: [{ text: 'back', final: 'a' }] },
  'crack':     { syllables: [{ text: 'crack', final: 'a' }] },
  'track':     { syllables: [{ text: 'track', final: 'a' }] },
  'trap':      { syllables: [{ text: 'trap', final: 'a' }] },
  'swag':      { syllables: [{ text: 'swag', final: 'a' }] },
  'drag':      { syllables: [{ text: 'drag', final: 'a' }] },
  'man':       { syllables: [{ text: 'man', final: 'a' }] }, // "sup man", "the man"
  'now':       { syllables: [{ text: 'now', final: 'ao' }] },
  'down':      { syllables: [{ text: 'down', final: 'ao' }] },
  'crown':     { syllables: [{ text: 'crown', final: 'ao' }] },
  'wow':       { syllables: [{ text: 'wow', final: 'ao' }] },

  // ─ e / 波 ─
  'tech':      { syllables: [{ text: 'tech', final: 'e' }] },
  'check':     { syllables: [{ text: 'check', final: 'e' }] },
  'fresh':     { syllables: [{ text: 'fresh', final: 'e' }] },
  'flex':      { syllables: [{ text: 'flex', final: 'e' }] },
  'step':      { syllables: [{ text: 'step', final: 'e' }] },
  'death':     { syllables: [{ text: 'death', final: 'e' }] },
  'yes':       { syllables: [{ text: 'yes', final: 'e' }] },

  // ─ en / 文 ─
  'friend':    { syllables: [{ text: 'friend', final: 'en' }] },
  'end':       { syllables: [{ text: 'end', final: 'en' }] },
  'trend':     { syllables: [{ text: 'trend', final: 'en' }] },
  'spent':     { syllables: [{ text: 'spent', final: 'en' }] },

  // ─ u / 姑 ─
  'cool':      { syllables: [{ text: 'cool', final: 'u' }] },
  'school':    { syllables: [{ text: 'school', final: 'u' }] },
  'rule':      { syllables: [{ text: 'rule', final: 'u' }] },
  'move':      { syllables: [{ text: 'move', final: 'u' }] },
  'true':      { syllables: [{ text: 'true', final: 'u' }] },
  'new':       { syllables: [{ text: 'new', final: 'u' }] },

  // ─ Multi-syllable (rap staples) ─
  'hip-hop':   { syllables: [{ text: 'hip', final: 'i' }, { text: 'hop', final: 'a' }] },
  'hiphop':    { syllables: [{ text: 'hip', final: 'i' }, { text: 'hop', final: 'a' }] },
  'beatbox':   { syllables: [{ text: 'beat', final: 'i' }, { text: 'box', final: 'a' }] },
  'freestyle': { syllables: [{ text: 'free', final: 'i' }, { text: 'style', final: 'ai' }] },
  'cypher':    { syllables: [{ text: 'cy', final: 'ai' }, { text: 'pher', final: 'er' }] },
  'sucker':    { syllables: [{ text: 'suck', final: 'a' }, { text: 'er', final: 'er' }] },
  'swagger':   { syllables: [{ text: 'swag', final: 'a' }, { text: 'ger', final: 'er' }] },
  'brother':   { syllables: [{ text: 'bro', final: 'a' }, { text: 'ther', final: 'er' }] },
  'matter':    { syllables: [{ text: 'mat', final: 'a' }, { text: 'ter', final: 'er' }] },
  'rapper':    { syllables: [{ text: 'rap', final: 'a' }, { text: 'per', final: 'er' }] }
};

/** Look up an English word (case-insensitive, no surrounding punctuation). */
export function lookupEnglishWord(word: string): EnglishSyllable[] | null {
  if (!word) return null;
  const key = word.toLowerCase();
  const entry = ENGLISH_DICT[key];
  if (!entry) return null;
  return entry.syllables.map((s) => {
    const decomp = FINAL_DECOMP[s.final] ?? ['', s.final, ''];
    return {
      text: s.text,
      final: s.final,
      medial: decomp[0],
      nucleus: decomp[1],
      coda: decomp[2],
      tone: 0 as const
    };
  });
}

/** Build a full Syllable from an EnglishSyllable + the original word.
 *  Sets initial='' (we don't model English onsets) and erhua=false. */
export function englishSyllableToSyllable(es: EnglishSyllable): Syllable {
  return {
    char: es.text,
    pinyin: es.final,           // no real pinyin, but fill so chips render
    pinyinWithTone: es.text,
    tone: es.tone,
    initial: '',
    final: es.final,
    medial: es.medial,
    nucleus: es.nucleus,
    coda: es.coda,
    erhua: false
  };
}

/** Is `word` (a run of English letters) known to the table? */
export function hasEnglishEntry(word: string): boolean {
  return ENGLISH_DICT[word.toLowerCase()] !== undefined;
}

/** Exposed for tests. */
export const ENGLISH_DICT_SIZE = Object.keys(ENGLISH_DICT).length;
