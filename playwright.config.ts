import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  outputDir: './.qa/test/results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  maxFailures: process.env.CI ? 1 : undefined,
  // Isolate WebGL contexts: concurrent GPU scenes can starve software renderers.
  workers: 1,
  // CI uses software WebGL across several screens per test. Keep individual
  // actions at 10s, but allow the complete journey and fixtures a larger budget.
  timeout: process.env.CI ? 90_000 : 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: '.qa/test/report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    launchOptions: process.env.CI
      ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
      : undefined,
  },
  projects: [
    {
      name: 'desktop',
      grepInvert: /@fallback|@interaction/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      grepInvert: /@fallback|@interaction/,
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'interaction',
      grep: /@interaction/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'no-webgl',
      grep: /@fallback/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--disable-webgl', '--disable-webgl2'] },
      },
    },
  ],
  webServer: {
    command: process.env.CI
      ? 'npm run preview -- --port 5173 --strictPort'
      : 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
