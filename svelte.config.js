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
      fallback: 'index.html', // SPA mode (client-side routing)
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
