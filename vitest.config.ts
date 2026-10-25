import { defineConfig } from 'vitest/config';

// Timing budgets run as their own project, after every other file, so long bot simulations don't
// compete with them for CPU (they did once the LL-51 household sweep joined the suite).
const PERF = 'packages/engine/test/performance.test.ts';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    setupFiles: ['tests/unit/yield.ts'],
    projects: [
      { extends: true, test: { name: 'unit', include: ['packages/*/test/**/*.test.ts', 'apps/web/src/**/*.test.ts'], exclude: [PERF, '**/node_modules/**'], sequence: { groupOrder: 0 } } },
      { extends: true, test: { name: 'performance', include: [PERF], sequence: { groupOrder: 1 } } },
    ],
  },
});
