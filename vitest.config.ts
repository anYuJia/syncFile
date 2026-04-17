import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts', 'src/renderer/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  }
});
