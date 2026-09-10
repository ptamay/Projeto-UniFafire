# ADR-023 — A API de dados do Supabase nasce fechada, e os workflows declaram o que podem

- **Status:** Aceito — aprovado pelo usuário em 2026-09-10; implementação nas TASK-109 e 110
- **Data:** 2026-09-10
- **Tipo de Change Request:** **C** (muda privilégio de banco e workflows já no ar; não toca a constitution)
- **Relacionado:** ADR-012 · ADR-021 · ADR-022 · TASK-065 · TASK-106 · runbook §4
- **Origem:** item de endurecimento aberto desde 2026-09-07, medido com números na TASK-106

## Contexto

### O que a TASK-106 tornou visível

Até a TASK-106 a base de teste não tinha default privilege nenhum, e qualquer pergunta
sobre o que `anon` alcança era respondida por um banco imaginário. Com a base fiel ao
`pg_default_acl` lido em produção (`postgres | public` → anon, authenticated,
service_role), a pergunta passou a ter resposta. Depois de todas as migrations:

| objeto em `public` | `anon` / `authenticated` |
|---|---|
| 12 tabelas | **nenhum privilégio**, todas com RLS — as REVOKEs das migrations funcionam |
| 11 sequências | `SELECT, UPDATE, USAGE` |
| 4 funções de trigger | `EXECUTE` |

Não é falha explorável hoje. A chave pública (`anon`, no bundle do navegador) só
alcança o banco pela API REST e pelo Realtime: a REST não expõe sequência, e função
de trigger não pode ser chamada diretamente. É **privilégio sobrando**.

### O problema maior é o do dia seguinte

No Supabase, **toda tabela, sequência e função nova em `public` nasce concedida a
`anon` e `authenticated`**. As 12 tabelas estão fechadas porque cada migration que
criou uma lembrou o `REVOKE` e o `ENABLE ROW LEVEL SECURITY` — convenção, e só. A
constitution não diz uma palavra sobre RLS nem sobre `anon`. A primeira migration que
esquecer abre uma tabela à chave que está no bundle, sem sintoma nenhum na aplicação
(que fala com o banco como `postgres` e não passa pela API REST).

E nenhum teste acusaria: não existe guarda de RLS ou de grant por tabela.

### Os workflows herdam o token padrão

`keepalive.yml` e `backup.yml` não declaram `permissions:` (confirmado em 2026-09-07).
Herdam o token padrão do Actions, que pode escrever no repositório. O keepalive só faz
`curl`; o backup só faz checkout com esse token (o push vai para outro repositório, com
token próprio). O `pos-deploy.yml` (TASK-103) já nasceu com `permissions: {}`.

### O que o sistema usa das roles do Supabase

- `anon`: a chave pública, **só no Realtime** (sinal vazio, ADR-012 Etapa 5). O canal
  de broadcast não depende de privilégio em `public`.
- `authenticated`: nada — o projeto não usa Supabase Auth.
- `service_role`: nada no código. A chave é secreta e não sai do servidor.
- A aplicação, o backup e o runner falam com o banco como `postgres`.

## Decisão

**1. `anon` e `authenticated` perdem todo privilégio em `public`**: tabelas, sequências e
funções existentes. `service_role` fica como está (decisão do usuário): a chave dela é
secreta, ela ignora RLS por desenho, e a plataforma pode usá-la internamente.

**2. O que for criado depois nasce fechado.** A mesma migration revoga o default
privilege do Supabase em `public` para essas duas roles. Tabela nova deixa de depender
de alguém lembrar o `REVOKE`.

> ⚠️ **Função tem um grant a mais.** O Postgres concede `EXECUTE` a `PUBLIC` em toda
> função nova, e `anon` herda por aí — revogar só de `anon` não fecharia nada. As
> funções de `public` perdem o `EXECUTE` de `PUBLIC` também, e o default de `PUBLIC`
> para funções só se revoga pela forma **global** do `ALTER DEFAULT PRIVILEGES` (a forma
> `IN SCHEMA` só acrescenta). Trigger não depende de `EXECUTE` de quem dispara o
> comando; o sinal do Realtime continua funcionando — e isso é verificado, não suposto.

**3. Uma guarda torna a regra verificável**, na base com o padrão de produção: toda
tabela de `public` tem RLS; `anon` e `authenticated` não têm privilégio em tabela,
sequência ou função de `public` — nem herdado de `PUBLIC`; e o default privilege não
lhes concede nada.

**4. Todo workflow declara `permissions:` no topo**, com o mínimo: `{}` onde não usa o
token padrão, `contents: read` onde só faz checkout. Guarda: workflow sem `permissions:`
reprova.

## Alternativas consideradas

**Fechar também `service_role`.** Menor privilégio levado ao fim. Rejeitada pelo usuário:
mexe numa role que a plataforma pode usar, e o ganho é pequeno — a chave não sai do
servidor.

**Só revogar os existentes, e a guarda cobra cada migration nova.** Menos mudança na
plataforma. Rejeitada pelo usuário: cada migration carregaria o `REVOKE` à mão, e a
guarda viraria a única linha de defesa de uma convenção.

**Não fazer nada, porque não é explorável.** Verdade hoje. Mas a exposição que importa
é a da tabela que ainda não existe — e ela chega pelo caminho mais comum de todos, uma
migration nova.

**Elevar à constitution** ("a API de dados nasce fechada"). Faria da guarda lei, como a
§3.2 fez com a das páginas. **Fora deste CR** (seria Tipo D); registrado para decisão
futura.

## Consequências

**Positivas**
- A chave do bundle deixa de alcançar qualquer objeto de `public`, hoje e amanhã.
- A convenção do `REVOKE`/RLS vira guarda, com dente — a base de teste já é fiel.
- Os workflows param de carregar um token que pode escrever no repositório.

**Negativas / riscos**
- Se algum dia o projeto adotar a API REST ou o Supabase Auth, cada tabela exposta terá
  de ser concedida explicitamente — que é o comportamento certo, mas é trabalho.
- **O cenário 1 da TASK-106 quebra** do jeito que está: ele lê o default privilege da base
  da suíte DEPOIS das migrations, e esta migration o revoga. Ele passa a conferir a base
  logo após a preparação da plataforma — é isso que ele sempre quis dizer.
- A migration muda privilégio em produção. Não toca dado (não exige ensaio, ADR-022), mas
  a ida e volta tem de restaurar EXATAMENTE o estado anterior — inclusive o que o
  `rls_auto_enable` já não tinha.
- `backup.yml` só está verificado depois de rodar de verdade (lição do go-live).

## Implementação

- **TASK-109 — a migration e a guarda.** Antes de tudo, confirmar em produção, com
  consulta só-leitura rodada pelo usuário, que os privilégios de `anon`/`authenticated`
  batem com os medidos na base de teste, e se há event trigger ativo (o `rls_auto_enable`
  sugere que a plataforma pode ligar RLS sozinha). Migration pareada, ida e volta exata,
  guarda da decisão 3, ajuste do cenário 1 da TASK-106. Em produção: aplicar pelo runner
  (§4.1), e verificar depois — health 200, `conferir` limpo, **sinal do Realtime
  recebido** e o card de tempo real "Ativa".
- **TASK-110 — `permissions:` nos workflows**, com guarda. Verificado só quando o
  `backup.yml` rodar de verdade depois do merge (execução manual).
