import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_DATABASE_URL, E2E_PORT } from './tests/e2e/e2e-db';

// TASK-028 (REQ-015/016) — smoke E2E dos fluxos críticos (spec §4) em DOIS
// viewports: desktop 1280×800 e mobile 375×812. Roda contra uma base Postgres
// efêmera e própria (tests/e2e/global-setup.ts, TASK-118) — nunca a da vitest.
// Execução serial: os fluxos mutam o estado da chave e cada ciclo completo
// (retirada → devolução) devolve o banco ao estado inicial para o próximo projeto.
//
// Pré-requisito: o Postgres de teste no ar (`npm run test:db:up`).
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
    baseURL: E2E_BASE_URL,
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
    command: `npm run dev -- -p ${E2E_PORT}`,
    url: E2E_BASE_URL,
    // Nunca reaproveitar: um dev server já no ar aponta para o `.env.local`, não
    // para a base E2E. Porta própria (3100) para não disputar com ele.
    reuseExistingServer: false,
    timeout: 180 * 1000,
    // Variável presente no ambiente vence o `.env.local` (@next/env não sobrescreve),
    // então o que está aqui é o que o servidor usa — mesmo no checkout de quem
    // tem `.env.local` apontando para outra base.
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      // Descartável, por execução: a suíte entra pela tela de login e nunca assina
      // sessão por fora. Nada a guardar.
      JWT_SECRET: randomBytes(48).toString('base64'),
      // §8: lockout e rate limit relaxados — a suíte faz dezenas de logins do mesmo IP.
      APP_ENV: 'dev',
      // Sem Realtime: um `.env.local` com as chaves do Supabase ligaria a E2E ao canal
      // de PRODUÇÃO. Vazias, o cliente cai no polling (TASK-073).
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    },
  },
});
