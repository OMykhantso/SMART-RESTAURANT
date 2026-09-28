import { defineConfig, devices } from '@playwright/test';

/**
 * E2E-тести Web-клієнта. Потрібні запущені backend (:4000) і web (:5173): `npm run dev`.
 * Перший запуск: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'uk-UA',
    timezoneId: 'Europe/Kyiv',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
