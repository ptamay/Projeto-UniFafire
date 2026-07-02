# Tasks - Sprint 1 (Segurança de Sessão e Credenciais)

## TASK-001: JWT_SECRET persistente via .env
- **Tipo:** Feature
- **Critério de Aceite (BDD):**
  - **Given** o sistema está iniciando em produção
  - **When** a variável `JWT_SECRET` não está presente no `.env`
  - **Then** o sistema deve falhar explicitamente no boot e gerar log de erro
  - **And** um arquivo `.env.example` deve existir como referência
- **Isolamento de Tenant:** N/A — não acessa dados de tenant (sistema single-tenant).
- **Referência spec.md:** §REQ-011
- **Referência plan.md:** Sprint 1
- **Estimativa:** S
- **Dependências:** nenhuma

## TASK-002: Expiração de sessão e segurança de cookies
- **Tipo:** Feature
- **Critério de Aceite (BDD):**
  - **Given** um usuário realizando login com sucesso
  - **When** o cookie de sessão for gerado
  - **Then** deve ter as flags `httpOnly` e `sameSite` ativadas
  - **And** deve ter expiração absoluta de 7 dias e expiração idle de 24h
- **Isolamento de Tenant:** N/A — não acessa dados de tenant.
- **Referência spec.md:** §REQ-011
- **Referência plan.md:** Sprint 1
- **Estimativa:** S
- **Dependências:** TASK-001

## TASK-003: Política de senha forte (Zod)
- **Tipo:** Feature
- **Critério de Aceite (BDD):**
  - **Given** um usuário na tela de criação/troca de senha
  - **When** ele tenta enviar uma senha com menos de 8 caracteres
  - **Then** o schema do Zod deve rejeitar e mostrar mensagem de erro (falha na validação)
- **Isolamento de Tenant:** N/A — não acessa dados de tenant.
- **Referência spec.md:** §REQ-012
- **Referência plan.md:** Sprint 1
- **Estimativa:** S
- **Dependências:** nenhuma

## TASK-004: Lockout e Rate Limit em endpoints de auth
- **Tipo:** Feature
- **Critério de Aceite (BDD):**
  - **Given** um usuário tentando fazer login com credenciais incorretas sucessivamente
  - **When** ele atinge 5 tentativas falhas em menos de 15 minutos
  - **Then** a conta e o IP devem sofrer lockout (bloqueio temporário)
  - **And** as rotas `/api/auth/*` devem ter limite geral de 30 req/min (proteção de infra)
- **Isolamento de Tenant:** N/A — não acessa dados de tenant.
- **Referência spec.md:** §REQ-012
- **Referência plan.md:** Sprint 1
- **Estimativa:** M
- **Dependências:** nenhuma

## TASK-005: Padronização de mensagens de erro no Login
- **Tipo:** Refactor
- **Critério de Aceite (BDD):**
  - **Given** um usuário inserindo um username inexistente ou senha incorreta
  - **When** o endpoint de login processa a requisição e falha
  - **Then** a mensagem de retorno deve ser genérica ("Credenciais inválidas")
  - **And** o sistema não deve revelar se o usuário existe ou não no banco (evita enumeração)
- **Isolamento de Tenant:** N/A — não acessa dados de tenant.
- **Referência spec.md:** §REQ-001
- **Referência plan.md:** Sprint 1
- **Estimativa:** S
- **Dependências:** nenhuma

---

## 📊 Regra de Capacidade de Sprint
- **Total de pontos:** 6 pontos (4x Small + 1x Medium)
- **Número de tasks:** 5 tasks
- **Status:** ✅ Dentro do limite para dev solo (máx. 16 pts / 10 tasks).
