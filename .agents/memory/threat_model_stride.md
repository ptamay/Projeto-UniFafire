# Threat Model STRIDE - Sistema de Gerenciamento de Chaves (UniFafire)

## 1. Escopo e Cenário
**Sistema:** Gerenciador de Chaves
**Ambiente:** Hospedado localmente (intranet) via PM2 e SQLite.
**Público:** Porteiros, Funcionários, Alunos e Gestores da UniFafire.

## 2. Ameaças (STRIDE) e Mitigações

| Ameaça | Descrição / Vetor de Risco | Plano de Mitigação |
|---|---|---|
| **S**poofing (Falsidade Ideológica) | Um usuário se passar por outro para retirar uma chave. | Fluxo de dupla confirmação no balcão e login obrigatório para o Porteiro. |
| **T**ampering (Violação de Dados) | Alteração direta no banco `keys.db` (ex: apagar histórico). | Acesso ao servidor PM2/arquivos restrito aos sysadmins. Sistema não permite exclusão de histórico de transações via interface. |
| **R**epudiation (Repúdio) | Um aluno ou funcionário negar que pegou uma chave. | Logs de auditoria não editáveis e transação registrada com timestamps precisos no SQLite. |
| **I**nformation Disclosure | Vazamento de senhas ou logs do sistema. | Senhas protegidas via `bcrypt`. Sessão baseada em JWT seguro (`jose`). Acesso aos logs restrito à role `ADMIN`. |
| **D**enial of Service (Negação de Serviço) | Sobrecarga no Next.js Server. | Como é de uso interno e local, o risco de DoS intencional externo é próximo de zero. |
| **E**levation of Privilege | Um porteiro escalar privilégios para Administrador para mudar políticas. | Validação forte de roles no nível da API e RBAC centralizado em `ROLE_PERMISSIONS` (em `schemas.ts`). |

## 3. Classificação
- **Dados Sensíveis:** Não possui dados sensíveis regulados de terceiros (sem financeiro, jurídico).
- **RPO Recomendado:** 24h (backup diário do arquivo SQLite `keys.db`).
- **RTO Recomendado:** 4h (reinicialização rápida do serviço local PM2).
