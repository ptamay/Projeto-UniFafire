import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Utilitários fora da aplicação (débito registrado em plan.md §4 —
    // scripts CommonJS legados de migração/diagnóstico, não código de produção):
    "scripts/**",
    "scratch/**",
    "tmp/**",
    "patch.js",
    "**/*.test.old",
    // Worktrees git aninhadas (.claude/worktrees/*) são cópias de trabalho de
    // outras sessões/branches — não são código deste repositório e não devem
    // bloquear o pre-commit daqui (cada worktree lida com seu próprio lint).
    ".claude/worktrees/**",
    // Skill de terceiros do Claude Code, vendorizada por engano e duplicada em
    // tres lugares. Nao e codigo deste repositorio: sozinha respondia por 540
    // dos 541 warnings, afogando qualquer aviso real de src/ no pre-commit.
    "impeccable/**",
    ".agents/skills/impeccable/**",
    ".claude/skills/impeccable/**",
  ]),
]);

export default eslintConfig;
