/**
 * Drafts store for the /write page.
 *
 * Persists a list of user drafts in localStorage. Each draft is a full
 * snapshot of editor content + scheme config. One draft is "current"
 * at any time — that's what the editor is bound to.
 *
 * Capped at MAX_DRAFTS; when full, the oldest (smallest updatedAt)
 * gets evicted on create. Auto-save is handled in the page (not here)
 * so the store stays a pure CRUD layer.
 */

import type { SchemeConfig } from '$lib/core/write/scheme';

export interface Draft {
  id: string;
  title: string;
  content: string;
  scheme: SchemeConfig;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'rhyme-finder.drafts.v1';
const MAX_DRAFTS = 20;

const DEFAULT_SCHEME: SchemeConfig = {
  type: 'free',
  depth: 2,
  toneMode: 'none'
};

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try { return crypto.randomUUID(); } catch { /* fallthrough */ }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Auto-generate a title from content — first 12 Chinese/English chars, or a fallback. */
function autoTitle(content: string): string {
  const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? '';
  const trimmed = firstLine.trim().slice(0, 12);
  return trimmed || '未命名草稿';
}

class DraftsStore {
  /** All drafts in no particular order (sorted at read time). */
  drafts = $state<Draft[]>([]);
  /** ID of the draft currently open in the editor. */
  currentId = $state<string | null>(null);

  constructor() {
    if (typeof localStorage === 'undefined') {
      // SSR: leave empty; the /write page will seed a first draft on mount.
      return;
    }
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
      // corrupt storage — start fresh
    }

    // If we loaded drafts but no current, pick the most recently updated.
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
      // storage full / disabled — fail silently
    }
  }

  /** Sorted view, newest-updated first. Derived so UI can iterate. */
  get sorted(): Draft[] {
    return [...this.drafts].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** The active draft, or null. */
  get current(): Draft | null {
    if (!this.currentId) return null;
    return this.drafts.find((d) => d.id === this.currentId) ?? null;
  }

  /** Create a new empty draft, switch to it, persist. */
  create(scheme: SchemeConfig = DEFAULT_SCHEME): Draft {
    const now = Date.now();
    const draft: Draft = {
      id: genId(),
      title: '未命名草稿',
      content: '',
      scheme,
      createdAt: now,
      updatedAt: now
    };
    let next = [...this.drafts, draft];
    if (next.length > MAX_DRAFTS) {
      // Evict oldest (by updatedAt), but never the one we just made.
      next = [...next].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_DRAFTS);
    }
    this.drafts = next;
    this.currentId = draft.id;
    this.persist();
    return draft;
  }

  /** Update the current draft's content / scheme / title. `patch` may include
   *  any subset. updatedAt is bumped automatically.
   *  Also auto-updates title if it's still the default and content changed. */
  update(id: string, patch: Partial<Pick<Draft, 'title' | 'content' | 'scheme'>>): void {
    const idx = this.drafts.findIndex((d) => d.id === id);
    if (idx < 0) return;
    const prev = this.drafts[idx];
    const titleWasAuto = prev.title === '未命名草稿' || prev.title === autoTitle(prev.content);
    const nextContent = patch.content ?? prev.content;
    const next: Draft = {
      ...prev,
      ...patch,
      // If title wasn't user-customized, re-derive it from the new content.
      title: patch.title ?? (titleWasAuto ? autoTitle(nextContent) : prev.title),
      updatedAt: Date.now()
    };
    const arr = [...this.drafts];
    arr[idx] = next;
    this.drafts = arr;
    this.persist();
  }

  /** Switch the currently active draft. */
  setCurrent(id: string): void {
    if (!this.drafts.find((d) => d.id === id)) return;
    this.currentId = id;
    this.persist();
  }

  /** Delete a draft. If it was current, switch to the newest remaining
   *  (or null if we're now empty). */
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

  /** Replace the whole in-memory state. Used by import/clear flows. */
  _reset(): void {
    this.drafts = [];
    this.currentId = null;
    this.persist();
  }
}

function isValidDraft(d: unknown): d is Draft {
  if (!d || typeof d !== 'object') return false;
  const x = d as Partial<Draft>;
  return (
    typeof x.id === 'string' &&
    typeof x.title === 'string' &&
    typeof x.content === 'string' &&
    typeof x.createdAt === 'number' &&
    typeof x.updatedAt === 'number' &&
    !!x.scheme &&
    typeof x.scheme.type === 'string' &&
    typeof x.scheme.depth === 'number' &&
    typeof x.scheme.toneMode === 'string'
  );
}

export const drafts = new DraftsStore();
