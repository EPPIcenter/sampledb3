import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const e2eDatabasePath = path.join(repoRoot, 'sampledb_e2e.sqlite');

const isCi = !!process.env.CI;
const useAllBrowsers = process.env.PLAYWRIGHT_BROWSERS === 'all';

/** Fresh DB so global-setup seed matches E2E_ADMIN_* credentials (CI always; local opt-in via E2E_FRESH_DB=1) */
const wantFreshDb = isCi || process.env.E2E_FRESH_DB === '1';
const webServerCommand = wantFreshDb
  ? `rm -f "${e2eDatabasePath}" && bun --filter @sampledb/api --filter @sampledb/web --parallel dev`
  : `bun --filter @sampledb/api --filter @sampledb/web --parallel dev`;

export default defineConfig({
  testDir: './tests',
  globalSetup: path.join(__dirname, 'global-setup.ts'),
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: isCi ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    /** Set `E2E_SCREENSHOTS=0` to skip (faster local runs). Otherwise captures after each test. */
    screenshot: process.env.E2E_SCREENSHOTS === '0' ? 'off' : 'on',
  },
  projects:
    useAllBrowsers && !isCi
      ? [
          { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    cwd: repoRoot,
    command: webServerCommand,
    env: {
      ...process.env,
      DATABASE_PATH: e2eDatabasePath,
    },
    url: 'http://localhost:5173',
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
});
