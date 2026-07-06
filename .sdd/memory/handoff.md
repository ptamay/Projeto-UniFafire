# handoff.md — Resumo de Escopo para Fase 6 (Opus)

> Gerado ao final da Fase 5 pelo Antigravity. Contexto de entrada para o Claude Opus.
> Sistema baseado num legado ("vibecodado") sendo estruturado no Constitutional SDD.

## Projeto
- **Nome:** Sistema de Gerenciamento de Chaves (UniFafire)
- **Tipo:** Sistema interno (intranet / gestão de ativos)
- **Modo:** EXPRESSO
- **Multi-tenant:** não (cliente único)

## Entidades Principais (Fase 1)
1. User (Usuários do sistema com roles definidas)
2. Key (As chaves sendo emprestadas)
3. Transaction (Histórico de retiradas e devoluções)
4. Setting (Configurações do sistema)

## Perfis e RBAC (Fase 2)
| Perfil | Permissões-chave | Super Admin? |
|--------|-----------------|-------------|
| ADMIN | Acesso total, gerencia chaves, usuários, ver logs. | sim |
| GESTOR | Igual ao admin, mas sem acesso aos logs. | não |
| PORTEIRO | Gerencia chaves (opera entrega) e histórico. | não |
| FUNCIONARIO | Confirma a transação. | não |
| ALUNO | Confirma a transação. | não |

## Restrições Não-Funcionais (Fase 1)
- SLA/uptime exigido: Uso interno em horário letivo.
- Latência máxima aceitável: Baixa (rede local).
- Modo offline necessário: não (roda localmente).

## Decisões de Segurança (Fase 3)
- Modelo de isolamento: N/A (cliente único).
- Compliance: LGPD básica (proteção de senhas com bcrypt).
- RPO: 24 horas (Backup diário SQLite).
- RTO: 4 horas.
- Secrets manager: Local (.env padrão do Node).

## Integrações Externas (Fase 3)
Nenhuma.

## Identidade Visual (Fase 4.0)
- ui-context.md: presente (extraído do CSS legado).
- Paleta primária: Azul Profundo (#060e2a) + Verde Vibrante (#1D8046).
- Layout shell: Sidebar com suporte a collapse (260px/70px).

## Rotas Críticas MVP (Fase 4)
- `/login` (Autenticação)
- `/` (Dashboard)
- `/keys` (Gestão de Chaves)
- `/users` (Gestão de Usuários)
- `/history` (Histórico de Transações)
- `/confirm` (Confirmação de transação pelo Func/Aluno)
- `/settings` e `/logs` (Configuração e Auditoria)

## Infraestrutura Aprovada (Fase 5)
- Frontend e Backend: Next.js (App Router)
- Banco de Dados: SQLite (via better-sqlite3)
- CI/CD / Hospedagem: PM2 em Servidor Local Interno
- Observabilidade sugerida: Sentry (Erros) e Logs Locais.

## Pontos de Atenção para o Opus
O sistema foi construído de forma ad-hoc ("vibecodado") anteriormente. A Triad (Constitution, Spec, Plan) deve focar em documentar o estado *atual* como linha de base (baseline), criando regras rígidas de segurança (strict_rules) e refatoração arquitetural (se necessário) para estabilizar o sistema antes de introduzir novas features.
