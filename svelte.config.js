import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.env.NODE_ENV !== 'production';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      // GitHub Pages serves 404.html for any unknown path; pointing the
      // SvelteKit fallback at it lets the SPA take over and handle the
      // route client-side. We also copy 404.html → index.html in package
      // scripts so the homepage works as plain index.
      fallback: '404.html',
      precompress: false,
      strict: true
    }),
    paths: {
      // GitHub Pages serves at /<repo-name>/ ; dev serves at root
      base: dev ? '' : '/chinese-rhyme-finder'
    }
  }
};

export default config;
