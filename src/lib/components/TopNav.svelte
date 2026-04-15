<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import ThemeToggle from './ThemeToggle.svelte';
  import { favorites } from '$lib/stores/favorites.svelte';

  // Static nav entries. `href` is relative to `$app/paths.base` (set by
  // svelte.config.js to '/chinese-rhyme-finder' in production).
  const LINKS: ReadonlyArray<{ href: string; label: string; emoji: string }> = [
    { href: '/',         label: '主页',     emoji: '🏠' },
    { href: '/discover', label: 'Discover', emoji: '🔥' },
    { href: '/search',   label: 'Search',   emoji: '🔍' },
    { href: '/analyze',  label: 'Analyze',  emoji: '📖' }
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
      class="font-mono text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
    >
      chinese-rhyme-finder
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
            <span class="ml-1">{link.label}</span>
          </a>
        </li>
      {/each}
      {#if favorites.size > 0}
        <li>
          <a
            href="{base}/discover/?lens=saved"
            class="flex items-center gap-1 rounded px-2 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50"
            title="我的收藏"
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
        <ThemeToggle />
      </li>
    </ul>
  </div>
</nav>
