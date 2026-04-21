/**
 * Anchor engine for the /write page.
 *
 * An "anchor" is a substring of a paragraph that the user wants rhymes
 * for. Each line's tail is auto-anchored (maximal-match against the
 * dictionary), and the user can drag-select any substring to add
 * additional anchors (mid-line words for internal rhymes).
 *
 * v3 adds rhyme-group assignment: after auto + manual anchors are
 * collected, they're partitioned into groups by last-syllable final
 * key. All anchors in one group share a color; among the auto anchors,
 * only the first one (by start offset) in each group gets a panel
 * entry — later matching tails are "highlight-only" (colored in the
 * editor, but not their own candidate panel).
 *
 * This module is pure TS — no Svelte runes — so it's unit-testable.
 */

import type { Lexicon } from '../corpus/types.js';
import { parseSyllables } from '../pinyin/parser.js';
import { strictScheme } from '../rhyme/schemes/strict.js';

// ── Types ──────────────────────────────────────────────────────────

export type ToneMode = 'none' | 'exact';

export interface Anchor {
  /** Stable ID for UI keyed-each blocks. */
  readonly id: string;
  /** The anchor text itself (e.g. "傻瓜" or "只是一个"). */
  readonly text: string;
  /**
   * Character offset (in the paragraph's `text`) where this anchor
   * starts. Tracking offsets lets us re-detect validity after edits
   * (if the offset range still contains `text`, it's still valid).
   */
  readonly start: number;
  /** Exclusive end offset. */
  readonly end: number;
  /** Tone strictness for this specific anchor. */
  readonly toneMode: ToneMode;
  /**
   * Whether this anchor was auto-detected from a line tail (vs user-
   * picked via selection). Auto anchors get regenerated when the line
   * they belong to changes; manual anchors persist until user removes.
   */
  readonly auto: boolean;
  /** For auto anchors: which line (0-based) of the paragraph it anchors. */
  readonly lineIndex?: number;
  /**
   * True if this anchor is an "echo" — a mid-line dict word that
   * happens to rhyme with some other already-detected anchor. Echoes
   * are visual-only (their color bubbles up in the editor) and never
   * occupy a slot in the candidate panel, regardless of whether they
   * are first-in-group by start offset. `auto` is also true for
   * echoes; `echo` just disambiguates for the panel logic.
   */
  readonly echo?: boolean;
}

/**
 * Anchor + rhyme-group membership. Returned by `assignRhymeGroups`.
 * `groupId` shared among rhyming anchors; `colorIdx` drives palette
 * choice. `showsPanel` tells the UI whether this anchor gets its own
 * candidate panel section — true for all manual anchors, and for the
 * FIRST auto anchor (by start offset) in each group.
 */
export interface GroupedAnchor extends Anchor {
  readonly groupId: string;
  readonly colorIdx: number;
  readonly showsPanel: boolean;
  /** Globally stable rhyme key (strictScheme key of last-syllable
   *  final). Used for cross-paragraph hover-highlight: hovering any
   *  anchor sets the page's hoveredRhymeKey, and every anchor with
   *  the same rhymeKey lights up — even in other paragraphs. */
  readonly rhymeKey: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try { return crypto.randomUUID(); } catch { /* fall through */ }
  }
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A character is a CJK ideograph worth including in anchor detection. */
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

function isCJK(ch: string): boolean {
  return CJK_RE.test(ch);
}

// ── Dictionary index for maximal-match ─────────────────────────────

/**
 * Build a fast Set of 2-4 char "word-like" texts from the lexicon,
 * used by `autoAnchorForLine` to pick the longest real word at a
 * line's tail.
 *
 * We include all 2-4 char entries from CEDICT + Xinhua idiom +
 * xiehouyu (the dictionary-like sources). We deliberately EXCLUDE
 * opensubtitles / lyrics entries because those include transliterated
 * names and noisy n-grams that shouldn't count as "real words" for
 * auto-anchoring purposes.
 *
 * ~130k entries total — a single-digit MB of memory.
 */
const DICT_SOURCES = new Set([
  'cedict',
  'xinhua-idiom',
  'xinhua-xiehouyu',
  'wiktionary-slang'
]);

let _dictCache: WeakMap<Lexicon, Set<string>> = new WeakMap();

export function buildDictSet(lexicon: Lexicon): Set<string> {
  const cached = _dictCache.get(lexicon);
  if (cached) return cached;
  const set = new Set<string>();
  for (const p of lexicon.phrases) {
    if (p.length < 2 || p.length > 4) continue;
    if (!DICT_SOURCES.has(p.source)) continue;
    set.add(p.text);
  }
  _dictCache.set(lexicon, set);
  return set;
}

// ── Auto-anchor detection ──────────────────────────────────────────

/**
 * Find the auto-anchor at the END of a line.
 *
 * Strategy: maximal-match. Starting from the line's last CJK char,
 * walk left including up to 4 chars, and check if the resulting
 * substring is in the dictionary. Return the longest match found.
 * If none, fall back to the last 2 CJK chars (most common rhyme
 * target for Chinese rap).
 *
 * Returns null if the line has < 2 CJK chars.
 */
export function autoAnchorForLine(
  line: string,
  lineIndex: number,
  lineStartOffset: number,
  dict: Set<string>
): Anchor | null {
  // Find the tail run of CJK chars, skipping trailing non-CJK.
  const chars = [...line];
  let end = chars.length;
  while (end > 0 && !isCJK(chars[end - 1])) end--;
  if (end < 2) return null;

  // Try 4, 3, 2 char windows ending at `end`.
  for (const k of [4, 3, 2]) {
    if (end - k < 0) continue;
    const window = chars.slice(end - k, end);
    if (!window.every(isCJK)) continue;
    const text = window.join('');
    if (dict.has(text)) {
      // Compute char offsets inside the line.
      const startChar = end - k;
      // Map char index → byte/code-unit offset inside `line` string.
      // Since we split with [...line], chars covers the same string
      // but as UTF-16 code points (surrogate-aware). For offset we
      // need to count the same way.
      const start = chars.slice(0, startChar).join('').length;
      const offsetEnd = start + text.length;
      return {
        id: uid(),
        text,
        start: lineStartOffset + start,
        end: lineStartOffset + offsetEnd,
        toneMode: 'exact',
        auto: true,
        lineIndex
      };
    }
  }

  // No dictionary hit — default to last 2 chars.
  if (end - 2 >= 0) {
    const window = chars.slice(end - 2, end);
    if (window.every(isCJK)) {
      const text = window.join('');
      const startChar = end - 2;
      const start = chars.slice(0, startChar).join('').length;
      const offsetEnd = start + text.length;
      return {
        id: uid(),
        text,
        start: lineStartOffset + start,
        end: lineStartOffset + offsetEnd,
        toneMode: 'exact',
        auto: true,
        lineIndex
      };
    }
  }
  return null;
}

/**
 * Recompute all auto-anchors for a paragraph. Returns a fresh array
 * (call-site merges with manual anchors and diffs by identity to keep
 * stable IDs where text is unchanged).
 */
export function detectAutoAnchors(paragraphText: string, dict: Set<string>): Anchor[] {
  const anchors: Anchor[] = [];
  const lines = paragraphText.split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const anchor = autoAnchorForLine(line, i, offset, dict);
    if (anchor) anchors.push(anchor);
    offset += line.length + 1; // +1 for the '\n'
  }
  return anchors;
}

/**
 * Diff new auto-anchor detection against existing ones, preserving
 * stable IDs where text + line are unchanged. This keeps the UI from
 * remounting (and flashing the search results) on every keystroke
 * that doesn't change a rhyme target.
 */
export function mergeAutoAnchors(
  previous: readonly Anchor[],
  fresh: readonly Anchor[]
): Anchor[] {
  const previousAuto = previous.filter((a) => a.auto);
  const prevByLine = new Map<number, Anchor>();
  for (const a of previousAuto) {
    if (a.lineIndex !== undefined) prevByLine.set(a.lineIndex, a);
  }
  return fresh.map((nu) => {
    const old = nu.lineIndex !== undefined ? prevByLine.get(nu.lineIndex) : undefined;
    if (old && old.text === nu.text) {
      // Reuse old's ID + toneMode so UI components stay stable.
      return {
        ...nu,
        id: old.id,
        toneMode: old.toneMode,
        start: nu.start,
        end: nu.end
      };
    }
    return nu;
  });
}

// ── Manual anchor creation ─────────────────────────────────────────

/**
 * Create a manual anchor from a user selection. Defaults to exact tone.
 * start/end must be valid offsets inside `paragraphText`; the returned
 * anchor's `text` is sliced from the paragraph to stay consistent.
 */
export function makeManualAnchor(
  paragraphText: string,
  start: number,
  end: number,
  toneMode: ToneMode = 'exact'
): Anchor | null {
  if (start < 0 || end > paragraphText.length || end <= start) return null;
  // Trim leading/trailing non-CJK so the anchor is pure characters.
  while (start < end && !isCJK(paragraphText[start])) start++;
  while (end > start && !isCJK(paragraphText[end - 1])) end--;
  if (end - start < 1) return null;
  const text = paragraphText.slice(start, end);
  // Reject selections that aren't all CJK (mixed with punctuation
  // inside). A strict-all-CJK anchor gives cleaner results.
  if (!/^[\u4e00-\u9fff\u3400-\u4dbf]+$/.test(text)) return null;
  return {
    id: uid(),
    text,
    start,
    end,
    toneMode,
    auto: false
  };
}

// ── Mid-line rhyme echoes ──────────────────────────────────────────

/**
 * Find mid-line dict words whose rhyme key matches any of the given
 * "seed" anchors' rhyme keys. These echo anchors let the user see the
 * full rhyme pattern in a paragraph without having to manually select
 * every rhyming word.
 *
 * Example (user screenshot 2026-04-20):
 *   Text contains "…的相对华丽" (L1), "…姜维的戏" (L3),
 *   "…降维打击" (L4). L1's tail anchor 华丽 (i) and manual anchor
 *   相对 (uei) are the seeds. 姜维 and 降维 (both uei dict words
 *   sitting mid-line) get echoed with the same color as 相对.
 *
 * Rules:
 *   - Scan each line left→right, maximal-match against the dict at
 *     each position (4, 3, 2 chars).
 *   - Skip words that overlap any existing anchor (so we don't
 *     double-highlight the tail word or a manual's range).
 *   - Include a match iff its rhymeGroupKey matches one of the seed
 *     rhyme keys.
 *   - Yielded anchors have `auto: true, echo: true`. Caller merges
 *     them into the anchor list; assignRhymeGroups will NOT let them
 *     take a panel slot.
 */
export function detectEchoAnchors(
  paragraphText: string,
  dict: Set<string>,
  seedAnchors: readonly Anchor[]
): Anchor[] {
  if (seedAnchors.length === 0 || dict.size === 0) return [];

  // Active rhyme keys from the seeds.
  const activeKeys = new Set<string>();
  for (const s of seedAnchors) activeKeys.add(rhymeGroupKey(s.text));
  if (activeKeys.size === 0) return [];

  // Coverage ranges of existing anchors (half-open [start, end)).
  const covered: Array<[number, number]> = seedAnchors.map((a) => [a.start, a.end]);
  function hasOverlap(s: number, e: number): boolean {
    for (const [cs, ce] of covered) {
      if (!(e <= cs || s >= ce)) return true;
    }
    return false;
  }

  const echoes: Anchor[] = [];
  const lines = paragraphText.split('\n');
  let lineOffset = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let i = 0;
    while (i < line.length) {
      let advanced = false;
      // Try longest-match first.
      for (const k of [4, 3, 2]) {
        if (i + k > line.length) continue;
        const word = line.slice(i, i + k);
        if (!/^[\u4e00-\u9fff\u3400-\u4dbf]+$/.test(word)) continue;

        const inDict = dict.has(word);
        const key = rhymeGroupKey(word);
        const matchesSeed = activeKeys.has(key);

        // 3- and 4-char candidates must be in the dictionary so we
        // don't treat random long CJK runs as "words". 2-char
        // candidates get a proper-noun fallback: if the pair rhymes
        // with a seed, accept it even if it's not in the dict. This
        // catches names like "姜维" / modern compounds like "降维"
        // that aren't in cedict but the user can hear as rhymes.
        if (k > 2 && !inDict) continue;
        if (!matchesSeed) continue;
        if (k === 2 && !inDict) {
          // 2-char fallback already gated by matchesSeed; fine.
        }

        const start = lineOffset + i;
        const end = start + k;
        if (hasOverlap(start, end)) continue;

        // Add echo and skip past it.
        echoes.push({
          id: uid(),
          text: word,
          start,
          end,
          toneMode: 'exact',
          auto: true,
          echo: true,
          lineIndex: li
        });
        i += k;
        advanced = true;
        break;
      }
      if (!advanced) i++;
    }
    lineOffset += line.length + 1; // +1 for the newline
  }
  return echoes;
}

// ── Rhyme-group assignment ─────────────────────────────────────────

/**
 * Compute a group key for an anchor based on its last syllable's final.
 * Two anchors share a group iff they produce the same key.
 *
 * v1 decision: key on LAST syllable's final only (via strictScheme).
 * This is the Chinese-traditional definition of 押韵 — the rhyme is
 * the final of the last character. Tones are ignored here even when
 * `toneMode` on the anchor is 'exact'; tone only affects candidate
 * search, not the visual grouping.
 *
 * Returns a stable key string. Falls back to distinct sentinels when
 * the anchor text has no parseable syllables, so non-CJK or single-
 * character anchors don't all collapse into one group.
 */
export function rhymeGroupKey(text: string): string {
  const syllables = parseSyllables(text);
  if (syllables.length === 0) return `_noparse:${text}`;
  const last = syllables[syllables.length - 1];
  const key = strictScheme.keyOf(last.final);
  return key ?? `_unknown:${last.final}`;
}

/**
 * Partition anchors into rhyme groups and annotate each with a stable
 * color index + `showsPanel` flag.
 *
 * Algorithm:
 *   1. Sort a copy by start offset (stable for equal starts by text).
 *   2. Walk anchors left-to-right. Assign each to a group by its
 *      rhyme key — first occurrence creates a new group + new color
 *      index; later same-key anchors join that group.
 *   3. `showsPanel`:
 *        - manual anchors → always true
 *        - auto anchors → true only for the first auto anchor in each
 *          group (later auto tails that rhyme with an existing anchor
 *          are highlight-only)
 *
 * Returns a fresh array; input is not mutated.
 */
export function assignRhymeGroups(
  anchors: readonly Anchor[],
  /** Optional: a shared rhymeKey → colorIdx map used by the page to
   *  keep colors consistent across paragraphs. New keys encountered
   *  here are added to the map with the next available index so
   *  subsequent paragraphs can reuse the same color for the same
   *  rhyme. If omitted, colorIdx is assigned per-call starting at 0. */
  sharedColorMap?: Map<string, number>
): GroupedAnchor[] {
  // Step 1: walk a start-sorted copy to decide group membership. This
  // ensures the "first auto in group" has a deterministic meaning
  // (leftmost occurrence) regardless of input order.
  const sorted = [...anchors].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return a.end - b.end;
    return a.text.localeCompare(b.text);
  });

  interface GroupState {
    id: string;
    colorIdx: number;
    firstAutoId: string | null;
  }
  const byKey = new Map<string, GroupState>();
  const colorMap = sharedColorMap ?? new Map<string, number>();
  const membership = new Map<
    string,
    { groupId: string; colorIdx: number; showsPanel: boolean; rhymeKey: string }
  >();

  for (const a of sorted) {
    const key = rhymeGroupKey(a.text);
    let g = byKey.get(key);
    if (!g) {
      let colorIdx = colorMap.get(key);
      if (colorIdx === undefined) {
        colorIdx = colorMap.size;
        colorMap.set(key, colorIdx);
      }
      g = { id: `g${colorIdx}`, colorIdx, firstAutoId: null };
      byKey.set(key, g);
    }

    let showsPanel: boolean;
    if (a.echo) {
      showsPanel = false; // echoes are highlight-only, never panel reps
    } else if (!a.auto) {
      showsPanel = true; // manual always shows
    } else if (g.firstAutoId === null) {
      g.firstAutoId = a.id;
      showsPanel = true; // first auto TAIL in group shows
    } else {
      showsPanel = false; // later auto tail in same group: highlight-only
    }

    membership.set(a.id, {
      groupId: g.id,
      colorIdx: g.colorIdx,
      showsPanel,
      rhymeKey: key
    });
  }

  // Step 2: return in the caller's original order with group info
  // annotated onto each anchor. Preserves whatever order upstream
  // passed in (typical caller: auto anchors followed by manual).
  return anchors.map((a) => {
    const m = membership.get(a.id)!;
    return { ...a, ...m } as GroupedAnchor;
  });
}

/**
 * Add a new manual anchor, deciding what to do with overlapping old
 * manual anchors based on whether each old one is a "single word".
 *
 * User rule (2026-04-20 addendum):
 *   "If the new anchor overlaps an old one AND the old is a single
 *    word, delete the old (keep the new). Otherwise don't lose the
 *    user-composed old anchor."
 *
 * Single-word check uses `isSingleWord(text)` — typically the caller
 * passes `(t) => dictSet.has(t)` so anything the dictionary recognizes
 * as a lexical word ("土豆", "岁月静好", 成语s, cedict entries) counts.
 * Anchors NOT in the dictionary (hand-composed phrases like "呀土豆"
 * or "这个降维打击") are treated as "multi-word" and preserved even
 * when a new selection overlaps them; the new anchor is rejected in
 * that case so the user's composition stays intact.
 *
 * If `isSingleWord` is omitted (or always returns true), this degrades
 * to the original always-replace behavior, which is what existing
 * tests and v1 ParagraphCard relied on.
 *
 * Endpoint-touching is NOT an overlap: existing anchor with
 * end === newAnchor.start (or start === newAnchor.end) survives.
 */
export function applyOverlapReplace(
  existingManuals: readonly Anchor[],
  newAnchor: Anchor,
  isSingleWord: (text: string) => boolean = () => true
): Anchor[] {
  const overlapping = existingManuals.filter(
    (a) => !(a.end <= newAnchor.start || a.start >= newAnchor.end)
  );
  // If any overlapping old is NOT a single word, reject the new add
  // entirely — user's hand-composed phrase is preserved.
  const hasMultiWordOverlap = overlapping.some((a) => !isSingleWord(a.text));
  if (hasMultiWordOverlap) {
    return existingManuals.slice();
  }
  // All overlapping olds are single words → replace them with the new.
  const survivors = existingManuals.filter(
    (a) => a.end <= newAnchor.start || a.start >= newAnchor.end
  );
  return [...survivors, newAnchor];
}

/**
 * After the paragraph text changes, re-validate manual anchors:
 *   - If the anchor's [start,end] still matches its text exactly →
 *     keep with same offsets (no-op edit).
 *   - Otherwise try to relocate: search the new text for the anchor's
 *     text and snap to the first occurrence. If not found → drop.
 */
export function revalidateManualAnchors(
  paragraphText: string,
  anchors: readonly Anchor[]
): Anchor[] {
  const out: Anchor[] = [];
  for (const a of anchors) {
    if (a.auto) continue; // manual only here
    if (paragraphText.slice(a.start, a.end) === a.text) {
      out.push(a);
      continue;
    }
    const idx = paragraphText.indexOf(a.text);
    if (idx >= 0) {
      out.push({ ...a, start: idx, end: idx + a.text.length });
    }
    // else: the anchor's text no longer exists in the paragraph → drop.
  }
  return out;
}
