<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import ThemeToggle from './ThemeToggle.svelte';
  import LangToggle from './LangToggle.svelte';
  import { favorites } from '$lib/stores/favorites.svelte';
  import { t } from '$lib/stores/lang.svelte';

  // Static nav entries. `href` is relative to `$app/paths.base` (set by
  // svelte.config.js to '/chinese-rhyme-finder' in production).
  // `label` is a getter so it re-evaluates when lang toggles.
  const LINKS: ReadonlyArray<{ href: string; labelZh: string; labelEn: string; emoji: string }> = [
    { href: '/',         labelZh: '主页',     labelEn: 'Home',     emoji: '🏠' },
    { href: '/discover', labelZh: '押韵灵感', labelEn: 'Discover', emoji: '🔥' },
    { href: '/search',   labelZh: '找押韵',   labelEn: 'Search',   emoji: '🔍' },
    { href: '/analyze',  labelZh: '歌词分析', labelEn: 'Analyze',  emoji: '📖' }
  ];

  /** Current pathname without the GitHub Pages base prefix. */
  const currentPath = $derived(
    $page.url.pathname.replace(base, '') || '/'
  );

  function isActive(href: string): boolean {
    if (href === '/') return currentPath === '/';
    return currentPath === href || currentPath === href + '/';
  }
</script>

<nav class="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
  <div class="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-3">
    <a
      href="{base}/"
      class="text-sm font-bold tracking-tight text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
    >
      {t('押韵集', 'Chinese Rhymes')}
    </a>
    <ul class="flex flex-wrap items-center gap-1 text-xs">
      {#each LINKS as link (link.href)}
        <li>
          <a
            href="{base}{link.href}"
            class="rounded px-2.5 py-1.5 transition {isActive(link.href)
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'}"
          >
            <span aria-hidden="true">{link.emoji}</span>
            <span class="ml-1">{t(link.labelZh, link.labelEn)}</span>
          </a>
        </li>
      {/each}
      {#if favorites.size > 0}
        <li>
          <a
            href="{base}/discover/?lens=saved"
            class="flex items-center gap-1 rounded px-2 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50"
            title={t('我的收藏', 'My favorites')}
          >
            <span>❤️</span>
            <span class="font-mono text-[11px]">{favorites.size}</span>
          </a>
        </li>
      {/if}
      <li class="ml-1 hidden sm:block">
        <a
          href="https://github.com/QianyangPeng/chinese-rhyme-finder"
          class="rounded px-2.5 py-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          target="_blank"
          rel="noopener"
          aria-label="GitHub"
        >
          GitHub
        </a>
      </li>
      <li>
        <LangToggle />
      </li>
      <li>
        <ThemeToggle />
      </li>
    </ul>
  </div>
</nav>
