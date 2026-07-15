import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { defineConfig } from '@playwright/test';

const __dirname = import.meta.dirname;

const E2E_API_PORT = process.env.E2E_API_PORT ?? '16022';
const E2E_CLIENT_PORT = process.env.E2E_CLIENT_PORT ?? '5278';

const clientOrigin = `http://localhost:${E2E_CLIENT_PORT}`;
const apiHealthUrl = `http://localhost:${E2E_API_PORT}/health`;
const apiUrl = `http://localhost:${E2E_API_PORT}/api`;
const assetStorageRoot = mkdtempSync(
  path.join(tmpdir(), 'carrier-client-e2e-assets-')
);

process.once('exit', () => {
  rmSync(assetStorageRoot, { force: true, recursive: true });
});

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  reporter: 'html',
  retries: process.env.CI ? 2 : 0,
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? clientOrigin,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry'
  },
  webServer: [
    {
      command: 'bun run dev',
      cwd: path.join(__dirname, '..', 'api'),
      env: {
        ...process.env,
        API_ASSET_STORAGE_ROOT: assetStorageRoot,
        API_DB_PATH: ':memory:',
        API_PORT: E2E_API_PORT,
        TRUSTED_ORIGINS: clientOrigin
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: apiHealthUrl
    },
    {
      command: `bun ./index.html --port=${E2E_CLIENT_PORT}`,
      cwd: __dirname,
      env: {
        ...process.env,
        API_URL: apiUrl,
        NODE_ENV: 'production'
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: clientOrigin
    }
  ],
  workers: 1
});
