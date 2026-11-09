import { defineConfig } from '@playwright/test';

// Smoke test on real public sites (needs internet): `npm run real-sites`.
export default defineConfig({ testDir: 'tests/real', timeout: 60_000, workers: 1, reporter: [['list']] });
