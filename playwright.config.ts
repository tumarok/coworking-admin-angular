import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env['CI'];
const MOCK_PORT = 4010;
const APP_PORT = 4173;
const viewport = { width: 1400, height: 900 };

/**
 * End-to-end suite: the production build, served statically with `/api` forwarded to the mock API,
 * in Chromium and Firefox. The mock keeps one database for everybody, so tests run one at a time
 * and each starts from a reset (see `e2e/fixtures.ts`).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-GB',
    timezoneId: 'Europe/Kyiv',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport },
    },
  ],
  webServer: [
    {
      command: 'npm run mock',
      // The mock answers 401 to a request without a token, which is as good as up.
      url: `http://localhost:${MOCK_PORT}/api/v1/auth/me`,
      env: { PORT: String(MOCK_PORT), MOCK_LATENCY_MS: '0', MOCK_LOG: '0' },
      reuseExistingServer: !CI,
      timeout: 30_000,
    },
    {
      // Builds first, so a fresh start always runs the code in the working tree. Locally a server
      // already on the port is reused (`reuseExistingServer`) and may serve an older build.
      command: 'npm run build && npx tsx e2e/support/serve-dist.ts',
      url: `http://localhost:${APP_PORT}`,
      env: { PORT: String(APP_PORT), API_PORT: String(MOCK_PORT) },
      reuseExistingServer: !CI,
      timeout: 180_000,
    },
  ],
});
