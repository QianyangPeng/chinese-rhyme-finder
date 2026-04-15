/**
 * Split a canonical pinyin syllable (as produced by `normalizer.ts`) into its
 * phonological components: 声母 (initial), 韵母 (final), and the inner
 * structure of the final — 韵头 (medial), 韵腹 (nucleus), 韵尾 (coda).
 *
 * Note on the apical -i in zi/ci/si and zhi/chi/shi/ri: the spelling "i"
 * after these initials denotes a different vowel ([ɨ]) than the high-front
 * "i" after j/q/x. We encode it as the distinct final "-i" so the rhyme
 * schemes can separate 支 (apical) from 一七 (regular i, ü) — matching
 * modern ear perception where 只 (shǐ) and 李 (lǐ) do NOT rhyme. See
 * DECISIONS.md D-011 for the rationale.
 */

/** Initials after which a written "i" is actually the apical vowel ([ɨ]). */
const APICAL_I_INITIALS = new Set(['zh', 'ch', 'sh', 'r', 'z', 'c', 's']);

/** Two-character initials must be tried before single-character ones. */
const TWO_CHAR_INITIALS = ['zh', 'ch', 'sh'] as const;

/** All single-character initials. */
const ONE_CHAR_INITIALS = new Set(
  'bpmfdtnlgkhjqxrzcs'.split('')
);

/**
 * Static decomposition of every standard Mandarin final into
 * (medial, nucleus, coda). Keys are canonical finals as produced by
 * `normalizePinyin`.
 */
const FINAL_DECOMPOSE: Record<string, readonly [string, string, string]> = {
  // Simple monophthongs
  'a':    ['', 'a', ''],
  'o':    ['', 'o', ''],
  'e':    ['', 'e', ''],
  'i':    ['', 'i', ''],
  'u':    ['', 'u', ''],
  'ü':    ['', 'ü', ''],
  'er':   ['', 'er', ''],

  // Diphthongs (no medial)
  'ai':   ['', 'a', 'i'],
  'ei':   ['', 'e', 'i'],
  'ao':   ['', 'a', 'o'],
  'ou':   ['', 'o', 'u'],

  // Nasal-coda finals (no medial)
  'an':   ['', 'a', 'n'],
  'en':   ['', 'e', 'n'],
  'ang':  ['', 'a', 'ng'],
  'eng':  ['', 'e', 'ng'],
  'ong':  ['', 'o', 'ng'],

  // i-medial finals
  'ia':   ['i', 'a', ''],
  'ie':   ['i', 'e', ''],
  'iao':  ['i', 'a', 'o'],
  'iou':  ['i', 'o', 'u'],
  'ian':  ['i', 'a', 'n'],
  'in':   ['', 'i', 'n'],     // i here is nucleus, not medial
  'iang': ['i', 'a', 'ng'],
  'ing':  ['', 'i', 'ng'],    // ditto
  'iong': ['i', 'o', 'ng'],

  // u-medial finals
  'ua':   ['u', 'a', ''],
  'uo':   ['u', 'o', ''],
  'uai':  ['u', 'a', 'i'],
  'uei':  ['u', 'e', 'i'],
  'uan':  ['u', 'a', 'n'],
  'uen':  ['u', 'e', 'n'],
  'uang': ['u', 'a', 'ng'],
  'ueng': ['u', 'e', 'ng'],

  // ü-medial finals
  'üe':   ['ü', 'e', ''],
  'üan':  ['ü', 'a', 'n'],
  'ün':   ['', 'ü', 'n'],     // ü as nucleus, not medial

  // Apical -i: phonetically the syllabic continuation of the initial, but
  // we still mark medial/nucleus/coda as if it were regular i for
  // downstream simplicity.
  '-i':   ['', 'i', '']
};

/** Set of all valid final strings — useful for unit tests / sanity checks. */
export const VALID_FINALS: ReadonlySet<string> = new Set(
  Object.keys(FINAL_DECOMPOSE)
);

export interface Decomposed {
  /** 声母, e.g., "j", "zh", "" (null initial). */
  readonly initial: string;
  /** 韵母 = medial + nucleus + coda. */
  readonly final: string;
  /** 韵头. */
  readonly medial: string;
  /** 韵腹. */
  readonly nucleus: string;
  /** 韵尾. */
  readonly coda: string;
}

/**
 * Try to extract the initial from the start of a canonical pinyin syllable.
 * Returns the matched initial (possibly empty for null-initial syllables)
 * and the remaining string (the final).
 */
function extractInitial(canonical: string): { initial: string; rest: string } {
  // Two-character initials first
  for (const init of TWO_CHAR_INITIALS) {
    if (canonical.startsWith(init)) {
      return { initial: init, rest: canonical.slice(init.length) };
    }
  }
  // Single-character
  if (canonical.length > 0 && ONE_CHAR_INITIALS.has(canonical[0])) {
    return { initial: canonical[0], rest: canonical.slice(1) };
  }
  // Null initial (the whole canonical IS the final, e.g., "iang", "uei")
  return { initial: '', rest: canonical };
}

/**
 * Decompose a canonical pinyin syllable into initial + final + components.
 *
 * Returns `null` if the canonical form is not a recognized Mandarin syllable.
 * Callers should treat null as "unknown" — typically the input was garbled
 * or contained a non-syllable form (e.g., bare consonant clusters, English).
 */
export function decompose(canonical: string): Decomposed | null {
  if (canonical.length === 0) return null;

  const { initial, rest } = extractInitial(canonical);

  // Apical-i remap: "shi" / "zhi" / "ri" / "zi" / "ci" / "si" /… all
  // surface as initial + "i", but the "i" here is the apical vowel,
  // phonologically distinct from the i after j/q/x/l/m/b/p/…. Mark it.
  let final = rest;
  if (rest === 'i' && APICAL_I_INITIALS.has(initial)) {
    final = '-i';
  }

  const components = FINAL_DECOMPOSE[final];
  if (!components) return null;

  const [medial, nucleus, coda] = components;
  return { initial, final, medial, nucleus, coda };
}
