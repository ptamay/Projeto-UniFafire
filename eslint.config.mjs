import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // TASK-081 (Sprint 22) — promessa solta é BLOQUEADOR, não estilo.
  //
  // 27 chamadas de `logAction` sem `await` sobreviveram a sprints inteiras. Não
  // havia como reparar: não há sintoma, o teste passa, o tipo está certo, e a
  // linha é visualmente idêntica a uma chamada síncrona. Em execução serverless
  // a instância congela quando a resposta sai e a escrita pendente morre com
  // ela — a trilha de auditoria some sem deixar nada para trás.
  //
  // Depender de alguém reparar é depender de alguém reparar 27 vezes seguidas.
  // Esta regra é a única coisa nesta task que impede o defeito de voltar; o
  // resto é conserto do que já aconteceu.
  //
  // Exige lint com informação de tipos (`projectService`), que é mais lento que
  // o lint sintático. O custo é aceitável: roda no pre-commit e nos gates, e o
  // `tsc --noEmit` do Gate 5 já paga esse preço de qualquer forma.
  //
  // ## Escopo: superfície de SERVIDOR
  //
  // A regra vale onde o risco existe. No servidor, a instância pode ser
  // destruída assim que a resposta sai, e uma promessa pendente morre com ela —
  // é o defeito desta task. No NAVEGADOR não há equivalente: a página continua
  // viva e a promessa liquida.
  //
  // Ligar a regra nos componentes de cliente acusou 25 pontos. Eles NÃO são este
  // defeito — são `fetch` em handler de evento sem tratamento de rejeição, cujo
  // sintoma é a tela não reagir quando a chamada falha. É problema real e está
  // registrado como débito no `plan.md`, mas a correção honesta ali é mostrar o
  // erro ao usuário, não calar o lint com `void` em 25 lugares. Task de UI,
  // não esta.
  //
  // Server Components (`page.tsx`) ENTRAM: rodam no servidor e correm o mesmo
  // risco dos handlers.
  {
    files: [
      "src/app/api/**/*.ts",
      "src/app/**/page.tsx",
      "src/lib/**/*.ts",
      "src/proxy.ts",
      "src/instrumentation.ts",
      // `db/*.mjs` fica de fora: não está no `tsconfig`, então o parser com
      // tipos não o alcança — e a justificativa da regra também não. São
      // ferramentas de linha de comando que rodam até terminar; não há
      // instância para congelar no meio.
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },

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
    ".gemini/**",
  ]),
]);

export default eslintConfig;
