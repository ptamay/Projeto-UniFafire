# Sprint 7 — Dívida de Estabilização (reconciliação ADR-002)

> Origem: tasks planejadas nas Sprints 4–6 originais do `plan.md` e não entregues
> (auditoria de 2026-07-02, ADR-002). Contém violações ativas de constitution —
> **executar ANTES da Sprint 8 (mobile)**. Fluxo TDD: red → green → refactor.
>
> ⚠️ Os números TASK-013–021 dos `tasks-sprint-4/5/6.md` reais são históricos e têm outro
> significado — não referenciar. Numeração canônica: `plan.md` (esta sprint: TASK-029–036).

**Capacidade:** 8 tasks · 15 pontos (limite: 10 tasks / 16 pts) ✓

---

## TASK-029: Estrutura de migrações UP/DOWN pareadas
- **Tipo:** Chore
- **Critério de Aceite (BDD):**
  - [ ] **Given** o diretório `db/migrations/`, **When** uma migração é criada, **Then** existem dois arquivos pareados pelo mesmo timestamp (UP e DOWN), e o DOWN restaura o estado EXATO anterior.
  - [ ] **Given** o script de aplicação de migrações, **When** executado, **Then** roda primeiro em uma CÓPIA do banco, valida, e só então aplica no banco real — com log de qual migração foi aplicada.
  - [ ] **Given** as migrações legadas soltas em `scripts/` (`add_*`, `migrate_*`), **When** a estrutura entra em vigor, **Then** o schema atual está documentado como migração baseline e os scripts legados são marcados como históricos (não executáveis em produção).
- **Isolamento de Tenant:** N/A — sistema single-tenant.
- **Referência spec.md:** §3 REQ-009
- **Referência plan.md:** Sprint 7 (ex-TASK-016); D-07; constitution §4
- **Estimativa:** M
- **Dependências:** nenhuma

## TASK-030: Imutabilidade do histórico no nível do banco
- **Tipo:** Feature
- **Critério de Aceite (BDD):**
  - [ ] **Given** triggers no SQLite sobre a tabela de histórico/transações, **When** qualquer UPDATE ou DELETE direto é tentado, **Then** a operação falha com erro explícito.
  - [ ] **Given** o fluxo ADMIN de limpeza (REQ-014), **When** executado pelo caminho autorizado, **Then** funciona via mecanismo de bypass explícito e documentado (ex.: flag de sessão de manutenção dentro da transação) — nunca desabilitando o trigger permanentemente.
  - [ ] **Given** os testes de integração, **When** a suíte roda, **Then** há teste vermelho→verde provando que UPDATE/DELETE direto falha e que o fluxo ADMIN continua operando.
- **Isolamento de Tenant:** N/A — sistema single-tenant.
- **Referência spec.md:** §3 REQ-005, REQ-014
- **Referência plan.md:** Sprint 7 (ex-TASK-018)
- **Estimativa:** M
- **Dependências:** TASK-029 (migração com DOWN pareado para criar os triggers)

## TASK-031: Trilha destrutiva do `clear-database` + threat model
- **Tipo:** Fix
- **Critério de Aceite (BDD):**
  - [ ] **Given** um ADMIN executando `POST /api/settings/clear-database`, **When** a operação inicia, **Then** um registro prévio (quem, quando, IP) é gravado em destino que **sobrevive à limpeza** (log estruturado em arquivo — TASK-033), ANTES de qualquer DELETE.
  - [ ] **Given** o mesmo endpoint, **When** a limpeza conclui, **Then** um registro de conclusão é gravado no mesmo destino persistente.
  - [ ] **Given** `DELETE /api/history/clear`, **When** executado, **Then** o registro em `action_logs` passa a ser gravado ANTES da deleção (hoje é depois).
  - [ ] **Given** o repositório, **When** a task conclui, **Then** `docs/threat_model_stride.md` existe documentando o modelo STRIDE do sistema, incluindo a exceção consciente do REQ-014 à imutabilidade do REQ-005.
- **Isolamento de Tenant:** N/A — sistema single-tenant.
- **Referência spec.md:** §3 REQ-014, REQ-010
- **Referência plan.md:** Sprint 7 (ex-TASK-013 parcial)
- **Estimativa:** M
- **Dependências:** TASK-033 (destino persistente do log)

## TASK-032: Verificação automática do backup diário
- **Tipo:** Feature
- **Critério de Aceite (BDD):**
  - [ ] **Given** a execução do backup diário, **When** conclui (sucesso ou falha), **Then** o resultado é registrado de forma estruturada e persistente (data, arquivo, tamanho, duração, status) — não apenas `console.log`.
  - [ ] **Given** os registros de backup, **When** um ADMIN consulta (via `/logs` ou `/settings`), **Then** a métrica "confiabilidade do backup" (% de dias com backup concluído — alvo 100%, spec §5) é visível.
  - [ ] **Given** um backup gerado, **When** a verificação automática roda, **Then** valida que o arquivo existe, tem tamanho > 0 e abre como SQLite válido.
- **Isolamento de Tenant:** N/A — sistema single-tenant.
- **Referência spec.md:** §3 REQ-009, §5 (confiabilidade do backup)
- **Referência plan.md:** Sprint 7 (ex-TASK-017)
- **Estimativa:** M
- **Dependências:** TASK-033 (log estruturado)

## TASK-033: Logger estruturado com máscara e severidades
- **Tipo:** Feature
- **Critério de Aceite (BDD):**
  - [ ] **Given** o novo módulo de log (`src/lib/`), **When** qualquer evento é logado, **Then** a saída é estruturada (JSON por linha, com timestamp, severidade debug|info|warn|error, contexto) e persiste em arquivo com rotação — além do console.
  - [ ] **Given** um payload contendo campos sensíveis (senha, hash, token, cookie de sessão), **When** logado, **Then** os valores aparecem mascarados — teste automatizado prova a máscara.
  - [ ] **Given** as rotas críticas (login, withdraw, confirm, return), **When** respondem, **Then** o tempo de resposta é registrado (base para o alvo p95 < 500ms do spec §6).
  - [ ] **Given** o `logAction` de auditoria existente (`logger.ts`), **When** o novo módulo entra, **Then** `logAction` é preservado (trilha de auditoria no banco é requisito próprio — REQ-010) e passa a também emitir pelo logger estruturado.
- **Isolamento de Tenant:** N/A — sistema single-tenant.
- **Referência spec.md:** §6 (latência), §3 REQ-010
- **Referência plan.md:** Sprint 7 (ex-TASK-019); constitution §7
- **Estimativa:** M
- **Dependências:** nenhuma

## TASK-034: Métricas de negócio no dashboard + threshold de atraso do spec
- **Tipo:** Feature
- **Critério de Aceite (BDD):**
  - [ ] **Given** um PORTEIRO+ no dashboard, **When** a tela carrega, **Then** exibe: taxa de dupla confirmação (% confirmadas em ≤ 10 min — alvo ≥ 95%) e tempo mediano de balcão (criação→confirmação — alvo ≤ 2 min), calculados da tabela `transactions`.
  - [ ] **Given** o alerta de chaves em atraso, **When** calculado, **Then** usa o threshold do spec (> 12h) em vez do 4h hardcoded atual — valor centralizado em constante/configuração, não repetido inline.
  - [ ] **Given** dados insuficientes (ex.: sem transações no período), **When** as métricas renderizam, **Then** exibem estado vazio claro, sem NaN/erro.
- **Isolamento de Tenant:** N/A — sistema single-tenant.
- **Referência spec.md:** §3 REQ-006, §5
- **Referência plan.md:** Sprint 7 (ex-TASK-020/021); ADR-002 (divergência 4h vs 12h)
- **Estimativa:** M
- **Dependências:** nenhuma

## TASK-035: Reativar os testes desativados da Sprint 1
- **Tipo:** Fix
- **Critério de Aceite (BDD):**
  - [ ] **Given** os 4 arquivos `src/lib/*.test.old` (`schemas`, `security-profile`, `session-expiration`, `session`), **When** a task conclui, **Then** todos voltam à suíte como `.test.ts`, adaptados à arquitetura atual (ex.: `session-edge.ts`), e passam.
  - [ ] **Given** a suíte completa, **When** `vitest run` executa, **Then** 100% verde — nenhum teste permanece desativado por renomeação no repositório.
  - [ ] **Given** um comportamento coberto por teste antigo que não existe mais, **When** identificado, **Then** o teste é removido com justificativa no commit (nunca silenciosamente renomeado).
- **Isolamento de Tenant:** N/A — sistema single-tenant.
- **Referência spec.md:** §3 REQ-015, REQ-011/012
- **Referência plan.md:** Sprint 7 (débito registrado no merge da Sprint 6)
- **Estimativa:** M
- **Dependências:** nenhuma

## TASK-036: Runbook de operação
- **Tipo:** Chore
- **Critério de Aceite (BDD):**
  - [ ] **Given** `docs/runbook.md`, **When** um operador segue os passos, **Then** consegue: iniciar/parar/reiniciar o sistema via PM2, localizar backups, e restaurar um backup do zero.
  - [ ] **Given** o procedimento de restauração, **When** documentado, **Then** foi executado ao menos uma vez em ambiente de teste, com evidência (data e resultado) registrada no próprio runbook.
  - [ ] **Given** o runbook, **When** lido, **Then** declara RPO 24h / RTO 4h e o responsável pela operação.
- **Isolamento de Tenant:** N/A — sistema single-tenant.
- **Referência spec.md:** §6 (DR)
- **Referência plan.md:** Sprint 7 (ex-TASK-022); constitution §4
- **Estimativa:** S
- **Dependências:** TASK-032 (verificação de backup dá a evidência de restauração)

---

## Gates da sprint
- **Gate de Migration (obrigatório):** TASK-029/030 tocam schema — todo UP com DOWN pareado pelo mesmo timestamp; DOWN faltando = BLOQUEADOR.
- **Suíte Vitest verde após cada task**; `npm audit` limpo no merge.
- **ESLint:** nenhum erro novo (débito pré-existente registrado no backlog — não ampliar).
- Ordem sugerida: TASK-033 → TASK-029 → TASK-030 → TASK-031 → TASK-032 → TASK-034 → TASK-035 → TASK-036.

## Backlog — Próxima Sprint
*(nenhuma task movida por limite de capacidade)*
