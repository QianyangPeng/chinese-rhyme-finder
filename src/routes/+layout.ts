/**
 * Pre-render every route at build time. All pages in this app are
 * deterministic given their default state — no auth, no per-user data,
 * no remote API calls — so prerendering means each route gets its own
 * static HTML file (no 404-fallback hack needed for SPA routing on
 * GitHub Pages, and faster first paint).
 */
export const prerender = true;
