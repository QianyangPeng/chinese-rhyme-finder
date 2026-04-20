/**
 * Drafts store (v2) for the /write page — paragraph + anchor model.
 *
 * Breaking change vs v1: schemes/depth/global toneMode are gone.
 * Each draft is a list of paragraphs; each paragraph has its own
 * text + anchors (auto-detected tail-word anchors + user-picked
 * selection anchors). Anchors carry their own per-item tone mode.
 *
 * v1 drafts are discarded on first load (new storage key).
 */

import type { Anchor } from '$lib/core/write/anchors';

export interface Paragraph {
  id: string;
  text: string;
  /** Manual (user-selected) anchors. Auto anchors are re-detected
   *  from `text` and merged in at render time — we don't persist them
   *  because they're a pure derivative of text. */
  manualAnchors: Anchor[];
}

export interface Draft {
  id: string;
  title: string;
  paragraphs: Paragraph[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'rhyme-finder.drafts.v2';
const MAX_DRAFTS = 20;

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try { return crypto.randomUUID(); } catch { /* fall */ }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function autoTitle(paragraphs: readonly Paragraph[]): string {
  for (const p of paragraphs) {
    const firstLine = p.text.split('\n').find((l) => l.trim()) ?? '';
    const trimmed = firstLine.trim().slice(0, 14);
    if (trimmed) return trimmed;
  }
  return '未命名草稿';
}

function emptyParagraph(): Paragraph {
  return { id: uid(), text: '', manualAnchors: [] };
}

class DraftsStore {
  drafts = $state<Draft[]>([]);
  currentId = $state<string | null>(null);

  constructor() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.drafts)) {
          this.drafts = parsed.drafts.filter(isValidDraft);
        }
        if (typeof parsed?.currentId === 'string') {
          this.currentId = parsed.currentId;
        }
      }
    } catch {
      // corrupt or v1 → start fresh
    }
    if (this.drafts.length > 0 && !this.drafts.find((d) => d.id === this.currentId)) {
      const sorted = [...this.drafts].sort((a, b) => b.updatedAt - a.updatedAt);
      this.currentId = sorted[0].id;
    }
  }

  private persist() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ drafts: this.drafts, currentId: this.currentId })
      );
    } catch {
      // storage full — fail silently
    }
  }

  get sorted(): Draft[] {
    return [...this.drafts].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get current(): Draft | null {
    if (!this.currentId) return null;
    return this.drafts.find((d) => d.id === this.currentId) ?? null;
  }

  create(): Draft {
    const now = Date.now();
    const draft: Draft = {
      id: uid(),
      title: '未命名草稿',
      paragraphs: [emptyParagraph()],
      createdAt: now,
      updatedAt: now
    };
    let next = [...this.drafts, draft];
    if (next.length > MAX_DRAFTS) {
      next = [...next].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_DRAFTS);
      if (!next.find((d) => d.id === draft.id)) next.push(draft);
    }
    this.drafts = next;
    this.currentId = draft.id;
    this.persist();
    return draft;
  }

  setCurrent(id: string): void {
    if (!this.drafts.find((d) => d.id === id)) return;
    this.currentId = id;
    this.persist();
  }

  remove(id: string): void {
    const remaining = this.drafts.filter((d) => d.id !== id);
    this.drafts = remaining;
    if (this.currentId === id) {
      this.currentId = remaining.length
        ? [...remaining].sort((a, b) => b.updatedAt - a.updatedAt)[0].id
        : null;
    }
    this.persist();
  }

  rename(id: string, title: string): void {
    const idx = this.drafts.findIndex((d) => d.id === id);
    if (idx < 0) return;
    const arr = [...this.drafts];
    arr[idx] = { ...arr[idx], title: title.trim() || '未命名草稿', updatedAt: Date.now() };
    this.drafts = arr;
    this.persist();
  }

  /** Update the paragraphs wholesale. Title auto-derives if it's still
   *  the default. */
  setParagraphs(id: string, paragraphs: Paragraph[]): void {
    const idx = this.drafts.findIndex((d) => d.id === id);
    if (idx < 0) return;
    const prev = this.drafts[idx];
    const wasAuto = prev.title === '未命名草稿' || prev.title === autoTitle(prev.paragraphs);
    const arr = [...this.drafts];
    arr[idx] = {
      ...prev,
      paragraphs,
      title: wasAuto ? autoTitle(paragraphs) : prev.title,
      updatedAt: Date.now()
    };
    this.drafts = arr;
    this.persist();
  }

  // ── Paragraph-level operations ────────────────────────────────
  addParagraph(draftId: string): string {
    const idx = this.drafts.findIndex((d) => d.id === draftId);
    if (idx < 0) return '';
    const p = emptyParagraph();
    const arr = [...this.drafts];
    arr[idx] = { ...arr[idx], paragraphs: [...arr[idx].paragraphs, p], updatedAt: Date.now() };
    this.drafts = arr;
    this.persist();
    return p.id;
  }

  removeParagraph(draftId: string, paragraphId: string): void {
    const idx = this.drafts.findIndex((d) => d.id === draftId);
    if (idx < 0) return;
    const d = this.drafts[idx];
    if (d.paragraphs.length <= 1) {
      // Last paragraph — just clear it rather than delete.
      this.updateParagraph(draftId, paragraphId, { text: '', manualAnchors: [] });
      return;
    }
    const arr = [...this.drafts];
    arr[idx] = {
      ...d,
      paragraphs: d.paragraphs.filter((p) => p.id !== paragraphId),
      updatedAt: Date.now()
    };
    this.drafts = arr;
    this.persist();
  }

  updateParagraph(
    draftId: string,
    paragraphId: string,
    patch: Partial<Pick<Paragraph, 'text' | 'manualAnchors'>>
  ): void {
    const idx = this.drafts.findIndex((d) => d.id === draftId);
    if (idx < 0) return;
    const d = this.drafts[idx];
    const pidx = d.paragraphs.findIndex((p) => p.id === paragraphId);
    if (pidx < 0) return;
    const newParagraphs = [...d.paragraphs];
    newParagraphs[pidx] = { ...newParagraphs[pidx], ...patch };
    const wasAuto = d.title === '未命名草稿' || d.title === autoTitle(d.paragraphs);
    const arr = [...this.drafts];
    arr[idx] = {
      ...d,
      paragraphs: newParagraphs,
      title: wasAuto ? autoTitle(newParagraphs) : d.title,
      updatedAt: Date.now()
    };
    this.drafts = arr;
    this.persist();
  }
}

function isValidDraft(d: unknown): d is Draft {
  if (!d || typeof d !== 'object') return false;
  const x = d as Partial<Draft>;
  return (
    typeof x.id === 'string' &&
    typeof x.title === 'string' &&
    Array.isArray(x.paragraphs) &&
    x.paragraphs.every(
      (p) => p && typeof p.id === 'string' && typeof p.text === 'string' && Array.isArray(p.manualAnchors)
    ) &&
    typeof x.createdAt === 'number' &&
    typeof x.updatedAt === 'number'
  );
}

export const drafts = new DraftsStore();
