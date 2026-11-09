import { defineConfig } from '@playwright/test';

// End-to-end tests load the built extension (.output/chrome-mv3) into headless Chromium.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
