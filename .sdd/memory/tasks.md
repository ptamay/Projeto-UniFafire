# tasks.md — Micro-spec da Sprint Ativa (Sprint 25 · 🔴 crítica)

> **Etapa 5 do ADR-012 — Realtime. REQ-032.** A última etapa aberta, e o requisito que
> motivou a migração inteira.
>
> Canal: Claude Code · Modelo: Opus 5 · Esforço: alto.
> Criticidade 🔴: o caminho óbvio da implementação passa por afrouxar RLS, e a decisão D1
> existe para não passar por ele.

---

## O conflito que define esta sprint

O ADR-012 diz "substituindo os 4 pollings por **Supabase Realtime**" e não especifica o
mecanismo. O mecanismo óbvio — `postgres_changes` — **não funciona neste sistema**, e
fazê-lo funcionar custaria a autorização inteira:

- As 11 tabelas têm RLS ligado e **zero políticas**: negam tudo a `anon` e `authenticated`.
  Postura deliberada da TASK-065.
- **O sistema não usa Supabase Auth.** As sessões são JWTs nossos, assinados com
  `JWT_SECRET`. Para o Supabase, todo usuário do sistema é `anon`.
- `postgres_changes` autoriza **por RLS**. Um cliente no navegador receberia nada.

Para ele entregar dados seria preciso criar políticas de SELECT para `anon` nas tabelas de
chaves. A chave anônima vai no bundle do navegador e é pública por definição — as tabelas
passariam a ser legíveis por qualquer um com o DevTools aberto, ao largo do `proxy.ts` e da
checagem de papel em cada rota. É o que a constitution §3.2 proíbe.

---

## Decisões de execução

**D1 — O Realtime carrega SINAL, não dados.** O banco emite "algo mudou nas chaves", sem
conteúdo. O cliente, ao receber, **refaz a busca pelas rotas atuais** — que continuam
validando sessão e papel no servidor. Nenhuma tabela é publicada, nenhuma política RLS é
afrouxada, e a fronteira de autorização não se move um milímetro.

O custo do desenho, dito por inteiro: há um refetch entre o sinal e a tela. Sinal
(~100–300 ms) mais o refetch de uma rota já existente cabe nos 500 ms do REQ-032, mas é
preciso **medir**, não presumir — está na DoD.

**D2 — Quem emite é o BANCO, não as rotas.** `realtime.send()` num trigger de `keys` e
`key_transactions`. A alternativa era cada rota de escrita emitir depois de gravar, e ela
falha pela pergunta que este projeto já errou três vezes: *pegamos todas?* São rotas de
retirada, devolução, transferência, cancelamento, confirmação e bypass. Trigger no banco é
fechado por construção — qualquer caminho de escrita dispara, inclusive SQL manual.

**D3 — O canal é público, e por isso o sinal é vazio.** Canal privado exigiria Realtime
Authorization, que se apoia num JWT do Supabase que este sistema não tem. Com canal público
e carga vazia, o que sai é apenas *que houve uma mudança* — sem dizer qual, de quem ou o
quê. **Isso não é zero:** quem tiver a chave anônima consegue inferir volume e horário de
atividade. É o preço da decisão, e fica registrado em vez de omitido.

**D4 — `supabase-js` entra só para o canal.** O acesso a dados continua sendo `pg`
(`src/lib/pg.ts`). A tabela de stack do `plan.md` ganha a linha com esse limite explícito —
biblioteca nova sem registro é o que a regra `00-core` chama de stack inventada.

**D5 — A degradação não é polimento, é o que impede a piora.** Se a assinatura falhar em
silêncio, a tela congela — e tela congelada é **pior** que os 3 s de hoje. Por isso a
TASK-073 tem cenário de "nunca conectou" e de "caiu depois", e o fallback é observável.

---

## TASK-072: o sinal substitui os quatro pollings

**Contexto**: quatro `setInterval(..., 3000)` — `DashboardClient`, `PendingInline`,
`Sidebar` e `ConfirmClient` — que projetam ~10,5 mi de requisições/mês para 10 usuários e
até 3.000 ms de defasagem.

**Critérios BDD**:
- [x] **Cenário**: O banco anuncia a mudança, e não o conteúdo dela
      Dada uma escrita em `keys` ou `key_transactions`
      Então um trigger emite `realtime.send` no canal de chaves
      E a carga da mensagem **não contém dado de negócio** — nem id, nem nome, nem usuário
      E há migration com DOWN escrito antes do UP (constitution §4.1).
- [x] **Cenário**: Toda escrita dispara, venha de onde vier
      Dadas as operações de retirada, devolução, transferência, cancelamento e bypass
      Quando qualquer uma grava
      Então o sinal é emitido sem que a rota precise lembrar de emiti-lo.
- [x] **Cenário**: Nenhuma tabela é publicada, nenhuma política é afrouxada
      Dado o schema
      Então a publicação `supabase_realtime` continua **sem tabelas**
      E `pg_policies` em `public` continua **vazia**
      E nenhuma migration desta sprint cria política para `anon`.
- [x] **Cenário**: O cliente refaz a busca pelas rotas autenticadas
      Dado o sinal recebido no navegador
      Quando a tela reage
      Então ela chama as mesmas rotas de hoje, que validam sessão e papel
      E o dado **não** vem do Supabase direto para o navegador.
- [x] **Cenário**: Os quatro pollings de 3 s deixam de existir
      Dado `src/`
      Então não há `setInterval` de 3.000 ms nos quatro componentes
      E o relógio de `use-client-clock` e o logout automático de 60 s permanecem — não são
      polling de dados.

**O que a execução ensinou:**

- **Um teste EXISTENTE pegou o erro mais importante desta task.** O stub de
  `realtime.send` criou a tabela de registro em `public`, e a verificação de esquema do
  backup (TASK-078) acusou divergência: uma tabela de teste tinha virado "tabela da
  aplicação". Movida para o schema `realtime`. Vale o registro porque a guarda que pegou
  não foi escrita para isto — foi escrita para dump truncado, e serviu.
- **O `globalSetup` precisou derrubar o schema `realtime` também.** Ele limpava só o
  `public`, e a segunda execução da suíte colidia em `42P07`. Estado que sobrevive entre
  execuções é a mesma classe do banco compartilhado com o navegador.
- **Três ajustes de lint, e a distinção importa:** dois eram defeitos meus — escrita em
  ref durante o render e dependência faltando no efeito. O terceiro é **falso-positivo**,
  suprimido com justificativa escrita: `fetchPendingCount` é assíncrona e o `setState`
  acontece depois de dois `await`; a regra não enxerga isso através de um `useCallback` e
  aceita o mesmo padrão quando a função é declarada dentro do efeito.

---

## TASK-073: sem WebSocket, a tela não congela

**Contexto**: hoje o pior caso é 3 s de defasagem. Com assinatura que falha em silêncio, o
pior caso vira **defasagem infinita**, e o usuário não tem como saber.

**Critérios BDD**:
- [x] **Cenário**: Assinatura que nunca conecta cai para polling largo
      Dado que o canal não atinge o estado inscrito dentro do tempo limite
      Então a tela passa a buscar em intervalo largo
      E volta a atualizar, em vez de ficar parada.
- [x] **Cenário**: Conexão que cai depois também degrada
      Dada uma assinatura ativa que é encerrada ou entra em erro
      Então o polling largo assume
      E, se a assinatura voltar, o polling largo é desligado — sem os dois rodando juntos.
- [x] **Cenário**: Sem as variáveis do Supabase, o sistema funciona
      Dadas `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` ausentes
      Então a aplicação sobe e as telas atualizam por polling largo
      E **nada quebra** — ambiente sem Realtime é degradação, não falha.
- [x] **Cenário**: A decisão de degradar é testável fora do navegador
      Dado o estado da assinatura
      Então a escolha entre "assinado" e "degradado" é função pura, com teste
      E não uma condicional enterrada no componente.

**O que a execução ensinou:**

- **A degradação foi MEDIDA, não presumida.** 89 s de janela sem as variáveis do Supabase:
  `/api/transactions/pending` nos segundos **26, 56 e 86** — intervalos de 30 s exatos —
  e **12 requisições de API no total**, contra as ~145 que o polling de 3 s faria no mesmo
  período. A aplicação sobe e opera sem Realtime configurado.
- **Incluir `conectando` na regra dispensou um timeout de conexão**, e isso é desenho e
  não sorte: o primeiro disparo do intervalo está a 30 s, então uma conexão normal o
  cancela antes de custar uma requisição, e uma conexão que nunca vem deixa o polling
  acontecer. Um número mágico a menos para alguém acertar errado depois.
- **A primeira leitura da medição deu zero, e não era o app.** Minha instrumentação de
  `fetch` tinha sido perdida numa navegação anterior. Repeti do zero — recarregar,
  instrumentar, medir. Registro porque a conclusão apressada teria sido "o fallback não
  funciona", e a task teria sido reescrita para consertar o que não estava quebrado.

---

## Definition of Done da sprint

- [x] Os 2 pares `test(TASK-NNN)` → `feat(TASK-NNN)` na ordem, suíte inteira verde a cada um
- [x] Migration do trigger com DOWN escrito antes do UP
- [x] `./scripts/ci-gates.sh` limpo (6 gates), `tsc --noEmit` 0, `eslint` 0
- [x] `npm audit` sem HIGH/CRITICAL — lido inteiro
- [x] `npm run build` verde **sem `DATABASE_URL` definida**
- [ ] **A defasagem é MEDIDA, não presumida:** duas sessões abertas, uma opera, e o tempo
      até a outra refletir fica registrado. Critério do REQ-032: **≤ 500 ms**.
      ⚠️ **ABERTO, e não pode ser fechado daqui.** A medição exige Realtime de verdade —
      as variáveis `NEXT_PUBLIC_SUPABASE_*` e a migration aplicada no Supabase. O container
      local não tem o serviço. Mesma classe da verificação do backup, que só existiu depois
      de rodar em produção. **O REQ-032 não está demonstrado até isto acontecer.**
- [x] **A degradação é exercitada de verdade:** derrubar a conexão e confirmar que a tela
      volta a atualizar por polling largo.
- [ ] Fase 11 + Memory Sync

> **Fora da DoD, porque é do usuário:** cadastrar `NEXT_PUBLIC_SUPABASE_URL` e
> `NEXT_PUBLIC_SUPABASE_ANON_KEY` na Vercel, e aplicar a migration do trigger no Supabase
> (§3.1 e §4 do runbook). Até lá, produção roda em polling largo — que é o comportamento
> desenhado, não uma falha.
