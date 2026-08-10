import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'trainer-marketplace.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  workers: 1,
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@vekira.test',
    },
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  projects: [
    {
      name: 'mobile-375',
      use: { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true },
    },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1024', use: { viewport: { width: 1024, height: 768 } } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
})
