# Runbook de Operação — UniFafire · Sistema de Gerenciamento de Chaves

> TASK-036 (Sprint 7 — Dívida de Estabilização). Procedimentos operacionais para
> quem administra o servidor. Manter atualizado a cada mudança de infraestrutura.

## Responsável pela operação
| Papel | Quem |
|---|---|
| Operador primário | Administração da UniFafire (conta ADMIN do sistema) |
| Suporte técnico | Paulo Tamay (mantenedor do projeto) |

## Objetivos de recuperação (constitution §4)
- **RPO: 24h** — perda máxima aceitável = 1 dia de movimentações (backup diário).
- **RTO: 4h** — o sistema deve voltar ao ar em até 4 horas após um desastre.

---

## 1. Iniciar / Parar / Reiniciar o sistema (PM2)

A aplicação roda como o app PM2 **`unifafire`** (ver `ecosystem.config.js`), porta 3000,
logs em `logs/app.log` e `logs/error.log`.

Pelos atalhos na raiz do projeto (Windows):
- **Ligar:** `Ligar_Sistema.bat` (ou `iniciar_sistema.bat`)
- **Desligar:** `Desligar_Sistema.bat`
- **Rebuild de produção:** `Build_Producao.bat` (necessário após atualizar o código)

Ou manualmente no terminal, na raiz do projeto:
```bash
pm2 start ecosystem.config.js   # iniciar
pm2 stop unifafire              # parar
pm2 restart unifafire           # reiniciar
pm2 status                      # ver estado
pm2 logs unifafire              # acompanhar logs em tempo real
```

Diagnóstico rápido: logs estruturados da aplicação em `logs/app-YYYY-MM-DD.log`
(JSON por linha; entradas `level:"error"` primeiro).

## 2. Backups

- **Automático:** diário, no horário configurado em `/settings` (padrão 03:00),
  gravado em `backups/keys_backup_AAAA-MM-DD.db`, com retenção configurável.
- **Verificação (TASK-032):** todo backup é validado (tamanho > 0, SQLite íntegro) e
  registrado em `backups/backup-history.jsonl`. A métrica "Confiabilidade (30 dias)"
  aparece no card de backups em `/settings` — **alvo: 100%**. Se estiver abaixo,
  investigue `logs/app-*.log` por entradas `backup_run` com `status:"failed"`.
- **Manual:** botão "Gerar Backup Agora" em `/settings` (ADMIN).

## 3. Restaurar um backup

**Via interface (preferido):** `/settings` → Backups Disponíveis → botão restaurar
no backup desejado (ADMIN). A aplicação troca o arquivo e reconecta sozinha.

**Manual (se a aplicação não sobe):**
1. `pm2 stop unifafire`
2. Guarde o banco atual: `copy keys.db keys.db.corrompido` (não sobrescreva evidência)
3. Copie o backup escolhido por cima: `copy backups\keys_backup_AAAA-MM-DD.db keys.db`
4. `pm2 start ecosystem.config.js`
5. Confirme: login no sistema + dashboard carregando + `node db/migrate.mjs status`
   (migrações aplicadas devem listar a baseline e a de imutabilidade)

### Evidência do teste de restauração (BDD da TASK-036)
| Data | Procedimento | Resultado |
|---|---|---|
| 2026-07-02 | Restauração manual simulada em sandbox: cópia de produção → backup → corrupção proposital do banco → restauração pelo passo a passo acima → verificação | ✅ `PRAGMA integrity_check = ok`; 18 usuários e 12 registros de histórico preservados (contagens idênticas pré/pós) |

> Repetir este teste a cada semestre ou após mudança na rotina de backup, e
> registrar nova linha nesta tabela.

## 4. Migrações de banco

Mudanças de schema entram SOMENTE por `db/migrations/` (UP/DOWN pareados):
```bash
node db/migrate.mjs status   # o que está aplicado/pendente
node db/migrate.mjs up       # aplica (testa em cópia antes)
node db/migrate.mjs down 1   # reverte a última
```
Antes de `up` em produção: gere um backup manual. Nunca edite o banco à mão.

## 5. Incidentes comuns

| Sintoma | Ação |
|---|---|
| Sistema fora do ar | `pm2 status` → se parado, `pm2 start ecosystem.config.js`; se em crash-loop, `pm2 logs unifafire` e `logs/error.log` |
| "JWT_SECRET missing" no boot | O `.env` sumiu ou está sem `JWT_SECRET` (mín. 32 chars). Restaure o `.env` — **nunca** o commite no git |
| Banco corrompido | Seção 3 (restauração manual) |
| Backup falhando (confiabilidade < 100%) | `backups/backup-history.jsonl` → campo `error` do run falho; disco cheio é a causa mais comum |
| Operação destrutiva contestada | Trilha em `/logs` (action_logs) e, para `clear-database`, entradas `destructive_operation` em `logs/app-*.log` (sobrevivem à limpeza do banco) |
