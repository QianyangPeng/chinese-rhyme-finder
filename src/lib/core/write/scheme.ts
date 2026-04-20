/**
 * Rhyme scheme engine for the /write page.
 *
 * Lets the user pick a high-level scheme (free / monorhyme / AABB / ABAB /
 * custom) and turns it into a per-line role letter array. From there we
 * compute which line anchors each group's rhyme, and how each line's
 * current tail compares to its group's target.
 *
 * Pure functions, no Svelte runes — this module is unit-testable in isolation.
 */
import type { LineAnalysis } from '../analyze/types.js';

// ── Scheme config ──────────────────────────────────────────────────────

export type SchemeType = 'free' | 'monorhyme' | 'aabb' | 'abab' | 'custom';

export interface SchemeConfig {
  readonly type: SchemeType;
  /** How many tail syllables must match to count as a "hit". 1..4. */
  readonly depth: number;
  /** Tone strictness — same semantics as Search page. */
  readonly toneMode: 'none' | 'exact';
  /** Only used when type === 'custom'. A string of uppercase letters
   *  (e.g. "AABBA"). If the input is longer than this, the pattern
   *  cycles. Non-letters are dropped; empty string falls back to 'free'. */
  readonly customPattern?: string;
}

/** Special letter marking "unconstrained" (free) rows. */
export const FREE_LETTER = '-';

// ── Pattern → letters[] ────────────────────────────────────────────────

/**
 * Compute the per-line role letter array under a given scheme and total
 * line count.
 *
 *   free       → ['-', '-', ...]
 *   monorhyme  → ['A', 'A', 'A', ...]
 *   aabb       → ['A', 'A', 'B', 'B', 'C', 'C', ...]   (pairs, new letter per pair)
 *   abab       → ['A', 'B', 'A', 'B', 'C', 'D', 'C', 'D', ...]  (quads, new pair per quad)
 *   custom(p)  → p cycled; non-letters stripped; empty → free
 */
export function computeLetters(
  type: SchemeType,
  lineCount: number,
  customPattern?: string
): string[] {
  if (lineCount <= 0) return [];

  switch (type) {
    case 'free':
      return new Array(lineCount).fill(FREE_LETTER);

    case 'monorhyme':
      return new Array(lineCount).fill('A');

    case 'aabb':
      return Array.from({ length: lineCount }, (_, i) =>
        letterAt(Math.floor(i / 2))
      );

    case 'abab':
      return Array.from({ length: lineCount }, (_, i) => {
        const group = Math.floor(i / 4);       // which quatrain
        const slot = i % 4;                    // 0,1,2,3 within quatrain
        // slot 0 and 2 share letter X, slot 1 and 3 share letter X+1
        const base = group * 2;
        return letterAt(slot % 2 === 0 ? base : base + 1);
      });

    case 'custom': {
      const cleaned = (customPattern ?? '').replace(/[^A-Za-z]/g, '').toUpperCase();
      if (!cleaned) return new Array(lineCount).fill(FREE_LETTER);
      return Array.from(
        { length: lineCount },
        (_, i) => cleaned[i % cleaned.length]
      );
    }
  }
}

/** Map a zero-based index to a letter label. 0→A, 25→Z, 26→AA, 27→AB, ... */
function letterAt(idx: number): string {
  if (idx < 0) return FREE_LETTER;
  if (idx < 26) return String.fromCharCode(65 + idx);
  // Multi-letter fallback for very long pieces; rarely hit in practice.
  let n = idx;
  let out = '';
  while (n >= 0) {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out;
}

// ── Anchor computation ────────────────────────────────────────────────

export interface Anchor {
  /** Which line is the anchor for this letter group. */
  readonly lineIndex: number;
  /** The tail rhyme keys that every other line in the group should match.
   *  Length = min(depth, anchor line's syllable count). */
  readonly keys: readonly string[];
}

/**
 * For each role letter present in `letters`, find the first non-empty
 * line with that letter — that's the anchor. Its tail finals of length
 * `depth` become the target every other line in the group aims for.
 *
 * "Non-empty" means the line has ≥1 syllable under the current scheme.
 * Lines with only punctuation / English are skipped (never anchors).
 */
export function computeAnchors(
  letters: readonly string[],
  lines: readonly LineAnalysis[],
  depth: number
): Map<string, Anchor> {
  const anchors = new Map<string, Anchor>();
  const n = Math.min(letters.length, lines.length);
  for (let i = 0; i < n; i++) {
    const L = letters[i];
    if (L === FREE_LETTER) continue;
    if (anchors.has(L)) continue;
    const line = lines[i];
    if (!line || line.keys.length === 0) continue;
    const k = Math.min(depth, line.keys.length);
    anchors.set(L, {
      lineIndex: i,
      keys: line.keys.slice(line.keys.length - k)
    });
  }
  return anchors;
}

// ── Per-line match evaluation ─────────────────────────────────────────

export type MatchState =
  | 'free'     // letter is '-' — no constraint
  | 'anchor'   // this line IS the anchor of its group
  | 'hit'      // all target positions matched
  | 'partial'  // some target positions matched but not all
  | 'miss'     // zero target positions matched
  | 'empty';   // line has no syllables (can't evaluate)

export interface LineMatch {
  readonly state: MatchState;
  /** How many of the target positions the line's tail actually matched.
   *  Length of target keys, minus the number of positional mismatches. */
  readonly matchedCount: number;
  /** How many positions were compared (= min(depth, line tail length,
   *  anchor tail length)). */
  readonly comparedCount: number;
  /** The target keys this line was compared against. Empty when free / empty / anchor. */
  readonly targetKeys: readonly string[];
  /** Per-position match result, aligned to target (tail-right). */
  readonly perPosition: readonly boolean[];
  /** For display: the role letter. */
  readonly letter: string;
}

/**
 * Evaluate one line's match state against its group's anchor.
 *
 * Returns `'free'` immediately for '-' letters (no constraint).
 * Returns `'anchor'` if this is the anchor row itself.
 * Returns `'empty'` if the line has no syllables.
 *
 * Otherwise compares the line's tail of length `depth` against the
 * anchor's tail and reports hit/partial/miss.
 */
export function evaluateLine(
  lineIndex: number,
  letters: readonly string[],
  lines: readonly LineAnalysis[],
  anchors: Map<string, Anchor>,
  depth: number
): LineMatch {
  const letter = letters[lineIndex] ?? FREE_LETTER;
  const line = lines[lineIndex];

  if (letter === FREE_LETTER) {
    return emptyMatch('free', letter);
  }
  if (!line || line.keys.length === 0) {
    return emptyMatch('empty', letter);
  }
  const anchor = anchors.get(letter);
  if (!anchor) {
    // Letter has no anchor (no line in the group has syllables yet) —
    // treat same as empty / waiting.
    return emptyMatch('empty', letter);
  }
  if (anchor.lineIndex === lineIndex) {
    return {
      state: 'anchor',
      matchedCount: 0,
      comparedCount: 0,
      targetKeys: anchor.keys,
      perPosition: [],
      letter
    };
  }

  const cmp = Math.min(depth, line.keys.length, anchor.keys.length);
  // Align both tail-right and compare
  const tail = line.keys.slice(line.keys.length - cmp);
  const target = anchor.keys.slice(anchor.keys.length - cmp);
  const perPosition: boolean[] = new Array(cmp);
  let matched = 0;
  for (let j = 0; j < cmp; j++) {
    const ok = tail[j] === target[j] && tail[j] !== '';
    perPosition[j] = ok;
    if (ok) matched++;
  }

  const state: MatchState =
    matched === 0 ? 'miss' : matched === cmp ? 'hit' : 'partial';

  return {
    state,
    matchedCount: matched,
    comparedCount: cmp,
    targetKeys: target,
    perPosition,
    letter
  };
}

function emptyMatch(state: MatchState, letter: string): LineMatch {
  return {
    state,
    matchedCount: 0,
    comparedCount: 0,
    targetKeys: [],
    perPosition: [],
    letter
  };
}

// ── Utility: human-friendly scheme label (bilingual) ───────────────────

/**
 * Labels are rendered by the UI via `t()`; this function only emits the
 * semantic identifiers. UI components pair them with translated strings.
 */
export const SCHEME_TYPES: readonly SchemeType[] = [
  'free', 'monorhyme', 'aabb', 'abab', 'custom'
];
