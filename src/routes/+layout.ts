/**
 * Pre-render every route at build time. All pages in this app are
 * deterministic given their default state — no auth, no per-user data,
 * no remote API calls — so prerendering means each route gets its own
 * static HTML file (no 404-fallback hack needed for SPA routing on
 * GitHub Pages, and faster first paint).
 */
export const prerender = true;

/**
 * Always serve URLs with a trailing slash so GitHub Pages can resolve
 * BOTH `/discover` and `/discover/` to `discover/index.html`. Without
 * this, SvelteKit emits `discover.html` which only matches the
 * no-slash form and 404s on the slash form.
 */
export const trailingSlash = 'always';
