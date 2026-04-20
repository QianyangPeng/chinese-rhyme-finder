/**
 * Main-thread wrapper around the search worker.
 *
 * Owns the single Worker instance, routes search requests by incrementing
 * ID, exposes reactive state via Svelte 5 runes so pages can `$effect`
 * on `isReady` / `phrasesLoaded` / etc.
 *
 * Search API:
 *   const result = await client.search({ target, toneMode, ... });
 *
 * Main-thread code never touches the 800k-phrase lexicon directly. All
 * of it lives in the worker. Messages are structured-cloned — cheap
 * because only the trimmed `GroupedSearchResult` comes back per query.
 */

import type {
  GroupedSearchResult,
  IncomingMessage,
  WorkerMessage
} from './search.worker';

interface SearchOpts {
  target: string[];
  targetTones?: number[];
  excludeText?: string;
  toneMode: 'none' | 'exact';
  requireTailMatch: boolean;
  windowMode: 'tail' | 'anywhere';
  enabledSources?: string[];
}

type Pending = {
  resolve: (r: GroupedSearchResult) => void;
  reject: (err: Error) => void;
};

class SearchClient {
  // Reactive state — pages use these in $effect / $derived.
  isReady = $state(false);
  phrasesLoaded = $state(0);
  lastProgressSource = $state<string | null>(null);

  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private initPromise: Promise<void> | null = null;

  /** Called once from the Search page's onMount with the correct base
   *  URL (e.g. "/chinese-rhyme-finder" in prod). */
  init(baseUrl: string): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (typeof Worker === 'undefined') {
      // SSR / old environment — degrade gracefully.
      this.initPromise = Promise.resolve();
      return this.initPromise;
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      try {
        // Vite's worker import: `?worker&module` gives an ES-module worker.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        import('./search.worker?worker').then((mod) => {
          const WorkerCtor = mod.default as new () => Worker;
          this.worker = new WorkerCtor();
          this.worker.onmessage = (ev: MessageEvent<WorkerMessage>) => this.handleMessage(ev.data);
          this.worker.onerror = (err) => {
            console.error('[search.worker]', err);
          };
          const init: IncomingMessage = { type: 'init', baseUrl };
          this.worker.postMessage(init);
          resolve();
        }).catch(reject);
      } catch (err) {
        reject(err);
      }
    });
    return this.initPromise;
  }

  private handleMessage(msg: WorkerMessage) {
    switch (msg.type) {
      case 'progress':
        this.phrasesLoaded = msg.phrasesLoaded;
        this.lastProgressSource = msg.sourceLoaded;
        break;
      case 'ready':
        this.phrasesLoaded = msg.totalPhrases;
        this.isReady = true;
        break;
      case 'result': {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          p.resolve(msg.result);
        }
        break;
      }
      case 'error': {
        if (msg.id !== undefined) {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            p.reject(new Error(msg.message));
          }
        } else {
          console.error('[search.worker]', msg.message);
        }
        break;
      }
    }
  }

  search(opts: SearchOpts): Promise<GroupedSearchResult> {
    if (!this.worker) {
      return Promise.reject(new Error('worker not initialized'));
    }
    const id = this.nextId++;
    return new Promise<GroupedSearchResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg: IncomingMessage = {
        type: 'search',
        id,
        target: opts.target,
        targetTones: opts.targetTones,
        excludeText: opts.excludeText,
        toneMode: opts.toneMode,
        requireTailMatch: opts.requireTailMatch,
        windowMode: opts.windowMode,
        enabledSources: opts.enabledSources
      };
      this.worker!.postMessage(msg);
    });
  }
}

export const searchClient = new SearchClient();
export type { GroupedSearchResult, LevelGroups, TailGroup, GroupHit } from './search.worker';
