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
  // 15 hues spaced along the color wheel so consecutive rhyme groups
  // are visually distinct. Cycling after 15 is rare (only very dense
  // polyrhyming lyrics would hit it).
  { id: 'blue',    border: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  accent: '#3b82f6' },
  { id: 'orange',  border: '#f97316', bg: 'rgba(249,115,22,0.10)',  accent: '#f97316' },
  { id: 'green',   border: '#22c55e', bg: 'rgba(34,197,94,0.10)',   accent: '#22c55e' },
  { id: 'pink',    border: '#ec4899', bg: 'rgba(236,72,153,0.10)',  accent: '#ec4899' },
  { id: 'cyan',    border: '#06b6d4', bg: 'rgba(6,182,212,0.10)',   accent: '#06b6d4' },
  { id: 'amber',   border: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  accent: '#f59e0b' },
  { id: 'violet',  border: '#8b5cf6', bg: 'rgba(139,92,246,0.10)',  accent: '#8b5cf6' },
  { id: 'rose',    border: '#f43f5e', bg: 'rgba(244,63,94,0.10)',   accent: '#f43f5e' },
  { id: 'teal',    border: '#14b8a6', bg: 'rgba(20,184,166,0.10)',  accent: '#14b8a6' },
  { id: 'red',     border: '#ef4444', bg: 'rgba(239,68,68,0.10)',   accent: '#ef4444' },
  { id: 'lime',    border: '#65a30d', bg: 'rgba(101,163,13,0.10)',  accent: '#65a30d' },
  { id: 'fuchsia', border: '#d946ef', bg: 'rgba(217,70,239,0.10)',  accent: '#d946ef' },
  { id: 'sky',     border: '#0ea5e9', bg: 'rgba(14,165,233,0.10)',  accent: '#0ea5e9' },
  { id: 'yellow',  border: '#ca8a04', bg: 'rgba(202,138,4,0.10)',   accent: '#ca8a04' },
  { id: 'emerald', border: '#059669', bg: 'rgba(5,150,105,0.10)',   accent: '#059669' }
];

/** Cycle through the palette if there are more groups than colors. */
export function rhymeColor(colorIdx: number): RhymeColor {
  const n = RHYME_COLORS.length;
  const i = ((colorIdx % n) + n) % n;
  return RHYME_COLORS[i];
}
