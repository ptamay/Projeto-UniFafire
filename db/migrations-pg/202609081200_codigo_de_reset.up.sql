-- 202609081200_codigo_de_reset (UP) — TASK-093 · Sprint fora de ciclo · ADR-017
-- constitution §2.1, §2.4, §7.1
--
-- O reset deixa de gravar uma senha compartilhada e passa a emitir um CÓDIGO DE
-- USO ÚNICO.
--
-- ## Por que colunas próprias, e não o `password_hash`
--
-- Seria mais barato guardar o hash do código no `password_hash` que já existe: o
-- login compararia sem mudar uma linha. É justamente por isso que não se faz.
--
-- **Dado que mora num campo assume o significado do campo.** Um código guardado
-- em `password_hash` é lido por todo leitor seguinte como "a senha do usuário" —
-- e o primeiro que o tratar assim reabre exatamente a janela que o ADR-017 fecha:
-- um valor de acesso que não expira, não se consome e vale como senha.
--
-- Separado, o reset pode fazer a coisa certa: **invalidar a senha antiga na
-- hora**, em vez de substituí-la por uma que alguém conhece.
--
-- ## Por que não há NOT NULL nem DEFAULT
--
-- A ausência de código é o estado normal — só existe código entre um reset e o
-- primeiro acesso. `NULL` aqui significa "esta conta não tem reset pendente", que
-- é o que a maioria das linhas é na maior parte do tempo.
--
-- ## O que esta migration NÃO faz
--
-- Não mexe nas contas que já estão com `requires_password_change = true`. Essas
-- têm no `password_hash` o hash da senha compartilhada, e continuam abertas a
-- quem conhece aquele valor. **Invalidá-las é a TASK-094**, junto com a remoção
-- da senha padrão — porque fazê-lo aqui deixaria essas pessoas sem caminho
-- nenhum antes de a tela do ADMIN saber emitir código.

ALTER TABLE users ADD COLUMN reset_code_hash text;
ALTER TABLE users ADD COLUMN reset_code_expires_at timestamptz;

-- Só as linhas com reset pendente têm valor aqui, e a expiração é sempre
-- consultada junto do hash. Índice parcial: não paga por conta sem reset.
CREATE INDEX idx_users_reset_code ON users (id) WHERE reset_code_hash IS NOT NULL;
