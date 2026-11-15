import path from 'node:path';
import { defineConfig } from 'vitest/config';

/** Fast tests that need nothing running: `npm test`. */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
