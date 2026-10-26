import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

const hostedUrl = process.env.MP_BASE_URL;

export default defineConfig({
  ...base,
  testDir: 'tests/multiplayer',
  use: { ...base.use, baseURL: hostedUrl ?? 'http://127.0.0.1:4175' },
  webServer: hostedUrl
    ? undefined
    : {
        command: 'npm start',
        env: { PORT: '4175' },
        url: 'http://127.0.0.1:4175/healthz',
        reuseExistingServer: false,
        timeout: 30_000,
      },
});
