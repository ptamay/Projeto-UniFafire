import { defineConfig } from 'vitest/config';
import path from 'path';
import { TEST_DATABASE_URL } from './tests/pg-test-config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/e2e/**', '.claude/worktrees/**'],
    env: {
      // MOCK_DB_IN_MEMORY sustenta o que ainda nao migrou (decisao D4): durante a
      // TASK-069 os dois bancos convivem, por arquivo e nunca para a mesma
      // consulta. Sai junto com src/lib/db.ts, na ultima fatia.
      MOCK_DB_IN_MEMORY: 'true',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test_secret_32_characters_long_1234567890',
      APP_TIMEZONE: 'America/Recife',
      NODE_ENV: 'test'
    },
    // Aplica db/migrations-pg/ no container antes da suite (TASK-068).
    globalSetup: ['./tests/global-setup-pg.ts'],
    setupFiles: ['./tests/setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
