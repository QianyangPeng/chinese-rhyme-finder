/**
 * Favorites store — persists a set of cluster IDs in localStorage so
 * users can accumulate a personal "刻在心里的押韵" collection across
 * sessions. Lives in a .svelte.ts module so we can use Svelte 5 runes
 * for reactive access.
 *
 * A cluster's ID is `${scheme.id}::${patternKey}` (see discover/miner.ts),
 * which stays stable across lexicon rebuilds as long as the scheme
 * identity and pattern don't change.
 */

const STORAGE_KEY = 'rhyme-finder.favorites.v1';

/** Reactive Set of favorited cluster IDs. */
class FavoritesStore {
  ids = $state(new Set<string>());

  constructor() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.ids = new Set(parsed.filter((s): s is string => typeof s === 'string'));
        }
      }
    } catch {
      // ignore; start empty
    }
  }

  private persist() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.ids]));
    } catch {
      // storage may be full or disabled; fail silently
    }
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  toggle(id: string): boolean {
    const next = new Set(this.ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.ids = next;
    this.persist();
    return this.ids.has(id);
  }

  add(id: string): void {
    if (this.ids.has(id)) return;
    const next = new Set(this.ids);
    next.add(id);
    this.ids = next;
    this.persist();
  }

  remove(id: string): void {
    if (!this.ids.has(id)) return;
    const next = new Set(this.ids);
    next.delete(id);
    this.ids = next;
    this.persist();
  }

  clear(): void {
    this.ids = new Set();
    this.persist();
  }

  get size(): number {
    return this.ids.size;
  }
}

// Singleton — share one instance across all importers.
export const favorites = new FavoritesStore();
