import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'mobile-landscape',
      testIgnore: /perf\.spec\.ts/,
      use: { ...devices['Pixel 7 landscape'], browserName: 'chromium' },
    },
    {
      // Measured alone (run with --workers=1 after the functional suite) so other tests do not steal CPU.
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      use: { ...devices['Pixel 7 landscape'], browserName: 'chromium' },
    },
  ],
});
