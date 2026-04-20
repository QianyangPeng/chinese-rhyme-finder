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
export function assignRhymeGroups(anchors: readonly Anchor[]): GroupedAnchor[] {
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
  let nextColorIdx = 0;
  const membership = new Map<string, { groupId: string; colorIdx: number; showsPanel: boolean }>();

  for (const a of sorted) {
    const key = rhymeGroupKey(a.text);
    let g = byKey.get(key);
    if (!g) {
      g = { id: `g${nextColorIdx}`, colorIdx: nextColorIdx, firstAutoId: null };
      byKey.set(key, g);
      nextColorIdx++;
    }

    let showsPanel: boolean;
    if (!a.auto) {
      showsPanel = true; // manual always shows
    } else if (g.firstAutoId === null) {
      g.firstAutoId = a.id;
      showsPanel = true; // first auto in group shows
    } else {
      showsPanel = false; // later auto in same group: highlight-only
    }

    membership.set(a.id, { groupId: g.id, colorIdx: g.colorIdx, showsPanel });
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
