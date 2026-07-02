# Tasks - Sprint 2 (Identidade de Sessão e Conta)

## TASK-006: Identidade de sessão no shell (UI)
- **Tipo:** Feature
- **Critério de Aceite (BDD):**
  - **Given** um usuário logado acessando qualquer página do sistema
  - **When** a interface carregar o layout base (shell)
  - **Then** o nome e o papel do usuário (role) devem estar visíveis
  - **And** deve haver um menu de usuário disponível, conforme estruturado em `ui-context.md`
- **Isolamento de Tenant:** N/A — não acessa dados de tenant (sistema single-tenant).
- **Referência spec.md:** §REQ-013
- **Referência plan.md:** Sprint 2
- **Estimativa:** S
- **Dependências:** nenhuma

## TASK-007: Edição de dados próprios (Perfil)
- **Tipo:** Feature
- **Critério de Aceite (BDD):**
  - **Given** um usuário logado acessando a rota `/account/profile`
  - **When** ele altera seu próprio nome ou dados de contato e salva
  - **Then** os dados devem ser atualizados no banco (restringindo estritamente ao seu ID)
  - **And** uma mensagem de confirmação de sucesso ("toast") deve aparecer
- **Isolamento de Tenant:** N/A — não acessa dados de tenant (sistema single-tenant). Validação de autorização garante edição apenas do próprio usuário.
- **Referência spec.md:** §REQ-013
- **Referência plan.md:** Sprint 2
- **Estimativa:** S
- **Dependências:** TASK-006

## TASK-008: Troca de senha e revogação de sessões (Security)
- **Tipo:** Feature
- **Critério de Aceite (BDD):**
  - **Given** um usuário logado acessando a rota `/account/security`
  - **When** ele altera sua senha com sucesso (informando senha antiga e nova senha)
  - **Then** a senha deve ser atualizada de forma segura (via bcrypt)
  - **And** o sistema deve forçar o "logout everywhere" (invalidar tokens/cookies ativos para impedir sessões simultâneas antigas)
- **Isolamento de Tenant:** N/A — não acessa dados de tenant (sistema single-tenant).
- **Referência spec.md:** §REQ-013
- **Referência plan.md:** Sprint 2
- **Estimativa:** M
- **Dependências:** TASK-006, TASK-003 (da Sprint 1)

---

## 📊 Regra de Capacidade de Sprint
- **Total de pontos:** 4 pontos (2x Small + 1x Medium)
- **Número de tasks:** 3 tasks
- **Status:** ✅ Dentro do limite para dev solo (máx. 16 pts / 10 tasks).
