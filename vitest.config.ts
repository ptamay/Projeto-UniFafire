import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/e2e/**', '.claude/worktrees/**'],
    env: {
      MOCK_DB_IN_MEMORY: 'true',
      JWT_SECRET: 'test_secret_32_characters_long_1234567890',
      NODE_ENV: 'test'
    },
    setupFiles: ['./tests/setup.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
