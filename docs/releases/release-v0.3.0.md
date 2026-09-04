# Release v0.3.0 — Correções Críticas Pré-Nuvem, Histórico Filtrável, Higiene Constitucional e Schema Postgres

**Data:** 2026-09-03
**Ambiente:** ainda não deployado — documento gerado antes do merge em `main` (Fase 11,
`sprint-governance.md`), conforme a regra "Release Governance obrigatório antes de merge em `main`".
**Versão anterior:** v0.2.0 (baseline `main` em `9a6e306`, 2026-07-10 — fim da Sprint 15)
**Escopo:** 42 commits · 56 arquivos · +3.793 / −235 · Sprints 16, 17, 18, 19 e 20 + o
Change Request Tipo D do ADR-012.

> **Por que cortar este release agora.** A Sprint 21 (Etapa 4 do ADR-012) converte a camada
> de dados inteira para Postgres assíncrono, e a partir dela a branch deixa de rodar sobre
> SQLite/PM2. Sem este corte, cinco sprints de correção — incluindo um defeito de fuso
> horário que exibia movimentações no dia errado — só chegariam ao usuário junto com a
> migração completa para a nuvem, várias sprints à frente. **Decisão do usuário em
> 2026-09-03.**

## Changelog

### Corrigido
- [TASK-053 → §2.5] **Lockout por conta, não por endereço de rede.** O limiar de 5 tentativas
  era aplicado igualmente à conta e ao IP. Em rede institucional todos os usuários saem pelo
  mesmo IP NAT — cinco erros de senha de pessoas diferentes trancavam o campus inteiro. O IP
  passa a ter limiar próprio e muito mais alto, contra varredura distribuída.
- [TASK-054 → §2.6] **Rate limit sai da memória do processo e vai para o banco**
  (tabela `rate_limit_hits`). Sob PM2 de instância única o `Map` em memória funcionava; em
  execução serverless cada cold start zeraria o contador e o limite efetivo viraria
  "30 × número de instâncias".
- [TASK-055 → REQ-010] **Fuso horário na trilha de auditoria.** Os filtros de dia, mês e hora
  comparavam o valor cru em UTC contra a hora exibida ao operador: movimentações entre 21h e
  a meia-noite local caíam no dia seguinte. Passam a usar faixa `[início, fim)` em UTC — que
  também é sargável. Normaliza as linhas de `history` gravadas no formato do
  `CURRENT_TIMESTAMP`, que o JavaScript lia como hora local e exibia 3h adiantadas. Exibição
  presa a `America/Recife` via `APP_TIMEZONE`.
- [TASK-058] **Erro de hidratação por render dependente do relógio.** O componente era
  renderizado no servidor e de novo na hidratação; onde a saída dependia do relógio, o React
  acusava "Hydration failed" e descartava a árvore vinda do servidor. Corrida por natureza:
  sumia quando SSR e hidratação caíam no mesmo segundo, o que fazia o erro parecer ruído.
- [TASK-059 → §4.1] **O Gate 2 de migrations passa a reprovar de fato.** `scripts/ci-gates.sh`
  procurava UPs em `supabase/migrations/` e `migrations/` — nenhum dos dois existe neste
  projeto, então o gate imprimia "Nenhuma migration encontrada — pulando" e passava sempre.
  Nunca reprovou nada desde que foi escrito.
- [TASK-061 → §2.6] **`Retry-After` nas respostas 429 e 423**, que a cláusula exige e a rota
  de login não enviava.

### Adicionado
- [TASK-056/057 → REQ-010] **Filtro por portador, chave e tipo de movimentação na trilha de
  auditoria, com paginação renderizada.** A tela só filtrava por data/mês/hora, deixando sem
  resposta "quem pegou a chave X?" e "o que o Fulano pegou?". O servidor já paginava
  (`LIMIT 50`), mas `currentPage`/`totalPages` chegavam como prop e nunca eram usados: o
  histórico ficava preso aos 50 registros mais recentes sem sinal de que havia mais.
  Consulta extraída para `src/lib/history-query.ts`.
- [TASK-060 → §8] **Perfil de ambiente `APP_ENV`.** A cláusula manda todo controle ler o
  perfil de `src/lib/security-profile.ts`; não havia uma ocorrência de `APP_ENV` no projeto e
  os controles usavam constantes fixas. Default seguro: ausência de `APP_ENV` = `production`.
- [ADR-012] **Schema Postgres completo no Supabase** (Sprint 20 · Etapa 3): baseline
  equivalente, índices mínimos, imutabilidade do histórico em PL/pgSQL e loader de carga com
  reconciliação de contagens. Ver "Schema / Migration" abaixo — **nada disso afeta a execução
  em SQLite/PM2 deste release.**

### Alterado
- [TASK-066] **Legado `employees` / `employee_id` descartado.** A tabela tinha 0 linhas e a
  coluna era NULL em 5/5 `keys` e 30/30 `history`, mas ainda era `LEFT JOIN`ada a cada
  consulta do histórico e havia um ramo de fallback na criação de transação que nenhuma
  chamada percorria. O portador de uma chave passa a ser `users.id`, ponto.
- [CR Tipo D · ADR-012] `constitution.md` §0, §1.3, §2.3, §2.5, §2.6, §4.3 e §7 reescritas;
  `spec.md` v2.0 com REQ-031 (operação fora do campus) e REQ-032 (sincronismo ≤ 500 ms);
  `plan.md` com as Sprints 19–24.

## Schema / Migration

**Duas migrations SQLite pendentes de aplicação no `keys.db` de produção:**

```
202609021700_rate_limit_hits          (TASK-054) — cria tabela + índice
202609021800_normalize_history_timestamps (TASK-055) — reescreve REPRESENTAÇÃO dos timestamps
```

A segunda foi validada em cópia do backup de 2026-07-06: 30/30 timestamps em ISO, triggers de
imutabilidade intactos, `integrity_check` ok. O runner (`db/migrate.mjs`) sempre executa
primeiro numa cópia e só toca o banco real se a cópia passar. **Ambas têm DOWN pareado.**

**`db/migrations-pg/` não é aplicado ao `keys.db`.** São as migrations Postgres da Etapa 3,
executadas contra o projeto Supabase e inertes para este deploy. O runner `db/migrate.mjs` não
as enxerga (diretório separado, justamente por isso).

**Nenhuma migration de DROP para `employees` / `employee_id`.** A TASK-066 removeu o código
que as usava, mas as colunas permanecem órfãs e inertes no `keys.db` até a Etapa 7 — um DROP
em SQLite é a única parte da migração que um `git revert` não desfaz, e o plano de reversão
do ADR-012 depende de o revert devolver um sistema funcional.

## Risco da Release

**Médio-baixo.** Nenhuma mudança de contrato nos quatro fluxos críticos (spec §4): login,
retirada, confirmação e devolução seguem idênticos.

| Área | Risco | Mitigação |
|---|---|---|
| Fuso horário (TASK-055) | A migration reescreve 30 linhas de `history`, tabela imutável por trigger | Bypass é o caminho autorizado do REQ-014, criado e removido dentro da própria migração; validado em cópia do backup |
| Lockout (TASK-053) | Afrouxa o limiar por IP | Limiar por conta permanece em 5/15 min; o que muda é só o IP compartilhado deixar de trancar terceiros |
| Rate limit em tabela (TASK-054) | Passa a escrever no banco a cada requisição de auth | Índice `(scope, identifier, hit_at)` criado junto; volume de ~19 usuários é irrelevante |
| Remoção de `employees` (TASK-066) | Consulta do histórico perde um JOIN | Verificado contra 131 linhas do banco de verificação: zero linhas ficam com portador não resolvido |

## Aceite do Cliente
N/A — uso interno, MODO EXPRESSO, cliente único (UniFAFIRE). Recomendado, antes do deploy:
que a portaria confirme na tela de histórico que as movimentações do fim da tarde aparecem no
dia correto — é a correção mais visível deste lote e a única com efeito retroativo sobre dados
já gravados.

## Débitos conhecidos (não bloqueantes)
- TASK-042 (REQ-026) segue sem teste dedicado.
- `keys.db` permanece nos commits antigos do histórico do git. **Não está mais rastreado**
  (verificado na TASK-062 com `git ls-files`); expurgá-lo do histórico exige reescrever
  história — decisão à parte, baixo risco: o banco não contém secret, apenas dados
  operacionais e hashes bcrypt.
- `docs/tasks-sprint-N.md` retomado nesta janela (Sprint 15 arquivada); Sprints 9–14 seguem
  sem arquivo próprio, com a fonte de verdade íntegra em `.sdd/memory/tasks.md` + git log.
- 540 warnings de lint vindos de diretórios de plugin (`impeccable/`, `.agents/skills/`) que
  o ESLint do projeto varre sem necessidade. Zero erros; nenhum em `src/`.

## Plano de Rollback
- **Trigger:** erro em produção nos fluxos críticos (spec §4), ou histórico exibindo data
  errada após a migration de timestamps.
- **Passos:**
  1. Reverter o merge em `main` (revert do PR) → novo deploy PM2 a partir de `9a6e306`
     (baseline v0.2.0).
  2. Rollback das migrations, na ordem inversa:
     `node db/migrate.mjs down 2` — desfaz `202609021800` e `202609021700`.
     ⚠️ O DOWN de `202609021800` restaura a **representação mista** dos timestamps, não um
     estado aproximado: o instante gravado nunca muda em nenhuma direção.
  3. Confirmar com a portaria que os 4 fluxos críticos e a tela de histórico voltaram ao
     comportamento anterior.
- **Tempo estimado:** < 15 min (instância única PM2; a migração de dados são 30 linhas).

## Auditoria de dependências — correção de registro

> ⚠️ **Este documento e os commits da Sprint 20 afirmaram "npm audit sem HIGH/CRITICAL".
> Estava errado.** A verificação usava um pipeline (`npm audit ... | grep ... | head`) cujo
> código de saída é o do `head`, não o do `npm audit` — o gate parecia verde sem nunca ter
> sido lido. Medido corretamente em 2026-09-03: **10 vulnerabilidades (8 high, 2 moderate),
> `npm audit` saindo com 1.** Os commits são história imutável e não foram reescritos; a
> correção fica registrada aqui.
>
> É a mesma classe de defeito da TASK-059 — um gate que não podia reprovar — desta vez na
> forma de invocação, não no script.

| Pacote | Severidade | Tratamento |
|---|---|---|
| `@humanfs/node`, `dompurify` | moderate | `npm audit fix` (sem quebra) |
| `brace-expansion`, `browserslist`, `fast-uri`, `js-yaml`, `nanoid`, `postcss`, `sharp` | high | `npm audit fix` (sem quebra) |
| `next` (9 advisories: SSRF em Server Actions, exposição não autenticada de Server Functions, cache confusion, DoS na Image Optimization) | high | **16.2.6 → 16.3.4**, fora do range declarado. Aprovado pelo usuário em 2026-09-03. Relevante além do gate: o ADR-012 expõe este app na internet pública, onde SSRF em Server Actions deixa de ser teórico. |

## Pendências antes do deploy real
- [x] Push da branch + abertura de PR contra `main` — [PR #14](https://github.com/ptamay/Projeto-UniFafire/pull/14).
- [ ] `npm audit` limpo (ver seção acima — em correção; **bloqueia o merge** por §6).
- [x] `./scripts/ci-gates.sh` verde localmente em 2026-09-03: 6 gates, 197 testes.
- [ ] **Aplicar `node db/migrate.mjs up` no `keys.db` de produção** — pendência herdada da
      Sprint 16, é o único passo de dados deste release.
- [ ] Backup do `keys.db` de produção imediatamente antes da migration (o runner testa em
      cópia, mas o backup é o que garante o passo 2 do rollback).
