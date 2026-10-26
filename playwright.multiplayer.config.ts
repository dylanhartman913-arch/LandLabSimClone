import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

export default defineConfig({
  ...base,
  testDir: 'tests/multiplayer',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    command: 'npm start',
    env: { PORT: '4175' },
    url: 'http://127.0.0.1:4175/healthz',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
