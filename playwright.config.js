import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Galaxy Tab S9'],
    browserName: 'chromium',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  webServer: {
    command: 'python3 -m http.server 4173 --directory docs',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
});
