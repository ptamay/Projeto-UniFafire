-- 202609101100_registro_de_migracoes (DOWN) — TASK-101 · ADR-021
--
-- Escrito ANTES do UP (regra 20-migrations).
--
-- ⚠️ Reverter apaga o registro de TUDO o que o runner aplicou. Depois disso, a
-- única resposta para "o que está aplicado?" volta a ser inspecionar o schema à
-- mão — que é exatamente o estado que o ADR-021 existe para acabar. Nenhum dado de
-- negócio se perde; perde-se a memória do banco sobre si mesmo.
--
-- Se precisar reverter, rode a adoção (TASK-102) de novo depois de recriar a
-- tabela, para marcar o que já estava lá sem reexecutar.

DROP TABLE migracoes_aplicadas;
