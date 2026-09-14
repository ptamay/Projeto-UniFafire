-- 202609131200_trilha_independente_de_users (UP) — TASK-115 · ADR-024, decisão 4
--
-- A trilha de auditoria deixa de ter chave estrangeira para `users`.
--
-- ## Por quê
--
-- Restaurar um backup (TASK-115) troca as tabelas de negócio e preserva a trilha (§3.5,
-- §7.1). Quem foi criado depois do backup tem de sair de `users` — e estas três FKs
-- impediam: `TRUNCATE users` falha com a trilha apontando para ela, e com CASCADE o
-- Postgres apagaria a trilha junto. Decisão do usuário em 2026-09-13.
--
-- A trilha já guarda o `username` do momento, ao lado do `user_id`. Sem a FK, ela vira o
-- que uma trilha deve ser: registro do que aconteceu, que não depende de a conta existir
-- hoje. O `user_id` de quem sumiu nunca passa a apontar para outra pessoa, porque a
-- restauração nunca recua as sequências (`db/restaurar-backup.mjs`).
--
-- Só muda restrição; nenhum dado é tocado — não exige ensaio sobre a cópia (§4.2).

ALTER TABLE action_logs DROP CONSTRAINT action_logs_user_id_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_actor_id_fkey;
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_target_user_id_fkey;
