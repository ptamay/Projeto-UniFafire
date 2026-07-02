# Tasks - Sprint 3 (Rede de Testes)

## TASK-009: Setup Vitest e Banco Efêmero
- **Tipo:** Infraestrutura / QA
- **Critério de Aceite (BDD):**
  - **Given** o repositório configurado
  - **When** executamos `npm run test`
  - **Then** o Vitest deve inicializar um banco SQLite temporário em memória (ou arquivo isolado `test.db`) rodando as migrations de UP
  - **And** deve semear (seed) 1 usuário mock para cada papel (`ADMIN`, `GESTOR`, `PORTEIRO`, `FUNCIONARIO`, `ALUNO`) com senhas conhecidas
- **Isolamento de Tenant:** N/A (banco de testes efêmero).
- **Referência spec.md:** §REQ-015
- **Referência plan.md:** Sprint 3
- **Estimativa:** M
- **Dependências:** nenhuma

## TASK-010: Testes de Autenticação e Segurança (Auth API)
- **Tipo:** QA (Integration)
- **Critério de Aceite (BDD):**
  - **Given** o banco de testes com os usuários semeados
  - **When** testamos as rotas de login
  - **Then** o sistema deve retornar 200 (com cookie JWT) para credenciais corretas
  - **And** deve retornar 401 (Credenciais inválidas) para falhas (usuário inexistente ou senha incorreta)
  - **And** deve bloquear requisições com 423 (Locked) ou 429 (Rate Limit) após múltiplas tentativas falhas
- **Isolamento de Tenant:** N/A
- **Referência spec.md:** §REQ-015
- **Referência plan.md:** Sprint 3
- **Estimativa:** M
- **Dependências:** TASK-009

## TASK-011: Testes do Ciclo de Vida das Chaves
- **Tipo:** QA (Integration)
- **Critério de Aceite (BDD):**
  - **Given** um usuário logado e uma chave disponível
  - **When** ele solicita a chave (withdraw) e o porteiro aprova
  - **Then** a chave muda de status para `in_use`
  - **And** quando ele solicita a devolução e o porteiro aprova
  - **Then** a chave volta para `available` e o histórico é consolidado
- **Isolamento de Tenant:** N/A
- **Referência spec.md:** §REQ-015
- **Referência plan.md:** Sprint 3
- **Estimativa:** M
- **Dependências:** TASK-009

## TASK-012: Testes de Autorização (RBAC Matrix)
- **Tipo:** QA (Integration)
- **Critério de Aceite (BDD):**
  - **Given** diferentes usuários com papéis distintos (ALUNO vs ADMIN)
  - **When** um ALUNO tenta acessar endpoints administrativos (`/api/users`, `/api/settings`)
  - **Then** a API deve retornar estritamente 403 Forbidden ou 401 Unauthorized
  - **And** quando um ADMIN tenta o mesmo acesso, deve receber 200 OK
- **Isolamento de Tenant:** N/A
- **Referência spec.md:** §REQ-002, REQ-007, REQ-008, REQ-015
- **Referência plan.md:** Sprint 3
- **Estimativa:** S
- **Dependências:** TASK-009

---

## 📊 Regra de Capacidade de Sprint
- **Total de pontos:** 11 pontos (3x Medium + 1x Small)
- **Número de tasks:** 4 tasks
- **Status:** ✅ Dentro do limite para dev solo (máx. 16 pts / 10 tasks).
