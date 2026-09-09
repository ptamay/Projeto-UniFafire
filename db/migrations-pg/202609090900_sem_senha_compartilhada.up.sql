-- 202609090900_sem_senha_compartilhada (UP) — TASK-094 · ADR-017
-- constitution §2.1, §2.4
--
-- A senha padrão compartilhada deixa de existir no banco.
--
-- ## Por que uma migration, e não só código
--
-- A TASK-093 fez o reset emitir código de uso único, e a senha compartilhada parou
-- de ser APLICADA. Mas remover o código que a lê **não desarma quem já a tem
-- gravada**: uma conta resetada antes da 093 carrega no `password_hash` o hash
-- daquela senha, e continua aberta a quem conhece o valor — agora sem nada na tela
-- que denuncie.
--
-- Tirar o campo da tela sem esta migration trocaria uma exposição visível por uma
-- invisível.

-- 1. A configuração sai. Em produção a linha vale `'trocar123'`, resíduo da carga
--    sintética da TASK-067 que ninguém escolheu.
DELETE FROM settings WHERE key = 'default_reset_password';

-- 2. Quem está com reset pendente ANTIGO perde o acesso até um novo reset.
--
-- ⚠️ A CONDIÇÃO É O CORAÇÃO DESTA MIGRATION, e a distinção é sutil. Depois da
-- TASK-093 uma conta recém-resetada TAMBÉM tem `requires_password_change = true`:
--
--   antigo (perigoso)   password_hash = bcrypt(senha compartilhada)
--                       reset_code_hash IS NULL
--   novo   (legítimo)   password_hash IS NULL
--                       reset_code_hash = <hash do código de uso único>
--
-- Olhar só `requires_password_change` derrubaria o código de quem está a caminho do
-- balcão para trocar a senha. As três condições juntas é que separam os dois casos.
--
-- ⚠️ RISCO CONHECIDO, e é para conferir ANTES de aplicar: um ADMIN criado por
-- `db/bootstrap-admin.mjs` que ainda NÃO tenha feito o primeiro login cai nesta
-- condição, e a senha dele é aleatória — não é a compartilhada. Ele seria
-- invalidado sem necessidade, e num sistema recém-instalado isso é ficar sem
-- caminho de entrada.
--
-- Não dá para distinguir em SQL: exigiria comparar bcrypt. Em produção, na data
-- desta migration, são ZERO contas nesta condição (2 ativas, nenhuma pendente).
-- Antes de aplicar em qualquer base, rode:
--
--   SELECT id, username FROM users
--   WHERE requires_password_change AND reset_code_hash IS NULL AND password_hash IS NOT NULL;
--
-- Se vier alguém, decida caso a caso — e prefira resetar pela tela depois, que já
-- emite código.
UPDATE users
   SET password_hash = NULL
 WHERE requires_password_change
   AND reset_code_hash IS NULL
   AND password_hash IS NOT NULL;
