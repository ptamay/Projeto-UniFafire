import { defineConfig, devices } from '@playwright/test';

// TASK-028 (REQ-015/016) — smoke E2E dos fluxos críticos (spec §4) em DOIS
// viewports: desktop 1280×800 e mobile 375×812. Roda contra um banco efêmero
// seedado (tests/e2e/global-setup.ts) — nunca o keys.db real.
// Execução serial: os fluxos mutam o estado da chave e cada ciclo completo
// (retirada → devolução) devolve o banco ao estado inicial para o próximo projeto.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 180 * 1000,
    env: {
      DB_PATH: 'e2e-test.db',
      BACKUPS_DIR: 'e2e-backups',
      LOG_DIR: 'e2e-logs',
    },
  },
});
