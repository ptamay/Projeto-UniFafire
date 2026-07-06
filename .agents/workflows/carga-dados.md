---
description: Fase 10.5 — carga inicial de dados legados (conteúdo, não schema) com reconciliação
---

1. Pré-requisito: schema pronto. Primeira execução SEMPRE contra staging/branch efêmero —
   nunca produção.
2. Siga a seção "Fase 10.5" de `.sdd/reference/modules/sprint-governance.md`:
   mapa campo-a-campo (`docs/migration/data-mapping.md`) → limpeza ANTES da carga →
   script IDEMPOTENTE (upsert por chave natural) com rollback pareado → backup pré-carga →
   dry-run → gate de reconciliação mecânico (contagens, FK órfãs, amostra).
3. MODO SENSÍVEL: cifra de campo + trilha de auditoria DESDE a carga. PII em claro = BLOQUEADOR.
4. Aceite do cliente sobre amostra ANTES do go-live
   (`docs/migration/reconciliation-report.md`). Só então rode em produção.
