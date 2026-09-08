-- 202609081200_codigo_de_reset (DOWN) — TASK-093 · ADR-017
--
-- Escrito ANTES do UP (regra 20-migrations).
--
-- ⚠️ Reverter DERRUBA os códigos em voo. Quem tiver recebido um código e ainda
-- não o tiver usado fica sem caminho de entrada: a coluna some, e a senha antiga
-- daquela conta já foi invalidada pelo reset. Não é perda de dado de negócio — é
-- perda de acesso, e a saída é resetar de novo, agora pelo mecanismo antigo.
--
-- Por isso o DROP é explícito e sem `IF EXISTS` nas colunas: se elas não
-- estiverem lá, alguém aplicou este DOWN duas vezes e é melhor saber.

-- O índice sairia junto com a coluna do predicado, mas explícito é melhor: quem
-- lê o DOWN vê tudo o que o UP criou, sem depender de saber a regra de cascata.
DROP INDEX idx_users_reset_code;

ALTER TABLE users DROP COLUMN reset_code_hash;
ALTER TABLE users DROP COLUMN reset_code_expires_at;
