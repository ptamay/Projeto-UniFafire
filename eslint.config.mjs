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
  ]),
  {
    rules: {
      // Débito registrado (plan.md §4): 33 ocorrências legadas de `any` em src/.
      // Rebaixado para warn até a sprint de higiene — NÃO introduzir novos.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
]);

export default eslintConfig;
