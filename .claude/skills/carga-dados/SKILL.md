---
name: carga-dados
description: Use this skill to plan and execute the initial DATA migration (content load)
  when a new system replaces an existing spreadsheet, legacy system, or paper process.
  Triggers when the user says 'migração de dados', 'carga inicial', 'importar planilha',
  'importar os contratos', 'dados legados', 'trazer os dados antigos', or '/carga-dados'.
  Runs in Claude Code, leveraging the xlsx and pdf skills. This is content migration,
  NOT schema migration. Part of the Constitutional SDD framework (Fase 10.5).
---

## Papel

Você executa a **Fase 10.5** do Constitutional SDD: trazer os dados existentes do cliente
para dentro do novo sistema, com segurança e reconciliação. **Carga de conteúdo — NÃO é
migration de schema** (estrutura do banco, essa vive em db/migrations).

## Pré-requisito

Rode só depois do schema pronto. **Primeira execução sempre contra branch Neon efêmero /
staging — nunca direto em produção.**

## Fluxo

1. **Fonte:** identifique formato e volume.
   - Planilha → use a skill `xlsx` para ler e limpar
   - PDFs (ex: contratos digitalizados) → use a skill `pdf` para extrair campos
   - Dump/API de sistema antigo → mapeie direto

2. **Mapa:** gere `docs/migration/data-mapping.md` — campo-a-campo origem→destino, o que
   não mapeia, defaults para campos ausentes.

3. **Limpeza ANTES da carga:** dedup, normalização, enforcement de campos obrigatórios.
   Dado sujo migrado é dado sujo permanente. Registre o que foi limpo.

4. **Script de import IDEMPOTENTE** (upsert por chave natural — rodar 2x não duplica), com
   rollback pareado. **Backup pré-carga obrigatório.**

5. **Dry-run** contra Neon/staging → depois o **gate de reconciliação (mecânico)**:
   - contagem origem = destino (menos rejeitados documentados)
   - zero FK órfão | zero violação de campo obrigatório | amostra conferida (X%)

6. **Dado sensível (MODO SENSÍVEL):** criptografia de campo + trilha de auditoria **desde
   a carga**, não depois. PII migrada em claro = BLOQUEADOR.

7. **Reconciliação + aceite:** gere `docs/migration/reconciliation-report.md` e obtenha
   **aceite do cliente sobre uma amostra ANTES do go-live**.

8. Só então rode em **produção**, na janela de go-live.

## Bloqueadores

- Import não-idempotente = BLOQUEADOR
- Reconciliação com divergência não documentada = BLOQUEADOR
- Go-live sem aceite da carga quando havia dado legado = BLOQUEADOR

> Referência completa dentro de um projeto: `.sdd/reference/modules/sprint-governance.md` — Fase 10.5.
