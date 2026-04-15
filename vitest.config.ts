import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['**/*.test.ts', '**/types.ts', '**/index.ts']
    }
  }
});
