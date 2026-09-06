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
      // MOCK_DB_IN_MEMORY saiu na TASK-080: seu unico leitor era
      // scripts/init-db.js, removido junto com o caminho admin/admin. O duplo
      // dialeto previsto na decisao D4 terminou na Sprint 21.
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test_secret_32_characters_long_1234567890',
      APP_TIMEZONE: 'America/Recife',
      NODE_ENV: 'test'
    },
    // Aplica db/migrations-pg/ no container antes da suite (TASK-068).
    globalSetup: ['./tests/global-setup-pg.ts'],
    // TASK-069 fatia (a): os arquivos passam a compartilhar um banco REAL, e o
    // seed de cada um faz TRUNCATE. Em paralelo, um arquivo apaga a semente do
    // outro no meio da execucao — falha que nao tem nada a ver com o codigo sob
    // teste. Serializar os ARQUIVOS e o preco do banco real; dentro de cada
    // arquivo os testes seguem em sequencia como sempre estiveram.
    fileParallelism: false,
    setupFiles: ['./tests/setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
