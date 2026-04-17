/**
 * UI language store — toggles between Chinese (default) and English for
 * the main UI chrome. The corpus data itself (phrases, rhyme keys, source
 * labels) stays Chinese regardless, since that's what the tool is about.
 *
 * Usage in components:
 *   import { t, lang } from '$lib/stores/lang.svelte';
 *   <h1>{t('押韵灵感', 'Discover')}</h1>
 *   <button onclick={() => lang.toggle()}>...</button>
 *
 * `t(zh, en)` is preferred over a keyed dict because translations live
 * right next to the original text — easier to keep in sync as copy changes.
 */

type Lang = 'zh' | 'en';
const STORAGE_KEY = 'rhyme-finder.lang';

class LangStore {
  current = $state<Lang>('zh');

  constructor() {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'zh') this.current = stored;
    } catch {
      // ignore
    }
  }

  set(l: Lang) {
    this.current = l;
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    }
  }

  toggle() {
    this.set(this.current === 'zh' ? 'en' : 'zh');
  }
}

export const lang = new LangStore();

/** Translate inline: returns Chinese by default, English when toggled. */
export function t(zh: string, en: string): string {
  return lang.current === 'en' ? en : zh;
}
