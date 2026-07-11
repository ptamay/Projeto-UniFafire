---
description: Ideia nova ou mudança de escopo — classificar antes de agir, nunca implementar direto
---

1. Classifique TIPO A/B/C/D pela regra `40-change-request.md` — ela é autocontida, siga-a.
   Na dúvida entre tipos, pergunte; nunca classifique como A para evitar trabalho.
2. Atualize os artefatos exigidos pelo tipo: `spec.md` (changelog), `plan.md` (backlog),
   ADR em `/docs/adr/` (C/D), `constitution.md` só com aprovação explícita (D).
3. Commit `docs: change request — [título]` + Memory Sync
   (`chore: memory sync pós-CR — [título]`, com checkpoint atualizado).
4. A implementação entra pelo ciclo TDD na próxima sprint — nunca ad-hoc nesta sessão.
