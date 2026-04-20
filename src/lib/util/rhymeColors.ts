/**
 * Shared color palette for the /write page's rhyme groups.
 *
 * Each rhyme group (set of anchors whose last syllable rhymes) gets
 * one slot from this palette by index. Both the in-editor colored
 * box and the right-side candidate panel's header use the same slot
 * so that visually, "this color = this rhyme group".
 *
 * 10 entries — in practice we've seen < 5 distinct tails per paragraph
 * even in dense-rhyming lyrics, so collisions (same color cycling
 * back) are rare for v1.
 */

export interface RhymeColor {
  /** 2–4 char nickname for debugging / classname suffix. */
  readonly id: string;
  /** Solid border color (1.5px) for the anchor box in the editor. */
  readonly border: string;
  /** Translucent fill for the anchor box background (matches border hue). */
  readonly bg: string;
  /** Opaque color for badges / section headers in the candidate panel. */
  readonly accent: string;
}

export const RHYME_COLORS: readonly RhymeColor[] = [
  { id: 'blue',   border: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  accent: '#3b82f6' },
  { id: 'pink',   border: '#ec4899', bg: 'rgba(236,72,153,0.10)',  accent: '#ec4899' },
  { id: 'green',  border: '#22c55e', bg: 'rgba(34,197,94,0.10)',   accent: '#22c55e' },
  { id: 'amber',  border: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  accent: '#f59e0b' },
  { id: 'purple', border: '#a855f7', bg: 'rgba(168,85,247,0.10)',  accent: '#a855f7' },
  { id: 'teal',   border: '#14b8a6', bg: 'rgba(20,184,166,0.10)',  accent: '#14b8a6' },
  { id: 'rose',   border: '#f43f5e', bg: 'rgba(244,63,94,0.10)',   accent: '#f43f5e' },
  { id: 'indigo', border: '#6366f1', bg: 'rgba(99,102,241,0.10)',  accent: '#6366f1' },
  { id: 'lime',   border: '#84cc16', bg: 'rgba(132,204,22,0.10)',  accent: '#84cc16' },
  { id: 'orange', border: '#f97316', bg: 'rgba(249,115,22,0.10)',  accent: '#f97316' }
];

/** Cycle through the palette if there are more groups than colors. */
export function rhymeColor(colorIdx: number): RhymeColor {
  const n = RHYME_COLORS.length;
  const i = ((colorIdx % n) + n) % n;
  return RHYME_COLORS[i];
}
