import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'marketing.spec.ts', workers: 1,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3091', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
  reporter: [['list']],
})
