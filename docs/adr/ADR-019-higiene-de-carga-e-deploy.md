# ADR-019 — 459 KB que ninguém pediu, e 1,4 MB que o deploy não precisa

- **Status:** Proposto — aguarda implementação pelo ciclo TDD
- **Data:** 2026-09-08
- **Tipo de Change Request:** C (mudança em features já implementadas)
- **Relacionado:** REQ-032 (restrição de volume) · ADR-012 · ADR-013 · TASK-079
- **Origem:** pedido de 2026-09-08 — dependências, otimização de uso, limpeza de arquivos

## Contexto

Levantamento feito com números, não por impressão.

### O maior item: 459 KB de PDF que quase ninguém usa

`src/app/history/HistoryClient.tsx` importa `jspdf` e `jspdf-autotable`
**estaticamente**. Como é componente de cliente, essas bibliotecas entram no *bundle*
da rota — e o `next build` as coloca num único chunk:

```
459 KB  .next/static/chunks/1h2wrf-eh1ao1.js     ← contém jsPDF
249 KB  ...
224 KB  ...
```

É o **maior chunk do aplicativo**, e desce para **todo mundo que abre `/history`**,
tenha ou não a intenção de exportar um PDF. Num celular na rede da instituição, é o
grosso da espera antes de a tela responder.

Isso não é só desconforto: o REQ-032 traz uma **restrição de volume** explícita — "a
solução não pode depender de volume de requisições incompatível com plano gratuito" —, e
banda é a mesma cota. O projeto já foi mordido por isso uma vez, quando o polling de 3 s
projetava ~10,5 mi de requisições/mês.

### Uma dependência morta e uma no lugar errado

| pacote | situação |
|---|---|
| `server-only` | declarada em `dependencies`, com **zero** importações no projeto |
| `@types/pg` | declarada em `dependencies`; é **tipo**, existe só em build |

`npm audit --omit=dev` acusa **0 vulnerabilidades**. Há pacotes desatualizados, quase
todos em *minor*/*patch* — e três *majors* (`typescript` 5→7, `eslint` 9→10, `vitest`
4→5) que **não** entram aqui: atualização de major é mudança de comportamento de
ferramenta e merece sua própria task, com a suíte como rede.

### Arquivos que descrevem um sistema que não existe mais

Débito já registrado no `plan.md` desde a TASK-079, nunca executado:

- **8 scripts em `scripts/`** que abrem `keys.db` com `better-sqlite3` —
  `add_active_column_to_users.js`, `add_ip_to_logs.js`, `add_settings_table.js`,
  `migrate_keys.js`, `migrate_keys_soft_delete.js`, `migrate-employees-soft-delete.js`,
  `migrate-to-user-system.js`, `reset-db.js`. O SQLite saiu do runtime na Sprint 21 e
  `keys.db` não existe. São **instruções que não funcionam esperando alguém tentar**.
- `scripts/replace_colors.js`, sem nenhuma referência.
- **`tests/forgot-password.test.ts`**, cujo corpo inteiro é:

  ```ts
  it('should validate the forgot password prompt existence conceptually', () => {
      expect(true).toBe(true); // Conceptual test for UI flow
  });
  ```

  Esse é **pior que ausente**: conta como um teste verde na suíte, aparece como
  "Forgot Password Flow (TASK-018)" no relatório, e não afirma nada sobre o sistema.
  Um teste que não pode falhar é ruído com aparência de cobertura.

### O deploy carrega 1,4 MB que não usa

Não existe `.vercelignore`. O repositório versionado tem ~4,1 MB, dos quais **~1,47 MB**
(≈35%) são coisas que o `next build` nunca lê:

| diretório | tamanho |
|---|---|
| `tests/` | 572 KB |
| `docs/` | 368 KB |
| `.sdd/` | 446 KB |
| `.agents/`, `.semgrep/`, `db/migrations/` | ~90 KB |

Verificado antes de propor: nenhum arquivo de `src/` lê qualquer um desses caminhos —
as únicas ocorrências são **texto de comentário e de tela**.

## Decisão

**1. `jspdf` e `jspdf-autotable` passam a carregar sob demanda**, com `await import()`
dentro do handler de exportação. Quem abre `/history` deixa de baixar 459 KB; quem clica
em "exportar" paga o download naquele instante, que é quando ele serve para alguma coisa.

O critério de aceite é **número**: o chunk que contém jsPDF não pode mais estar no grafo
de carregamento inicial de `/history`. Mesmo padrão do ADR-016 — "parece mais rápido" não
é critério.

**2. `server-only` sai. `@types/pg` vai para `devDependencies`.** As *majors* pendentes
ficam registradas e fora desta task.

**3. Os arquivos mortos saem**, com uma guarda: nenhum arquivo em `scripts/` pode
mencionar `better-sqlite3` ou `keys.db`. Sem a guarda, o próximo script legado nasce
igual — é a mesma razão da guarda de `page.tsx` do ADR-015.

**4. `.vercelignore` exclui do envio o que o build não lê.**

⚠️ **E ganha uma guarda que vale mais que o arquivo:** um teste que reprova se algum
caminho excluído passar a ser referenciado por `src/`. Excluir diretório do deploy é
seguro **hoje**; o dia em que alguém importar algo de `db/` num Server Component, o
`next build` local passa e a produção quebra — exatamente a classe de falha que a
TASK-093 acabou de produzir com a migration, e que o runbook §4.2 registrou.

## Alternativas consideradas

**Trocar `jspdf` por geração de PDF no servidor.** Tiraria os 459 KB do cliente de vez,
mas moveria custo de CPU para a função serverless, que também tem cota — e exigiria
reescrever a exportação inteira. Rejeitada: `await import()` custa uma linha e resolve o
problema que existe.

**Remover a exportação em PDF.** Ninguém pediu, e o histórico impresso tem uso real numa
portaria. Rejeitada.

**Atualizar tudo, inclusive as *majors*.** Rejeitada nesta task: `typescript` 5→7 e
`eslint` 9→10 mudam regras e diagnósticos, e misturá-los com limpeza de arquivos
tornaria impossível dizer o que quebrou o quê.

**Apagar `db/migrations/` (SQLite).** É o registro histórico do schema anterior, e o
Gate 2 varre esse diretório. Rejeitada: sai do **deploy** via `.vercelignore`, continua
no repositório. Mexer no `scripts/ci-gates.sh` é zona somente leitura e exige CR próprio.

## Consequências

**Positivas**
- `/history` deixa de baixar o maior chunk do app para quem só quer consultar.
- O deploy envia ~35% menos.
- A suíte deixa de contar um teste que não pode falhar.
- `scripts/` deixa de oferecer oito comandos que quebram na primeira linha.

**Negativas / riscos**
- Quem exporta PDF passa a esperar o download **no clique**. Precisa de indicação visual,
  senão o botão parece morto por um segundo em rede ruim.
- `.vercelignore` mal calibrado quebra o build **só em produção** — daí a guarda da
  decisão 4 ser obrigatória e não opcional.
- A contagem da suíte cai de 491 para 490. É melhora, não regressão, e fica dito aqui
  para não parecer perda numa leitura futura.

## Implementação

- **TASK-099** — `jspdf` sob demanda em `/history`, com o chunk conferido fora do
  carregamento inicial e indicação visual no clique.
- **TASK-100** — higiene: `server-only` fora, `@types/pg` para dev, os dez arquivos
  mortos removidos, `.vercelignore` criado, e as duas guardas (scripts sem SQLite;
  caminho excluído não referenciado por `src/`).
