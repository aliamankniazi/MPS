import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Tests against a real (throwaway, local) database: `npm run test:integration`.
 * Start it first:
 *   docker compose --env-file .env.dev.local -f docker-compose.test.yml up -d --wait
 */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['tests/integration/**/*.int.test.ts'],
    environment: 'node',
    // One database is shared, so files run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
