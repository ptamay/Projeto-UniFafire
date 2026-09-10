# CLAUDE.md — Contexto do Projeto para Claude Code
> Lido automaticamente pelo Claude Code ao iniciar em qualquer diretório do projeto.
> Versão compatível com Constitutional SDD v5 (migrado do v4.4.0 em 2026-07-06)
> Mapa do projeto: `AGENTS.md` · Memória permanente: `.sdd/memory/`
> ⚠️ Não editar manualmente — atualizado automaticamente pelo Memory Sync (Step 10) ao fim de cada sprint,
> e pelo Checkpoint (comando "checkpoint") a qualquer momento durante uma sessão.

---

## ⚠️ Requisito de Diretório

Este arquivo deve estar na **raiz do projeto**. O Claude Code (Desktop ou Terminal) só carrega
`CLAUDE.md` automaticamente se o diretório de trabalho configurado for esta raiz, ou um diretório
acima dela — nunca uma subpasta.

Se você abrir o Claude Code e ele não parecer ter contexto do projeto, confirme que o diretório
de trabalho está configurado para a raiz onde este arquivo está. Não é necessário pedir para
"ler o CLAUDE.md" — se o diretório estiver correto, a leitura é automática.

---

## Comandos de Sessão — "checkpoint" e "retoma"

Estes dois comandos existem para que trocar de chat nunca signifique perder contexto
ou precisar reler o `master-spec-core.md` e os módulos inteiros.

### Quando o usuário disser **"checkpoint"**:
1. Atualize a seção `## Checkpoint Atual
> Atualizado a qualquer momento via comando "checkpoint". Sobrescrito — não é histórico.
> Se vazio, esta sessão ainda não gerou checkpoint intermediário — use "Estado atual do projeto" abaixo.

```
- Fase: 11 — GO-LIVE CONCLUÍDO em 2026-09-06. O sistema está NO AR.
- Sprint/Task Ativa: Nenhuma. Sprints 16–23 concluídas e publicadas na `main`.
- PRODUÇÃO (a partir de 2026-09-06 — a nota "NÃO EXISTE PRODUÇÃO" está VENCIDA):
  · App: https://projeto-uni-fafire.vercel.app — Vercel, escopo `projeto-uni-fafire`,
    conta `unifafiregc@gmail.com` (DIFERENTE da conta ligada ao GitHub `ptamay`; o
    `vercel` CLI logado como ptamay NÃO enxerga o projeto — ver runbook §0)
  · Banco: Supabase `sa-east-1`, 11 tabelas, todas as migrations aplicadas
  · Backup: `ptamay/unifafire-backups` (privado), primeiro dump verificado em
    2026-09-06 — 67 linhas / 11 tabelas / 23 índices / 6 triggers / 11 sob RLS
  · ADMIN: usuário `admin`, senha já trocada pelo usuário na tela
- Última Ação: **Sprint 27 — TRÊS páginas entregavam dados de terceiros a qualquer
  sessão, e a correção fechou a fronteira que a camada de API não alcança.** Terceiro
  CR de autorização do dia, achado pela varredura lateral aplicada às TELAS.
  As páginas são Server Components: consultam o banco direto, e quando verificam só
  a sessão **não há 403 possível** — não existe rota no caminho.
  TASK-088 — `/keys` BLOQUEIA (não há leitura legítima do inventário alheio) e
  `/history` ESCOPA, por decisão sua: ver o próprio histórico é legítimo, bloquear
  seria proteger a pessoa do dado dela mesma. A/G/P veem tudo; os demais, só as
  próprias movimentações. ⚠️ **A restrição é TETO, não padrão** — campo separado que
  SOBRESCREVE o `userId` da query string, senão um FUNCIONARIO passaria
  `?userId=outro` e teríamos a mesma exposição atrás de uma página que PARECE
  escopada. Vale também na CONTAGEM;
  TASK-089 — o dashboard ESCOPA o que entrega em vez de bloquear (é legitimamente de
  todos os papéis): a lista de TODOS os funcionários e alunos ativos nem é
  consultada para quem não opera o balcão;
  TASK-090 — guarda que varre as `page.tsx` e reprova página que consulta o banco
  sem verificar papel, com exceções em lista. Vale mais que as duas primeiras.
  Verificado: 471 testes / 49 arquivos, 6 gates, tsc 0, eslint 0, `next build` verde
  sem DATABASE_URL.
- ⚠️ A guarda da TASK-090 nasceu CEGA duas vezes, e são a quinta e a sexta desta
  série: `pgQuery\s*\(` não casava com `pgQuery<HistoryItem>(` — a varredura
  concluía que NENHUMA página consulta o banco — e `session.role` casava com
  `userRole={session.role}`, que é repassar o papel ao cliente, exatamente o que as
  páginas desprotegidas faziam. **Só apareceram porque rodei o vermelho e conferi
  QUAIS cenários passavam, em vez de contar quantos falhavam.**
- ✅ **§3.2 EMENDADA em 2026-09-08 (CR Tipo D, ADR-020).** Ela
  dizia "toda **rota de API**" e agora diz **fronteira** — rota de API e Server
  Component igualmente —, nomeando os dois casos concretos. Lista enumerada
  envelhece: a próxima superfície que o framework inventar nasceria fora dela.
  Nenhum comportamento mudou; mudou o que um leitor futuro conclui, que é o ponto
  inteiro de uma regra de segurança.
- Ação anterior: **Sprint 26 — DUAS falhas de autorização corrigidas, e o contrato de
  API criado.** Ambas encontradas pelo mesmo método (enumerar a superfície e comparar
  rotas irmãs) e **nenhuma tinha sintoma**:
  TASK-085 — `/api/metrics/frequent-users` validava sessão e não papel: qualquer
  autenticado, inclusive ALUNO, obtinha nome, username, papel e frequência de
  retirada dos maiores usuários de qualquer chave (`keyId` sequencial);
  TASK-087 — `GET /api/settings` não validava NADA e devolvia `defaultResetPassword`
  a todos. Combinado com o fluxo de troca obrigatória do login, permitia **tomar a
  conta de alguém** na janela entre um reset e o primeiro acesso da vítima,
  herdando o papel — **escalada de privilégio**;
  TASK-086 — `docs/api-contract.md`, débito da Sprint 24, agora existe e descreve a
  superfície corrigida.
- ⚠️ FICA REGISTRADO, e é decisão sua: a TASK-087 fechou o ACESSO, não a
  fragilidade. Senha padrão compartilhada mantém a janela para quem a conhece
  legitimamente. A alternativa (senha aleatória por reset, exibida uma vez) é
  feature nova, Tipo A, sprint própria.
- Ação anterior: **Sprint 25 — Etapa 5 do ADR-012 (Realtime).**
  O caminho literal do ADR (`postgres_changes`) foi REJEITADO com base em
  verificação: ele autoriza por RLS, e este sistema tem RLS negando tudo a `anon`
  e não usa Supabase Auth — usá-lo exigiria abrir as tabelas de chaves à chave
  anônima do bundle (§3.2). O Realtime passou a carregar **sinal vazio** por
  trigger (`realtime.send`), e o cliente refaz a busca pelas rotas autenticadas.
  TASK-073 dá a rede de segurança: sem sinal, polling de 30 s em vez de tela
  congelada. Medido no cenário degradado: 12 requisições de API em 89 s, contra
  ~145 do polling de 3 s. PR #23 merged.
- ⚠️ **O REQ-032 NÃO ESTÁ DEMONSTRADO.** A defasagem de ≤ 500 ms exige Realtime de
  verdade. Enquanto não houver um número medido no `plan.md`, o requisito que
  motivou a migração inteira está entregue em CÓDIGO e não em FATO. Ver Próxima Ação.
- Ação anterior: **Sprint 24** (faxina da tela · ADR-013) (faxina da tela · ADR-013) —
  PR #21 aberto, aguardando merge.
  TASK-084 saíram `startCronJobs()`, `src/instrumentation.ts` e a dependência
  `node-cron`: 52 das 60 linhas de `app_logs` em produção eram `cron_desativado`,
  87% da trilha, e a §7.1 proíbe limpá-la;
  TASK-082 a tela perdeu os quatro controles inertes, o card de importar `.db`, as
  rotas `restore`/`import`, o `POST /api/backups` e o `createBackup()` — e ganhou
  o arranjo real do backup em texto;
  TASK-083 a leitura de `auto_logout_time` passa a recusar valor herdado inválido
  (o `"30"` mantinha o logout automático inerte), o gatilho virou CRUZAMENTO do
  horário em vez de igualdade exata, o vazamento de `setInterval` foi corrigido, e
  a senha padrão de reset passou a ter UMA fonte — eram CINCO lugares, dois já
  divergindo.
  Verificado: 427 testes / 44 arquivos, 6 gates, tsc 0, eslint 0, npm audit 0,
  `next build` sem DATABASE_URL, e a tela exercitada no navegador COM o valor
  quebrado de produção semeado.
- ✅ REQ-032, passos 1 e 2 FEITOS em 2026-09-06: variáveis `NEXT_PUBLIC_SUPABASE_*`
  cadastradas na Vercel (tipo **Config**, não Secret — o prefixo público é
  intencional) e a migration do sinal aplicada no Supabase. **Mecanismo validado
  em produção** sem escrever dado: canal SUBSCRIBED, trigger disparado com
  `UPDATE ... WHERE false` (zero linhas) e sinal recebido por um cliente real.
- ✅ **REQ-032 — AS DUAS CAUSAS CAÍRAM. 734 ms → ~162 ms observáveis** (medido em
  produção em 2026-09-08, depois da TASK-092). `X-Vercel-Id: gru1::gru1::…`: a
  função executa em São Paulo, junto do banco. A diferença entre a rota que toca o
  banco e a que não toca caiu de **249 ms para 19 ms**. Com as buscas em paralelo
  (TASK-091), o observável é B + uma perna C ≈ **162 ms contra 500 ms** de
  orçamento — **338 ms de folga** para a perna A, que segue sem número.
  ⚠️ **Não é o requisito demonstrado**: o REQ-032 mede da confirmação da operação
  até a tela do outro dispositivo, e a perna A (commit → Realtime) só a primeira
  operação real fecha. O que mudou é que ela deixou de precisar caber em 100 ms.
  ⚠️ **Correção de atribuição:** o registro de 2026-09-07 chamou os 249 ms de
  "custo de uma ida ao banco". Eram **duas** travessias — `/login` é ESTÁTICA e
  nunca executa função, então a diferença entre as rotas media *chegar à função e
  dali ao banco*, e as duas pernas eram transcontinentais. Não muda a decisão;
  explica a queda maior e por que `/login` não melhorou.
- Histórico do diagnóstico (2026-09-07), que continua valendo como método:
  Duas das três pernas se medem sem operação nenhuma, e foram, em produção, sem
  escrever nada: **B) Realtime → navegador = 64 ms** (broadcast para si mesmo no
  canal de produção) e **C) refetch = 335 ms por rota** (`/api/health`, que é
  pública e consulta o banco). O dashboard de PORTEIRO/ADMIN faz DUAS buscas EM
  SÉRIE → **~734 ms observáveis contra 500 ms de orçamento**, e a perna A
  (commit → Realtime) ainda por cima.
- ⚠️ **A CAUSA NÃO É O REALTIME** — a perna que a Sprint 25 inteira construiu
  custa 64 ms dos 734. São duas coisas banais, e as duas estão medidas:
  1. **A função roda no continente errado.** `X-Vercel-Id: gru1::iad1::…` — entra
     em São Paulo e executa em Washington, com o banco em `sa-east-1`, São Paulo.
     `/login` (não toca o banco) responde em 86 ms; `/api/health` (um `SELECT 1`)
     em 335 ms. A diferença é **249 ms, IDÊNTICA na mediana e no mínimo** — que é
     assinatura de distância, não de trabalho. Não há `vercel.json`; a região
     nunca foi escolhida. Corrigir = fixar `gru1`, que muda a topologia do
     ADR-012 → **Change Request**.
     ✅ **FEITO — TASK-092, 2026-09-08.** `vercel.json` versionado, e o critério
     de aceite do ADR-016 (o número cair, não o arquivo existir) foi verificado
     em produção depois do deploy: 249 ms → 19 ms.
  2. ~~`refreshData` serializa duas buscas independentes.~~ **FEITO — TASK-091,
     2026-09-07.** As duas saem juntas; verificado no navegador com `fetch`
     instrumentado (sobrepostas, 44 ms locais em vez da soma). Ficou
     `Promise.allSettled`: `all` rejeita na primeira falha e deixa a segunda
     rejeição órfã, e numa rede oscilando as duas falham juntas.
  Sobra a região. Com ela, a soma cai para a casa dos 150 ms — **projeção**.
- Próxima Ação: decidir sobre as duas correções acima (a região é CR). O que
  continua sem número é a perna A e o total de ponta a ponta, que exigem a
  **primeira operação real** — e o aparato para captá-la deixou de ser trabalho:
  `scripts/medir-req032.mjs --operacao` fica ouvindo e cronometra sozinho. O que
  fazia esta medição escorregar de sprint em sprint não era a medição, era montar
  o aparato toda vez.
- ✅ ENSAIO DE RESTAURAÇÃO feito em 2026-09-06: dump baixado do repositório
  privado, restaurado e conferido em **72 s**, sem erro, com estrutura e contagens
  idênticas ao registrado — e os guardas de imutabilidade EXERCITADOS na base
  restaurada, não só contados. Tabela no runbook §6.6.
- ⚠️ O RTO de 4 h ainda NÃO está medido por inteiro: faltam provisionar um projeto
  Supabase novo, repontar a aplicação e o tempo humano de perceber e decidir — as
  três etapas que exigem credencial de produção e que na prática dominam o número.
  O ensaio removeu a maior incógnita: a parte técnica leva segundos.
- ✅ **TODAS as etapas do ADR-012 estão fechadas em código** (3, 4, 5, 7a, 7b; a 6
  foi dissolvida). Não há sprint planejada. O que vier agora entra por Change
  Request.
- ✅ PR #21 merged (`d79020a`) e a Sprint 24 está VERIFICADA EM PRODUÇÃO: o deploy
  concluiu 16:14:46 UTC e, com 36 requisições em instâncias novas depois disso,
  `app_logs` NÃO recebeu nenhuma linha `cron_desativado` (parou em 61, a última
  às 15:53:02). O logout automático e a faxina da tela também estão no ar.
- ⚠️ LIÇÃO DO GO-LIVE, e é a mais cara desta rodada: o job de backup passou em 25
  testes e falhou nas TRÊS primeiras execuções reais — extensões da plataforma no
  dump, schema `public` já existente, e token sem `Contents`. A suíte cobria a
  lógica pura de reconciliação; o que quebrou foi a orquestração em volta dela, que
  nenhum teste alcança. O `tasks.md` da Sprint 23 tinha registrado esse limite com
  todas as letras. **Job de CI só está verificado depois de rodar de verdade.**
- ⚠️ O que NÃO está demonstrado: o RTO de 4 h. (A nota que dizia que a tabela do
  runbook §6.6 estava em branco está VENCIDA — ela foi preenchida em 2026-09-06.)
- ⚠️ Credenciais: precisam estar no gerenciador de senhas da instituição — conta
  Vercel, JWT_SECRET, senha do Supabase e o ADMIN. Sem isso o §8 (incidentes) não é
  executável por quem estiver de plantão. A senha do Supabase FOI ROTACIONADA em
  2026-09-06 (vazou num terminal); a antiga não vale mais.
- ⚠️ TESTES (dev): exigem Postgres em container — `npm run test:db:up` ANTES de
  `npx vitest`. A suíte dá TRUNCATE no MESMO banco usado para verificar no navegador.
  Parece sempre defeito de autenticação. Verificação no navegador é o ÚLTIMO passo.
  Para semear: TRUNCATE + `DATABASE_URL=... node db/bootstrap-admin.mjs` (o script
  NÃO lê o .env.local). O Docker Desktop costuma estar parado — subir antes.
- ⚠️ Se o `test:db:up` falhar com **"bind: An attempt was made to access a socket
  in a way forbidden by its access permissions"**, NÃO é defeito do projeto: é o
  Windows (WinNAT/Hyper-V) tendo reservado a porta. Confira com
  `netsh interface ipv4 show excludedportrange protocol=tcp`. Foi o que engoliu a
  antiga 55432 em 2026-09-08; a porta virou **15432**, abaixo da faixa dinâmica
  (49152-65535), onde o WinNAT não chega. Contorno imediato para qualquer porta
  ocupada: subir o container à mão em outra e exportar `DATABASE_URL` —
  `tests/pg-test-config.ts` honra a variável.
- ⚠️ **O LEDGER DE MIGRATIONS NÃO DESCREVE O QUE ESTÁ NO BANCO** (medido em
  2026-09-07). Não há runner: as migrations são aplicadas à mão por `psql`, em
  ordem de nome. O ledger tem 6 entradas e `db/migrations-pg/` tem 6 arquivos, e o
  número igual esconde que divergem **nos dois sentidos**:
  `search_path_history_imutavel_task_065` está no ledger e não tem arquivo;
  `202609061800_sinal_realtime` tem arquivo, **ESTÁ APLICADA** (o sinal funciona em
  produção) e não está no ledger. Ele não é limite inferior nem superior.
  O runbook §4.1 chamava o ledger de "única fonte confiável" — **corrigido em
  2026-09-07**. O conferidor que vale é o schema, e não só as tabelas:
  **trigger ausente não se manifesta**, a escrita proibida simplesmente passa.
- ✅ **O backup diário está rodando de verdade** — 06, 07 e 08 de setembro, três
  execuções verdes consecutivas depois das três falhas do go-live. O `keepalive`
  também. A lição continua: job de CI só está verificado depois de rodar.
- ✅ (a) **REGIÃO — FECHADA em 2026-09-08.** CR (ADR-016) → TASK-092 pelo ciclo
  TDD → deploy → **medição refeita em produção**: 249 ms → 19 ms. O critério de
  aceite era o número cair, e ele caiu.
- Decisões ainda em aberto, na ordem em que eu faria: (b) **correção operacional em produção** —
  `auto_logout_time` = "30" e `default_reset_password` = "trocar123", resíduo da
  carga sintética da TASK-067, corrigível pela tela; (c) emendar a §3.2 (Tipo D);
  (d) CR para runner de migrations do Postgres — a divergência do ledger cresce a
  cada aplicação manual; (e) endurecimento: `ALTER DEFAULT PRIVILEGES` + teste de
  RLS por tabela, e `permissions:` nos workflows (**confirmado ausente nos dois**
  em 2026-09-07); (f) ✅ **VIROU CR — ADR-017, TASK-093/094, 2026-09-08**, e mudou de
  forma no caminho: não é "senha aleatória exibida uma vez" (aquilo transmitiria
  senha em claro na resposta, o que a §2.1 proíbe, e faria o ADMIN saber a senha
  de outra pessoa) e sim **código de uso único** — a pessoa entra com
  `username + código` e define a própria senha. Tipo C, não D, por causa disso.
  Resolve junto o `default_reset_password = "trocar123"`; (g) expurgar keys.db do
  histórico antigo do git (**confirmado que está lá**; risco baixíssimo — era
  SQLite de desenvolvimento).
- Arquivos não commitados: nenhum
- ⚠️ HIGIENE DE DADOS em produção, e a nota anterior estava VENCIDA: as 4 linhas
  de `settings` são da carga SINTÉTICA da TASK-067 — eu as preservei na limpeza do
  go-live achando que eram configuração legítima, e errei.
  · `auto_logout_time` = "30" **NÃO é mais a causa de logout quebrado.** A
    TASK-083 (Sprint 24, no ar desde `d79020a`) fez a LEITURA recusar valor
    inválido: `lerAutoLogoutTime` devolve `AUTO_LOGOUT_PADRAO` = 18:30, e o
    logout automático **funciona hoje**. O que sobra é lixo no banco e uma MINA —
    o dia em que alguém "simplificar" a validação da leitura, o defeito volta
    inteiro. Corrigir é abrir `/settings` (o campo já EXIBE 18:30, porque a
    leitura sanitiza) e salvar.
  · `default_reset_password` = "trocar123" é diferente e **não tem sanitização**:
    a linha SOBRESCREVE o padrão do código (`unifafire123`), então o que está
    gravado é o que o sistema aplica de fato.
  · Pela TELA e não por SQL: `action_logs` registra mudança de configuração feita
    pela tela, e `UPDATE` por fora não deixa rastro de quem mudou o quê (§7.1).
    A consulta a `settings` por MCP também foi bloqueada pelo classificador.
- ✅ DÉBITO QUITADO: `docs/api-contract.md` existe desde 2026-09-06 (TASK-086), e
  escrevê-lo é o que revelou as duas falhas de autorização acima. **O débito se
  pagou antes de o arquivo existir.**
- ⚠️ MÉTODO QUE VALE REPETIR, e já não é "provavelmente": enumerar a superfície
  inteira e **comparar irmãos lado a lado** achou CINCO falhas de autorização em
  duas horas — duas em rotas (ADR-014) e três em páginas (ADR-015) —, nenhuma com
  sintoma, nenhuma acusada por teste, gate ou tela em meses. Todas com a mesma
  forma: **a sessão é verificada, o papel não, e a interface esconde o que o
  servidor não protege.** Aplicado depois a migrations e workflows, achou só
  endurecimento (RLS por convenção, `permissions:` ausente) — registrado no
  `plan.md`, não é defeito ativo.
- ⚠️ LIÇÃO DA SPRINT 24: **validação só na fronteira de entrada assume que a
  fronteira sempre existiu.** Um `"30"` vindo de seed de teste manteve um controle
  da §2 inerte em produção, sem sintoma, porque o POST validava e a leitura não.
- Branch atual: feat/task-097-configuracoes (PR a abrir). PRs #15–#45 merged; #46
  aberto (registro da migration).
- ✅ **TASK-097 FEITA em 2026-09-09** — card de atualização em tempo real (lendo de
  assinatura COMPARTILHADA, sem abrir segundo WebSocket), zona de perigo separada
  fora da grade, e o card de configurações reequilibrado. O botão de "rever
  tutorial" NÃO entrou: a TASK-098 não existe, e há cenário proibindo a palavra na
  tela — ele cai quando o tutorial chegar.
- ✅ **VAZAMENTO DE WEBSOCKET CORRIGIDO (TASK-105, 2026-09-09).** Cliente único por
  aba, preguiçoso. Recontado no navegador com as MESMAS três navegações:
  **4 sockets / 4 abertos → 0 / 0**, e o tempo real continua "Ativa". O canal
  continua sendo removido ao desmontar — com um socket só, seriam os CANAIS a
  acumular, e a callback dispararia N vezes por sinal.
- Registro do defeito, porque o número dá sentido à correção:
  `useSinalDeMudanca` cria o cliente Supabase DENTRO do efeito, e cada página
  renderiza o próprio `Sidebar`: toda navegação abre um socket novo. A limpeza
  remove o canal e **não fecha o socket**. Medido: **3 navegações → 4 sockets, todos
  ainda OPEN**. O plano gratuito tem limite de conexões simultâneas — o sintoma
  seria o tempo real parar para todos, sem erro visível. **Anterior à TASK-096**
  (vem da TASK-072). Registrado no `plan.md`; é a coisa mais urgente da fila.
- ✅ **TASK-096 FEITA em 2026-09-09 — e a medição EMENDOU o ADR-018.** Nove
  `loading.tsx` (não havia nenhum) e as quatro superfícies de navegação em `<Link>`.
  **Mas o prefetch ficou DESLIGADO**, contra a prescrição original:

      requisições no load       13 → 0
      por router.refresh()       7 → 1
      esqueleto aparece em   29–43 ms → 3–14 ms

  O prefetch não comprava nada — o esqueleto vem do BUNDLE DA ROTA. E
  `router.refresh()` invalida o cache e faz todos os links prefetcharem de novo; ele
  é chamado pelo `refreshData` **a cada sinal do Realtime, em cada cliente aberto**.
  Multiplicador ligado à ATIVIDADE, que é a forma do problema que criou o REQ-032.
- ⚠️ **PREFETCH NÃO SE MEDE EM DEV.** O Next o desliga em desenvolvimento, então o
  número lá é zero e parece que não há custo. Foi preciso `next start` sobre um
  build de produção — entrada `prod-local` no `.claude/launch.json`.
- ✅ **TASK-094 FEITA em 2026-09-09 — o ADR-017 está fechado.** Não existe mais
  senha compartilhada em lugar nenhum. O `default_reset_password = "trocar123"` de
  produção deixa de precisar de correção manual: a migration apaga a linha.
- ✅ **MIGRATION `202609090900` APLICADA em 2026-09-09.** Conferência prévia rodada:
  **0 contas** seriam invalidadas, e depois **0 contas sem senha** — ninguém ficou
  sem acesso. O `trocar123` deixou de existir no banco. `settings` em produção agora
  tem `auto_logout_time`, `backup_retention_count` e `backup_time`.
- ⚠️ **DUAS LINHAS ÓRFÃS ficaram em `settings`** (achado ao aplicar): `backup_time` e
  `backup_retention_count` são gravadas e **ninguém as lê desde a TASK-082**, que
  tirou os dois controles da tela. Mesma família do `default_reset_password`. Não é
  defeito ativo; sai por migration, não por SQL à mão. Registrado no `plan.md`.
- ⚠️ **A DIVERGÊNCIA DO LEDGER CRESCEU PELA SEGUNDA VEZ EM DOIS DIAS.** Hoje são
  **8 arquivos, 6 entradas, 4 divergências** — `202609081200` e `202609090900` estão
  aplicadas e fora dele. Aplicar SQL fora da CLI do Supabase não escreve no ledger e
  **nada avisa**. É o argumento inteiro do ADR-021, se cumprindo duas vezes seguidas.
- ✅ **TASK-095 FEITA em 2026-09-08** — a saída entra na trilha com motivo (lista
  fechada; sem sessão verificável não registra; o registro nunca impede de sair).
  Verificado no navegador nos dois caminhos, e o automático exercitado de verdade:
  **o mecanismo das 18:30 FUNCIONA**, então a hipótese 1 do ADR-018 é real.
- ⚠️ **A §2.2 AINDA não pode ser emendada — falta o DADO, não o instrumento.** A
  TASK-095 entrega o instrumento; a resposta exige **deixar rodar em produção
  alguns dias**. Como ler: `LOGOUT` automático perto das quedas → é o horário;
  `LOGIN_SUCCESS` sem `LOGOUT` anterior → expiração ou outro aparelho (a expiração
  é impossível de registrar no instante: quem recusa é o `proxy.ts`, no Edge, sem
  banco). Só com a causa nomeada a emenda sai.
- 📋 **ADR-021 (runner de migrations) escrito, TASK-101 a 104 no backlog.** Virou
  Tipo D ao descobrir que **a §4.1 descreve um projeto que não existe**: manda
  `db/migrations/NNNN_up_*.sql` e a realidade é `db/migrations-pg/*.up.sql` — nem o
  diretório nem o padrão batem, e o Gate 2 passa porque verifica pareamento, não a
  convenção. A emenda fica na TASK-104, DEPOIS do runner existir.
- ✅ **HIGIENE (ADR-019, TASK-099/100)** — `jspdf` saiu do carregamento inicial de
  `/history` (459 KB → fora do manifesto), `server-only` (morta) e `@types/pg`
  (tipo em `dependencies`) corrigidas, dez arquivos mortos removidos e
  `.vercelignore` criado (~35% do repositório deixa de subir).
  ⚠️ **O `.vercelignore` não se verifica localmente** — só afeta o upload para a
  Vercel. A prova é o build de preview do PR.
  ⚠️ Registrado e FORA de escopo: três majors pendentes — `typescript` 5→7,
  `eslint` 9→10, `vitest` 4→5. Mudam regras e diagnósticos; misturá-las com
  limpeza tornaria impossível dizer o que quebrou o quê.
- ✅ **TASK-093 NO AR (2026-09-08)** — o reset emite código de uso único. A migration
  `202609081200_codigo_de_reset` foi aplicada à mão pelo usuário, e as duas colunas
  mais o índice parcial estão conferidos em produção.
- ⚠️ **MERGE NÃO APLICA MIGRATION, e desta vez custou.** O código subiu antes das
  colunas: o login seguiu funcionando (`SELECT *` devolve coluna ausente como
  `undefined`), mas **resetar acesso e criar usuário responderam 500** na janela
  entre o deploy e a aplicação manual. Registrado no runbook §4.2. Enquanto não
  houver runner, a ordem é responsabilidade de quem faz o merge.
- ⚠️ **A divergência do ledger CRESCEU no mesmo dia em que foi documentada** — a
  migration nova não entrou nele (aplicar SQL pelo editor não escreve no ledger, e
  nada avisa). Agora são 7 arquivos, 6 entradas, 3 divergências. Reforça o CR (d).
- ✅ **A incógnita da TASK-094 tem resposta: ZERO contas** com
  `requires_password_change` em produção (de 2 ativas). A guarda continua necessária
  — alguém pode ser resetado até lá —, mas "provavelmente nenhuma" virou "nenhuma,
  verificado em 2026-09-08".
- ⚠️ **A SESSÃO JÁ PERSISTE — a premissa do relato estava errada.** Idle de 24 h
  renovado a cada requisição pelo proxy, absoluto de 7 dias no JWT, e os dois são
  TEXTO LITERAL da §2.2. Os LOGIN_SUCCESS de produção têm um intervalo de ~32 h
  (cabe no idle) e outro de ~17 h (**não deveria ter derrubado nada**). Três
  hipóteses compatíveis: logout das 18:30 numa aba aberta, cookies separados do PWA
  no iOS, idle. **Nenhuma verificável, porque `/api/auth/logout` não registra nada
  na trilha** — lacuna do REQ-010 por si só. Decisão sua em 2026-09-08:
  INSTRUMENTAR (TASK-095) antes de emendar a §2.2, que é Tipo D. Ver ADR-018.
- Atualizado em: 2026-09-08
```

---

## Antes de qualquer ação — leitura proporcional ao contexto

> **Regra geral:** leia apenas o que a próxima ação exige.
> Reler todos os arquivos por hábito desperdiça janela de contexto
> e aumenta custo de tokens sem benefício operacional.

**Se o comando for "retoma" E `## Checkpoint Atual` tem próxima ação definida:**
→ Leia **apenas** o `## Checkpoint Atual`. Resuma e continue.
→ Não releia os arquivos abaixo a menos que a próxima ação exija especificamente.

**Se o checkpoint estiver vazio, desatualizado, ou a ação exigir contexto estrutural:**
→ Leia nesta ordem, parando assim que tiver o suficiente para a tarefa:

1. `.sdd/memory/constitution.md` — lei máxima (se ausente: pare e avise)
2. `.sdd/memory/plan.md` — stack aprovada, decisões, AI Cost Budget
3. `.sdd/memory/spec.md` — escopo e métricas (leia só se a tarefa envolve requisitos)
4. `.sdd/memory/overview.md` — contexto humano (leia só se não tiver clareza do domínio)

> Nunca releia todos os 4 por reflexo. Se `constitution.md` + `plan.md` são suficientes
> para a tarefa, pare aí. `spec.md` e `overview.md` são sob demanda.

---

## Seu papel neste projeto

Você é o **agente de arquitetura e desbloqueio**, não o agente de execução de sprint.

| Faça | Não faça |
|------|----------|
| Auditar consistência de artefatos | Executar tasks do `tasks.md` autonomamente |
| Gerar e revisar ADRs | Executar sprint sem direcionamento do usuário (sprints 🔴 críticas rodam aqui via skill `sprint`) |
| Depurar decisões complexas | Criar código sem verificar `constitution.md` |
| Revisar Fitness Functions (`.semgrep/`) | Assumir stack não listada no `plan.md` |
| Apoiar a Fase 6 (síntese SDD Triad) | Avançar fases sem aprovação explícita do usuário |

---

## Estado atual do projeto

> ⚠️ Esta seção é atualizada pelo Antigravity ao fim de cada sprint via Memory Sync (Step 10).
> Se estiver desatualizada, leia `.sdd/memory/constitution.md` como fonte de verdade.

```
Modo do projeto   : EXPRESSO
Sprint atual      : — (nenhuma ativa, e nenhuma planejada)
Última sprint     : 27 ✅ (CR Tipo C, ADR-015 — autorização em Server Components ·
                    TASK-088, 089, 090). Três páginas entregavam dados de terceiros
Sprint anterior   : 26 ✅ (CR Tipo C, ADR-014 · TASK-085, 087, 086). Duas rotas —
                    uma delas permitia escalada de privilégio
Produção          : NO AR desde 2026-09-06 — https://projeto-uni-fafire.vercel.app
Fase atual        : 11 (operação). TODAS as etapas do ADR-012 fechadas em código:
                    3, 4, 5, 7a e 7b. A Etapa 6 foi dissolvida. Nada planejado —
                    o que vier entra por Change Request
Último commit     : (ver git log -1)
Próxima ação      : TASK-093/094 (ADR-017) — código de uso único no reset, pelo
                    ciclo TDD. 🔴 crítica: mexe no login, que é o Fluxo 1 da spec
                    §4. Fora isso, o REQ-032 espera a PRIMEIRA OPERAÇÃO REAL para
                    fechar a perna A (`medir-req032.mjs --operacao`)
```

---

## Stack aprovada (referência rápida)

> Fonte canônica: `.sdd/memory/plan.md` — seção "Stack e Decisões".
> Não use ferramentas fora desta lista sem registro explícito em `plan.md`.

| Camada | Ferramenta padrão |
|--------|------------------|
| Frontend | Next.js + Tailwind CSS + Custom CSS |
| Backend / dados | **Postgres (Supabase, `sa-east-1`) via `pg`** — `src/lib/pg.ts`. Sem ORM, sem prepared statement nomeado, `$n` sempre |
| Auth | Sessão/JWT (`jose`) + `bcryptjs`. Segredo validado por `src/lib/secret-policy.ts` — o processo NÃO SOBE com segredo fraco. Cookie só por `src/lib/session-cookie.ts`, com `secure` incondicional em produção |
| Deploy | **Vercel**. O aparato local (PM2, `.bat`, `ecosystem.config.js`, `show-ip.js`, `/api/server-info`) foi REMOVIDO na TASK-079. Saúde em `/api/health`, pública e de dois campos. Passo a passo em `docs/runbook-deploy.md` |
| Testes | Vitest contra **Postgres real em container** (`npm run test:db:up`) + Playwright |
| Secrets | .env local |
| Erros | Sentry |
| Autorização | `src/proxy.ts` NEGA por padrão (API 401, página 307). Papel continua sendo do handler — §3.2 |
| Backup | **`pg_dump` diário no GitHub Actions** → repositório PRIVADO separado, verificado por RESTAURAÇÃO (contagens + esquema) numa base descartável. Cada execução é gravada em `backup_runs`. O plano gratuito do Supabase NÃO tem backup gerenciado — CR Tipo D `7770d2e` |
| Agente de sprint | Antigravity |

> ⚠️ `better-sqlite3` saiu do runtime na Sprint 21 e é **devDependency** — usado só pelas
> ferramentas offline `db/migrate.mjs` e `db/load-pg.mjs`. Importá-lo em `src/` reprova a suíte.
>
> ⚠️ Promessa solta é **erro de lint** na superfície de servidor desde a TASK-081
> (`@typescript-eslint/no-floating-promises`). Chamada assíncrona sem `await` em rota, lib,
> proxy ou Server Component reprova o pre-commit — em serverless a instância congela quando
> a resposta sai e a escrita pendente morre com ela.

---

## Quando o usuário te aciona — contextos comuns

### Fase 6 — Geração da SDD Triad (você é protagonista aqui)

> ⚠️ Nesta fase, `constitution.md`, `spec.md` e `plan.md` **ainda não existem** —
> sua função é GERÁ-LOS, não auditá-los.

Use a skill `arquitetura`. Leia `.sdd/memory/handoff.md` (gerado ao fim da Fase 5) e
`.sdd/memory/overview.md`. Carregue `.sdd/reference/modules/security-constitution.md` +
`.sdd/reference/modules/architecture-governance.md` (no v5 eles vivem neste repositório,
em `.sdd/reference/`) antes de gerar qualquer artefato.

Gere `constitution.md`, `spec.md`, `plan.md` (e `api-contract.md` + `adr/*.md` se
aplicável) conforme o template da Fase 6 em `.sdd/reference/master-spec-core.md`.

Ao final, execute o checklist do CHECKPOINT da Fase 6 (mesmo arquivo) antes de
informar ao usuário que pode prosseguir para a Fase 7.

**Calibração de esforço nesta fase:** ver seção "Effort Levels — Fase 6" em
`.sdd/reference/master-spec-core.md`. Gates e checklists usam esforço mínimo; síntese de
`constitution.md`, `plan.md` e auditoria cruzada usam esforço máximo.

### Desbloqueio de sprint (Antigravity travou)
Leia `.agents/workflows/sprint.md` + `tasks.md` da sprint atual.
Entenda o que o agente fez, o que falhou e por quê.
Proponha a correção. Não reescreva o que já foi feito sem necessidade.

### Change Request — nova ideia ou mudança de escopo
Ouça a descrição do usuário. Classifique como Tipo A, B, C ou D conforme
a regra `.agents/rules/40-change-request.md` (autocontida). Apresente a classificação e o impacto
antes de alterar qualquer artefato. Aguarde confirmação para Tipo C e D.
Nunca implemente a mudança diretamente — atualize `spec.md`, `plan.md` e/ou
`adr/*.md` e faça o commit do Change Request. A implementação entra pelo
ciclo TDD normal na próxima sprint.

### Geração de ADR
Use o template de `/docs/adr/ADR-NNN-*.md`.
Baseie-se em decisões já tomadas e registradas em `plan.md`.
Nunca invente decisão — apenas formalize o que já foi decidido.

### Review pós-sprint
Leia o Report do Step 9 em `.agents/workflows/sprint.md`.
Verifique Fitness Functions, AI Validation Gate e débitos técnicos.
Atualize `plan.md` se necessário.

---

## Regras inegociáveis (herdadas do `constitution.md`)

- Nunca hardcode secrets, tokens ou credenciais
- Nunca query sem filtro `tenant_id` em projetos multi-tenant
- Nunca rota pública sem prefixo `/v[N]/`
- Nunca migration sem rollback pareado
- Nunca merge sem Semgrep + npm audit limpos
- Em caso de ambiguidade: pare, sinalize, aguarde confirmação

---

## Localização dos artefatos principais

```
.sdd/
  memory/
    constitution.md     ← lei máxima
    spec.md             ← o quê e por quê
    plan.md             ← como e roadmap
    overview.md         ← contexto humano
    handoff.md          ← resumo Fases 1–5 (para Fase 6)
    ui-context.md       ← identidade visual (para agentes de UI)
    threat_model_stride.md
  reference/            ← processo completo do framework (ler POR SEÇÃO, nunca inteiro)
  mcp_config.json       ← governança MCP
  agent_config.py       ← sandbox deny-by-default

.agents/
  rules/                ← regras (00-core … 40-change-request) — zona somente leitura
  workflows/            ← /escopo /sprint /quick-fix /change-request /status … (Antigravity)

.claude/skills/         ← skills do Claude Code (arquitetura, sprint, carga-dados…)

docs/
  adr/                  ← Architecture Decision Records
  releases/             ← Release governance
  threat_model_stride.md
  api-contract.md
  event-catalog.md

db/migrations/          ← scripts DOWN (rollback) pareados por timestamp com o UP
assets/brand/           ← logo e identidade visual

.semgrep/
  fitness.yml           ← Fitness Functions arquiteturais
```
