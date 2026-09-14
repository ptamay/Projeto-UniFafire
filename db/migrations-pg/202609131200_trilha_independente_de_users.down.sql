-- 202609131200_trilha_independente_de_users (DOWN) — TASK-115 · ADR-024
--
-- Escrito ANTES do UP (constitution §4.1).
--
-- Devolve as três chaves estrangeiras da trilha para `users`, com os nomes e a definição
-- que o baseline (202609031200) deu a elas.
--
-- ⚠️ FALHA DE PROPÓSITO depois de uma restauração que tirou de `users` alguém que tem
-- registro na trilha: a FK não pode voltar enquanto houver `user_id` sem conta. Não há
-- rollback silencioso possível — apagar a trilha para caber na FK é exatamente o que
-- esta migration existe para impedir (§7.1). Nesse caso, o DOWN não é o caminho.

ALTER TABLE action_logs ADD CONSTRAINT action_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES users(id);
