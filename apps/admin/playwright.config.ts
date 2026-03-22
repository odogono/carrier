import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const E2E_API_PORT = process.env.E2E_API_PORT ?? '16021';
const E2E_ADMIN_PORT = process.env.E2E_ADMIN_PORT ?? '5279';

const adminOrigin = `http://localhost:${E2E_ADMIN_PORT}`;
const apiHealthUrl = `http://localhost:${E2E_API_PORT}/health`;
const publicApiUrl = `http://localhost:${E2E_API_PORT}/api`;

const adminDir = __dirname;
const apiDir = path.join(__dirname, '..', 'api');

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  reporter: 'html',
  retries: process.env.CI ? 2 : 0,
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? adminOrigin,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry'
  },
  webServer: [
    {
      command: 'bun run dev',
      cwd: apiDir,
      env: {
        ...process.env,
        API_PORT: E2E_API_PORT,
        TRUSTED_ORIGINS: adminOrigin,
        // Do not use apps/api/.data/carrier.sqlite — isolate from dev data.
        API_DB_PATH: ':memory:'
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: apiHealthUrl
    },
    {
      command: `bun --env-file=dev.defaults.env ./index.html --port=${E2E_ADMIN_PORT}`,
      cwd: adminDir,
      env: {
        ...process.env,
        PUBLIC_API_URL: publicApiUrl
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: adminOrigin
    }
  ],
  workers: process.env.CI ? 1 : undefined
});
