-- 202609061800_sinal_realtime (UP) — TASK-072 · Sprint 25 · Etapa 5 do ADR-012
-- REQ-032 · constitution §3.2
--
-- O banco anuncia que algo mudou. Não diz o quê.
--
-- ## Por que o sinal é vazio
--
-- O mecanismo natural do Supabase seria `postgres_changes`, que entrega a linha
-- alterada direto ao navegador. Ele autoriza por RLS — e este sistema tem RLS
-- ligado com ZERO políticas (nega tudo a `anon`) e não usa Supabase Auth: as
-- sessões são JWTs nossos, então para o Supabase todo usuário daqui é `anon`.
--
-- Para `postgres_changes` entregar qualquer coisa, seria preciso criar políticas
-- de SELECT para `anon` nas tabelas de chaves. A chave anônima vai no bundle do
-- navegador e é pública por definição: as tabelas passariam a ser legíveis por
-- qualquer pessoa com o DevTools aberto, ao largo do `proxy.ts` e da checagem de
-- papel em cada rota. A §3.2 não admite — "checagem só no client é
-- vulnerabilidade, não feature".
--
-- Então o Realtime carrega SINAL, e o dado continua saindo pelas rotas
-- autenticadas. O cliente ouve "mudou" e refaz a busca de sempre.
--
-- O canal é público (`private = false`) porque canal privado exigiria Realtime
-- Authorization, que se apoia num JWT do Supabase que este sistema não emite.
-- Com carga vazia, o que sai é apenas *que houve uma mudança* — sem dizer qual,
-- de quem ou o quê. **Não é custo zero:** quem tiver a chave anônima consegue
-- inferir volume e horário de atividade. É o preço da decisão, registrado no
-- ADR-012 e aqui.
--
-- ## Por que STATEMENT e não ROW
--
-- A cota do plano gratuito é por MENSAGEM (2 M/mês). Uma devolução em lote de 30
-- chaves numa instrução emitiria 30 mensagens em `FOR EACH ROW` e emite uma em
-- `FOR EACH STATEMENT`. Como a mensagem não carrega conteúdo, saber *quantas*
-- linhas mudaram não acrescenta nada ao cliente: ele vai refazer a mesma busca
-- de qualquer maneira.
--
-- ## Por que o sinal NUNCA derruba a escrita
--
-- O `EXCEPTION WHEN OTHERS` não é preguiça. Sem ele, uma indisponibilidade do
-- Realtime — ou a simples ausência do schema `realtime`, em qualquer Postgres que
-- não seja o Supabase — faria toda retirada e devolução de chave falhar. Um
-- mecanismo de notificação que pode abortar a transação que notifica é pior do
-- que não ter notificação nenhuma: troca uma degradação de conforto por uma
-- indisponibilidade de negócio.
--
-- O que acontece quando o sinal falha: nada, do lado do banco. Do lado do
-- cliente, a ausência de sinal é indistinguível de "nada mudou" — e é por isso
-- que a TASK-073 (degradação para polling largo) não é polimento, é o par desta.

CREATE FUNCTION public.sinalizar_mudanca_chaves() RETURNS trigger
LANGUAGE plpgsql
-- search_path fixo, mesma postura da TASK-065: sem ele a função resolveria nomes
-- pela variável de sessão de quem dispara o trigger. `realtime.send` é
-- qualificada, então continua resolvendo.
SET search_path = pg_catalog
AS $$
BEGIN
    BEGIN
        PERFORM realtime.send('{}'::jsonb, 'mudou', 'chaves', false);
    EXCEPTION WHEN OTHERS THEN
        -- Melhor-esforço, de propósito. Ver o cabeçalho.
        NULL;
    END;
    RETURN NULL;
END;
$$;

CREATE TRIGGER keys_sinaliza_mudanca
    AFTER INSERT OR UPDATE OR DELETE ON keys
    FOR EACH STATEMENT EXECUTE FUNCTION public.sinalizar_mudanca_chaves();

CREATE TRIGGER key_transactions_sinaliza_mudanca
    AFTER INSERT OR UPDATE OR DELETE ON key_transactions
    FOR EACH STATEMENT EXECUTE FUNCTION public.sinalizar_mudanca_chaves();
