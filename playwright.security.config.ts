import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /security-production\.security\.ts/,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'chromium-security-production',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun x tsx tests/e2e/security-production-server.ts',
    url: 'http://127.0.0.1:4174/__security_e2e__/blank',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
