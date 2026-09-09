-- 202609090900_sem_senha_compartilhada (DOWN) — TASK-094 · ADR-017
--
-- Escrito ANTES do UP (regra 20-migrations).
--
-- ⚠️ ESTA REVERSÃO É PARCIAL, E O AVISO É A PARTE MAIS IMPORTANTE DO ARQUIVO.
--
-- O UP faz duas coisas de naturezas diferentes:
--
--   1. APAGA a linha `default_reset_password` de `settings`  → reversível
--   2. ANULA o `password_hash` de contas com reset pendente  → **NÃO VOLTA**
--
-- Hash apagado não se recupera: é o ponto de existir hash. Reverter esta migration
-- devolve a CONFIGURAÇÃO, e não devolve o ACESSO de quem foi desarmado. Quem tiver
-- sido invalidado continua sem senha, e a saída é um novo reset — que, com a 093 no
-- ar, emite um código de uso único.
--
-- Um DOWN que calasse sobre isso faria alguém acreditar que a reversão é completa, e
-- descobrir o contrário com gente sem conseguir entrar no sistema.
--
-- ## Por que a linha volta com um valor propositalmente inútil
--
-- Restaurar `'unifafire123'` seria pior que não restaurar: ressuscitaria a senha
-- que este ADR existe para eliminar, e alguém poderia ficar com ela achando que é
-- o estado anterior legítimo. O valor abaixo é um marcador — se aparecer numa tela,
-- é sinal de que houve reversão e de que ninguém decidiu o que colocar ali.

INSERT INTO settings (key, value)
VALUES ('default_reset_password', 'REVERTIDO-DEFINA-UM-VALOR')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;
