# plan.md — Como & Roadmap (UniFafire · Sistema de Gerenciamento de Chaves)

> Perspectiva de engenharia. Gerado na Fase 6. Toda mudança de escopo passa antes
> pelo Changelog do `spec.md`. Decisões não-óbvias registradas na §2.

## 1. Stack Aprovada

> A tabela nasceu na Fase 5 descrevendo o legado mantido como baseline. O **ADR-012**
> (aprovado em 2026-09-02) a substitui por etapas; a coluna "Observação" registra em que
> ponto cada camada está. Camada já virada = a linha vale como está. Camada ainda em
> transição = o legado continua vigente até a Etapa 7 (constitution §0).

| Camada | Tecnologia | Observação |
|---|---|---|
| Full-stack | Next.js (App Router) + React 19 + TypeScript | já em produção local |
| Banco | **Postgres (Supabase, `sa-east-1`) via `pg`** — ver D-09 | ✅ virado na Sprint 21 (Etapa 4). `src/lib/db.ts` apagado; nada em `src/` importa `better-sqlite3`, que virou devDependency das ferramentas offline (`db/migrate.mjs`, `db/load-pg.mjs`). Parâmetro vinculado `$n` obrigatório; **sem prepared statement nomeado** (transaction mode) |
| Auth | JWT (`jose`, HS256) em cookie + **`bcryptjs`** — ver D-10 | ✅ segredo em `.env` desde a Sprint 1; addon nativo trocado na Sprint 21 (TASK-071), mesmo formato de hash |
| Validação | Zod (`src/lib/schemas.ts`) | fonte única de schemas e RBAC |
| Jobs | ~~node-cron~~ → **GitHub Actions** | ✅ `node-cron` neutralizado na Sprint 21 e **removido do `package.json` na Sprint 24** (TASK-084), junto com `src/instrumentation.ts`: a função sobrevivente só gravava um log dizendo que não fazia nada, e produzia 87% das linhas de `app_logs` em produção. Agendamento real: `backup.yml` e `keepalive.yml` |
| Sincronismo | **`@supabase/supabase-js`, e SÓ para o canal Realtime** (Sprint 25, TASK-072) | ✅ O cliente **não lê tabela**: assina um sinal vazio e a tela refaz a busca pelas rotas autenticadas. `postgres_changes` está FORA — ele autoriza por RLS, e abrir RLS para `anon` exporia as tabelas à chave anônima que vai no bundle (§3.2). O acesso a dados continua sendo `pg` |
| UI | CSS nativo estruturado + tokens do `ui-context.md` + react-hot-toast | sem migração para shadcn — ver D-03 |
| Hospedagem | **Vercel** (ADR-012) | ✅ **NO AR desde 2026-09-06** — https://projeto-uni-fafire.vercel.app. O aparato local (PM2, `.bat`, `ecosystem.config.js`, `show-ip.js`, `/api/server-info`) foi removido na TASK-079. Saúde em `/api/health`; passo a passo em `docs/runbook-deploy.md` |
| Testes | Vitest (unit/integração, **contra Postgres real em container** — ver D-11) + Playwright (E2E smoke) | ✅ container na Sprint 21: `npm run test:db:up`. `globalSetup` reproduz a baseline da plataforma Supabase e aplica `db/migrations-pg/` |
| Qualidade | ESLint + `npm audit` (gate de release) | Semgrep opcional |

## 2. Decisões e Justificativas

| Decisão | Alternativa descartada | Motivo da escolha |
|---|---|---|
| D-01: Manter SQLite/better-sqlite3 | PostgreSQL via Supabase (stack padrão PME) | Sistema single-instance em intranet, sem SaaS/multi-tenant; volume baixo; zero dependência de internet; migração adicionaria risco sem benefício |
| D-02: Manter PM2 em servidor local | Vercel + Railway | Requisito do cliente: rodar na rede interna, sem exposição externa; operação já dominada pela equipe |
| D-03: Manter CSS nativo estruturado do legado | Reescrever UI em shadcn/ui + Tailwind | `ui-context.md` já extraiu tokens do legado; reescrita visual é retrabalho sem valor de negócio na fase de estabilização |
| D-04: Segredo JWT em `.env` local | Doppler (default do framework) | Servidor sem dependência de serviço externo; um único secret; `.env` fora do git atende o risco real |
| D-05: Rate limit/lockout em memória | Upstash Redis | Instância única (PM2, 1 processo) — estado em memória é correto e suficiente; Redis adicionaria infra sem ganho |
| D-06: Estabilizar antes de criar features | Entregar features novas direto | Sistema "vibecodado": sessão sem expiração, senha fraca e ausência de testes são riscos ativos; baseline segura primeiro (handoff §Pontos de Atenção) |
| D-07: Migrações SQL manuais pareadas UP/DOWN em `db/migrations/` | Prisma Migrate | better-sqlite3 sem ORM no legado; introduzir Prisma agora = reescrita da camada de dados inteira; pareamento manual + teste em cópia do banco cumpre a constitution §4 |
| D-08: Vitest para testes | Jest | Suporte nativo a TS/ESM no Next.js moderno, execução mais rápida, menos configuração |
| D-09: `pg` (node-postgres) como driver | `postgres` (porsager); `@supabase/supabase-js` | Driver de referência do Postgres em Node e o que a documentação do Supabase assume. Funciona com o pooler em **transaction mode**, exigido por execução serverless. `postgres` é mais leve mas sua API de template tags esconde onde o parâmetro entra — o oposto do que se quer sob §1.3. `supabase-js` fala PostgREST, e a TASK-065 revogou `anon`/`authenticated` de propósito: a autorização deste sistema é a sessão da §3.2, não o JWT do Supabase. ⚠️ Transaction mode não suporta prepared statement **nomeado** — toda consulta usa `query(texto, valores)` sem `name`. Isso não afrouxa §1.3: `$n` é parâmetro vinculado. (Sprint 21 · TASK-068) |
| D-10: `bcryptjs` no lugar de `bcrypt` | Manter o addon nativo | Addon nativo compila contra o Node do ambiente — em build serverless, falha por ABI incompatível ou binário ausente. Mesmo formato de hash: os hashes gravados continuam validando, sem reset de senha. Custo: mais lento, irrelevante para ~19 usuários. (Sprint 21 · TASK-071) |
| D-11: Postgres real em container para os testes | SQLite em memória (duplo dialeto); schema de teste no próprio Supabase | Decisão pendente das Etapas 3–7, resolvida pelo usuário em 2026-09-03 conforme a recomendação do ADR-012. Testar contra dialeto diferente do de produção anularia a garantia justamente na sprint que reescreve 162 chamadas, e não exercitaria os triggers PL/pgSQL nem o `set_config` da TASK-065. Schema no Supabase dependeria de rede a cada execução e compartilharia o projeto com os dados carregados. (Sprint 21 · TASK-068) |

## 3. Roadmap — 6 Sprints de Estabilização

> Formato: TASK-NNN → REQ vinculado. Critérios BDD detalhados serão gerados no
> `tasks-[sprint].md` (Fase 9). Fluxo TDD: red → green → refactor.

> ⚠️ **Reconciliação 2026-07-02 (ADR-002):** as Sprints 4–6 abaixo **não foram executadas
> conforme planejado**. O agente de sprint entregou escopo diferente, sem Change Request
> (registrado retroativamente como REQ-017–020 no spec.md v1.2), reutilizando os números
> TASK-013–021 com outro significado nos `tasks-sprint-4/5/6.md`. As tasks planejadas e
> não entregues foram reagrupadas na **Sprint 7 — Dívida de Estabilização** (§4).
> A numeração canônica de tasks é a deste arquivo; trabalho novo começa em TASK-029.

### Sprint 1 — Segurança de Sessão e Credenciais (crítica)
- TASK-001 → REQ-011: `JWT_SECRET` persistente via `.env` + `.env.example`; falha explícita no boot se ausente em produção.
- TASK-002 → REQ-011: expiração de sessão (7d absoluta, 24h idle) + cookie `httpOnly`/`sameSite`.
- TASK-003 → REQ-012: política de senha 8+ em criação/troca/reset (Zod).
- TASK-004 → REQ-012: lockout 5 tentativas/15 min (conta + IP) e rate limit 30 req/min em `/api/auth/*`, dirigidos por `security-profile.ts`.
- TASK-005 → REQ-001: login não revela existência de usuário (mensagem única) — verificação + teste.

### Sprint 2 — Identidade de Sessão e Conta
- TASK-006 → REQ-013: identidade de sessão no shell (nome + papel + menu do usuário) conforme `ui-context.md`.
- TASK-007 → REQ-013: rota `/account/profile` (editar dados próprios).
- TASK-008 → REQ-013: rota `/account/security` (trocar senha; logout everywhere ao trocar).

### Sprint 3 — Rede de Testes (gate para tudo que vem depois)
- TASK-009 → REQ-015: setup Vitest + banco SQLite efêmero de teste + seeds (1 usuário por papel — constitution §strict seed).
- TASK-010 → REQ-015: testes de integração de auth (login, lockout, sessão expirada).
- TASK-011 → REQ-015: testes do ciclo retirada → confirmação → devolução (REQ-003/004) incluindo cancelamento.
- TASK-012 → REQ-015, REQ-002, REQ-007, REQ-008: testes de RBAC por rota (matriz papel × endpoint, cobrindo keys, users, settings, history, logs e backups).

### Sprint 4 — Hardening de Operações Destrutivas e RBAC
- TASK-013 → REQ-014: `history/clear` e `clear-database` restritos a ADMIN + log de auditoria prévio + modal destrutivo na UI; atualizar `threat_model_stride.md`.
- TASK-014 → REQ-010: revisão de cobertura do log de auditoria (toda ação administrativa gera entrada; nenhum dado sensível logado).
- TASK-015 → REQ-002/007: varredura de todas as rotas de API confirmando validação de sessão + permissão server-side (matriz da TASK-012 como oráculo).

### Sprint 5 — Dados, Migrações e DR
- TASK-016 → REQ-009: estrutura `db/migrations/` UP/DOWN pareados + script de aplicação com teste em cópia do banco.
- TASK-017 → REQ-009: verificação automática do backup diário (métrica "confiabilidade do backup" logada) + teste de restauração documentado.
- TASK-018 → REQ-005: constraint/verificação de imutabilidade do histórico no nível do banco (sem UPDATE/DELETE de transação fora do fluxo ADMIN do REQ-014).

### Sprint 6 — Observabilidade e Fechamento da Baseline
- TASK-019 → §7 constitution: logger estruturado com máscara de dados sensíveis + severidades; tempo de resposta das rotas críticas.
- TASK-020 → §5 spec: métricas de negócio no dashboard (taxa de dupla confirmação, chaves em atraso, tempo de balcão).
- TASK-021 → REQ-006: alerta visual de chaves em atraso (> 12h) no dashboard.
- TASK-022: runbook de operação (`docs/runbook.md`): iniciar/parar PM2, restaurar backup, RPO/RTO, responsável.

## 4. Backlog — Próximas Sprints

### Aberta por Change Request — Runner de migrations (CR Tipo D · ADR-021)
> Sem sprint atribuída. **A ordem não é preferência**: a 102 é a que pode quebrar produção
> e depende da 101; a 104 é a única que não pode vir primeiro.
- **TASK-101 → o runner.** Aplicação idempotente e ordenada por prefixo, registro em tabela PRÓPRIA (não o ledger do Supabase) escrito na MESMA transação da migration, e um comando de conferência: arquivos × registro × schema. Falha ruidosa e para na primeira que não aplicar. Migration UP/DOWN para a tabela de controle.
  > Por que registro próprio e não o do Supabase: aplicar SQL pelo editor não escreve no ledger e nada avisa. Disputar com ele é perder; o que se pode ter é um registro que só existe se a migration foi aplicada por quem sabe escrevê-lo.
- **TASK-102 → a ADOÇÃO, e é o passo perigoso.** As sete migrations já aplicadas têm de ser marcadas como tal SEM reexecutar. O registro nasce vazio e o banco não: sem isso o runner tenta reaplicar, e a primeira a rodar duas vezes é um `ALTER TABLE ADD COLUMN` que falha — ou pior, um `CREATE TRIGGER` que duplica.
  > ⚠️ **Verificado contra uma base RESTAURADA DO BACKUP**, não contra uma vazia. Base vazia não exercita o caminho real, que é justamente "o banco já tem tudo e o registro não sabe".
- **TASK-103 → a aplicação verifica pendências ao subir e AVISA.** Nunca aplica. Aplicar schema no boot de função serverless é várias instâncias correndo o mesmo DDL em paralelo, e um `ALTER TABLE` que falha pela metade em produção é pior que a janela que se quer fechar.
- **TASK-104 → a §4.1 passa a descrever `db/migrations-pg/*.up.sql` e a exigir o registro.** SÓ depois de 101–103 no ar: emendar antes deixaria a lei descrevendo algo que ainda não existe, que é exatamente o defeito que ela veio corrigir.


### Emenda de constitution — a §3.2 nomeia a FRONTEIRA (CR Tipo D · ADR-020) ✅
> Aprovada pelo usuário em 2026-09-08 e **aplicada**. Sem task de código: as três páginas
> foram corrigidas na Sprint 27 e a guarda existe desde então — o que faltava era a letra.
> A cláusula dizia "toda **rota de API**", e as três falhas do ADR-015 estavam em Server
> Components, onde **não há 403 possível** porque não existe handler no caminho. O novo
> texto fala em fronteira e nomeia os dois casos: lista enumerada envelhece, e a próxima
> superfície que o framework inventar nasceria fora dela.

### Aberta por Change Request — Higiene de carga e deploy (CR Tipo C · ADR-019)
> Sem sprint atribuída. Quita o débito de limpeza registrado desde a TASK-079.
- **TASK-099 → `jspdf` carrega sob demanda em `/history`.** Hoje o import é ESTÁTICO num componente de cliente, e o chunk que o contém tem **459 KB — o maior do app**, baixado por todo mundo que abre a tela, tenha ou não intenção de exportar. `await import()` no handler tira isso do carregamento inicial.
  > Critério de aceite é NÚMERO: o chunk com jsPDF fora do grafo de carregamento inicial de `/history`. E precisa de indicação visual no clique, senão o botão parece morto enquanto baixa.
- **TASK-100 → higiene de dependências, arquivos e deploy.** `server-only` sai (zero importações); `@types/pg` vai para `devDependencies` (é tipo). Saem dez arquivos mortos: oito scripts que abrem `keys.db` com `better-sqlite3`, `scripts/replace_colors.js` sem referências, e `tests/forgot-password.test.ts`, cujo corpo é `expect(true).toBe(true)`. Entra `.vercelignore` — ~1,47 MB de 4,1 MB (35%) sobem hoje sem o build ler.
  > ⚠️ **Duas guardas, e a segunda é a que importa:** (a) nenhum arquivo de `scripts/` pode mencionar `better-sqlite3` ou `keys.db`, senão o próximo script legado nasce igual; (b) **nenhum caminho excluído do deploy pode ser referenciado por `src/`** — excluir diretório é seguro hoje, e o dia em que alguém importar de `db/` num Server Component o build local passa e a PRODUÇÃO quebra. É a mesma classe de falha da migration da TASK-093, registrada no runbook §4.2.
  > A contagem da suíte cai de 491 para 490. É melhora, não regressão.
  > **Fora desta task, registrado:** três majors pendentes — `typescript` 5→7, `eslint` 9→10, `vitest` 4→5. Mudam regras e diagnósticos; misturá-las com limpeza tornaria impossível dizer o que quebrou o quê.

### Aberta por Change Request — Usabilidade e fim de sessão (CR Tipo C · ADR-018)
> Sem sprint atribuída. Quatro tasks, e **a ordem importa**: a 095 primeiro, porque é ela
> que transforma o relato em dado; a 097 depois da TASK-094, senão mexe num card prestes a mudar.
- [x] **TASK-095 → o fim de sessão entra na trilha, com motivo.** ✅ **FEITA em 2026-09-08.** Lista fechada de motivos (o cliente escolhe, não escreve — `action_logs` é imutável); sem sessão verificável não registra; e o registro nunca impede alguém de sair. Verificado no navegador nos DOIS caminhos, com o automático exercitado de verdade (horário posto 90 s à frente, timer disparou sozinho no cruzamento). **Isso provou de quebra que o mecanismo das 18:30 FUNCIONA** — a hipótese 1 do ADR-018 deixa de ser especulação sobre um mecanismo talvez inerte. ⚠️ Entrega o INSTRUMENTO, não a resposta: é preciso deixar rodar em produção alguns dias. (Tipo B — lacuna do REQ-010.) `POST /api/auth/logout` não chama `logAction`: o login entra na trilha e a saída não, nem a manual, nem a automática das 18:30, nem a expiração. Uma trilha que registra entradas e não saídas descreve metade do que aconteceu.
  > ⚠️ **É esta task que destrava a decisão da §2.2.** Hoje "a sessão cai demais" é relato: os LOGIN_SUCCESS de produção têm um intervalo de ~32 h (cabe no idle de 24 h) e outro de ~17 h (não deveria ter derrubado nada). Três hipóteses compatíveis — logout das 18:30 numa aba aberta, cookies separados do PWA no iOS, idle — e nenhuma verificável sem o registro da saída.
  > ⚠️ Ao escrever o ADR quase concluí "não há registro de LOGOUT, logo o automático nunca disparou". A ausência é do INSTRUMENTO, não do evento.
- **TASK-096 → `<Link>` com prefetch e `loading.tsx` por rota.** Nenhuma rota tem loading boundary hoje, e todas são dinâmicas (leem o cookie): sem boundary, a tela anterior fica PARADA até o servidor responder, e parece travamento. O menu ainda navega com `router.push()`, que não faz prefetch. As duas se reforçam — com `loading.tsx` presente, o prefetch de rota dinâmica busca só até o boundary.
  > O critério de aceite é NÚMERO, não "parece mais rápido" — mesmo padrão do ADR-016. E as requisições têm de ser observadas: prefetch aumenta tráfego, o plano é gratuito, e o REQ-032 nasceu de um desenho que projetava ~10,5 mi de requisições/mês.
- **TASK-097 → tela de Configurações reequilibrada.** **Depende da TASK-094**, que remove o campo da senha padrão e deixa o card "Sistema e Segurança" com um item só. Entram: estado da atualização em tempo real (sinal conectado ou polling largo — a resposta para "por que a tela demorou a mudar"), botão de rever tutorial, e a zona destrutiva separada (hoje "Limpar Banco de Dados" é um botão vermelho no meio da tela, com o mesmo peso de um campo de horário).
  > ⚠️ **NÃO entra painel de sistema** — versão, host, uptime, contagens, região. A TASK-079 removeu `/api/server-info` exatamente por isso: cada campo é reconhecimento gratuito. A resposta óbvia a "adicionar elementos do sistema" já foi rejeitada uma vez neste projeto.
- **TASK-098 → tutorial de primeiro acesso, pt-BR, por papel.** (Tipo A — feature nova.) PORTEIRO precisa aprender o balcão; ALUNO precisa saber onde vê as próprias chaves e como confirmar — o mesmo tutorial para os dois ensina a pessoa errada. O "já viu" vai em **coluna de `users`, não `localStorage`**: a pessoa é a mesma em qualquer aparelho, e no computador compartilhado do balcão o `localStorage` erra nos dois sentidos. Pulável, navegável por teclado, e não pode bloquear a primeira retirada de chave.

> ⚠️ **DECISÃO TIPO D EM ABERTO — persistência de sessão.** Aumentar o idle de 24 h ou o
> absoluto de 7 dias emenda a §2.2 e afrouxa um controle de segurança para TODOS os
> usuários. Fica gated na TASK-095, por decisão do usuário em 2026-09-08: se a causa for o
> logout das 18:30 (que não tem requisito nenhum por trás) ou o cookie separado do PWA,
> **não há §2.2 a emendar**. Candidata registrada para depois da medição: "manter
> conectado" opcional, que deixa o balcão compartilhado no padrão curto e o celular
> pessoal no longo, com consentimento explícito.

### Aberta por Change Request — Código de uso único no reset (CR Tipo C · ADR-017)
> Sem sprint atribuída. Fecha pela raiz a fragilidade que a TASK-087 registrou e não pôde
> resolver. 🔴 **crítica**: mexe no caminho de login, que é o Fluxo 1 da spec §4.
- **TASK-093 → o código de uso único.** ADR-017. Migration UP/DOWN com `reset_code_hash` e `reset_code_expires_at` — **colunas próprias, não o `password_hash`**: código guardado em campo de senha é lido depois como senha, e o primeiro leitor a tratá-lo assim reabre a janela que este ADR fecha. Geração no reset **e na criação de usuário** (hoje todo usuário novo nasce com a mesma senha conhecida), validação e consumo no login, e o código devolvido UMA vez na resposta ao ADMIN. O código **nunca** entra em log — a §7.1 proíbe senha, e o código precisa da proibição explícita porque não é senha e alguém pode concluir que está liberado.
  > A cobertura tem de incluir o login de quem **não** está em reset. O caminho é o Fluxo 1 da spec §4 ("não pode falhar"), e o risco real desta task é regredi-lo enquanto se conserta outra coisa.
- **TASK-094 → a senha compartilhada sai.** `settings.default_reset_password`, o campo da tela de Configurações, `SENHA_PADRAO_RESET`, o `defaultResetPassword` do `GET`/`POST /api/settings` e a entrada correspondente em `docs/api-contract.md`.
  > ⚠️ **E invalida as contas com reset pendente.** Quem está com `requires_password_change = true` tem no `password_hash` o hash da senha compartilhada; remover a configuração não apaga isso, e a conta continuaria aberta a quem conhece o valor antigo — agora sem nada na tela que denuncie. Verificar quantas são no momento da implementação: provavelmente nenhuma, mas "provavelmente nenhuma" não é um plano.
  > Depende da TASK-093: sem o código, remover a senha compartilhada deixa o sistema sem nenhum caminho de reset.
  > Resolve junto a pendência operacional do `default_reset_password = "trocar123"` em produção — a linha deixa de existir, em vez de ser corrigida à mão.

### Aberta por Change Request — Região da função (CR Tipo C · ADR-016 · REQ-032)
> Sem sprint atribuída. Entra pelo ciclo TDD normal. É a **segunda e maior** das duas causas
> que a medição de 2026-09-07 apontou; a primeira caiu na TASK-091.
- [x] **TASK-092 → REQ-032: fixar `regions: ["gru1"]` em `vercel.json`.** ✅ **FEITA em 2026-09-08, e o critério de aceite foi cumprido: o número caiu** — 249 ms → 19 ms, medido em produção depois do deploy. Registro completo na Sprint 25, seção da medição. ADR-016. Hoje a função executa em `iad1` (Washington) com o banco em `sa-east-1` (São Paulo), e cada ida ao banco custa **249 ms** — medido em duas rotas nas mesmas condições, e idêntico na mediana e no mínimo, que é assinatura de distância. Em arquivo e não no painel: configuração que só existe no painel não aparece em revisão de PR e some se o projeto for recriado — foi assim que a região errada passou dois meses sem ninguém notar. O teste deve reprovar a ausência do arquivo **e** a alteração silenciosa da região.
  > ⚠️ **O critério de aceite não é o arquivo existir, é o número cair.** A verificação tem de repetir a medição com `scripts/medir-req032.mjs` depois do deploy e registrar o resultado aqui, ao lado do antigo. Se os 249 ms não desaparecerem, a hipótese estava errada e o ADR-016 precisa ser revisto — não o número, escondido.

### Sprint 7 — Dívida de Estabilização (reconciliação ADR-002 — EXECUTAR ANTES do mobile)
> Tasks planejadas nas Sprints 4–6 originais e não entregues. Prioridade máxima: contém
> violações ativas de constitution. Detalhamento BDD em `docs/tasks-sprint-7.md`.
- TASK-029 → REQ-009 (ex-TASK-016): estrutura `db/migrations/` UP/DOWN pareados + script de aplicação com teste em cópia do banco; migrações legadas de `scripts/` documentadas como baseline.
- TASK-030 → REQ-005 (ex-TASK-018): imutabilidade do histórico no nível do banco (triggers), com bypass explícito e documentado apenas para o fluxo ADMIN do REQ-014.
- TASK-031 → REQ-014 (ex-TASK-013 parcial): registro prévio e persistente da operação `clear-database` (hoje apaga a trilha de auditoria sem logar nada) + criar `docs/threat_model_stride.md`.
- TASK-032 → REQ-009 (ex-TASK-017): verificação automática do backup diário — métrica "confiabilidade do backup" logada e consultável.
- TASK-033 → §7 constitution (ex-TASK-019): logger estruturado com severidades + máscara de dados sensíveis + tempo de resposta das rotas críticas.
- TASK-034 → REQ-006 / spec §5 (ex-TASK-020/021): métricas de negócio no dashboard (taxa de dupla confirmação, tempo de balcão) + alinhar threshold de atraso ao spec (12h; hoje 4h hardcoded).
- TASK-035 → REQ-015: reativar os 4 testes desativados (`src/lib/*.test.old`) adaptando à arquitetura atual.
- TASK-036 → DR / constitution §4 (ex-TASK-022): `docs/runbook.md` — PM2, restauração de backup testada e documentada, RPO 24h/RTO 4h, responsável.

### Sprint 8 — Responsividade Mobile (CR 2026-07-02, Tipo C — REQ-016, ADR-001; ex-Sprint 7)
> Tasks tipo Refactor. Implementação dentro do CSS nativo (D-03 mantida), tokens do
> `ui-context.md`. Detalhamento BDD em `docs/tasks-sprint-8.md`. Alvo: funcional a partir de 360px.
- TASK-023 → REQ-016: layout base responsivo — breakpoints documentados em `globals.css`, shell/navegação mobile (menu do usuário e navegação colapsáveis em telas pequenas).
- TASK-024 → REQ-016: `/login` e `/confirm` mobile-first — fluxo do portador (funcionário/aluno) no celular; alvos de toque ≥ 44px.
- TASK-025 → REQ-016: dashboard (`/`) — cards de chaves emprestadas/disponíveis, pendências e alertas adaptados a telas pequenas.
- TASK-026 → REQ-016: telas de listagem (`/history`, `/logs`, `/users`, `/keys`) — padrão tabela→card em viewport estreito, mantendo filtros e ações.
- TASK-027 → REQ-016: formulários e modais (`/settings`, `/account/profile`, `/account/security`, modais de confirmação destrutiva) adaptados a touch.
- TASK-028 → REQ-015/016: E2E smoke Playwright dos 4 fluxos críticos (spec §4) com viewport mobile 375×812, somado ao viewport desktop.

### Sprint 10 ✅ — Transferência de Chaves e Consolidação de Logs (CR 2026-07-06, Tipo C)
- ~~TASK-037 → REQ-022: Criar endpoint e interface para transferência direta de chave emprestada (com observação opcional).~~
- ~~TASK-038 → REQ-022: Adaptar queries de `/history` para refletir e exibir eventos de transferência de chaves corretamente.~~
- ~~TASK-039 → REQ-023: Refatorar página `/logs` consolidando as abas redundantes em uma visão unificada.~~
- ~~TASK-040 → REQ-024: Adaptar API e frontend para permitir transferência iniciada por usuário comum (requer dupla confirmação entre o remetente e o destinatário).~~
- ~~TASK-041 → REQ-025: Ajustar API e UI (`/confirm`, Dashboard) para que o remetente (initiator) visualize e possa cancelar transferências pendentes.~~

### Sprint 11 🏃‍♂️ — UI/UX Mobile (CR 2026-07-06, Tipo C)
- ~~TASK-042: Transferência no Mobile (REQ-026)~~
      *Adaptar a view de cards (mobile) no DashboardClient para incluir o botão/ação de Transferir chaves.*

### Sprint 12 ✅ — Solicitação de Chave em Uso (CR 2026-07-06, Tipo C — REQ-027, ADR-008)
> Fluxo "pull": não-portador solicita a chave diretamente ao portador. Reutiliza a máquina
> de `transfer` (papéis invertidos) — sem migration. Detalhes de modelagem no ADR-008.
- ~~TASK-043 → REQ-027: API — criação da solicitação (transfer com `user_id` = solicitante já confirmado e `porteiro_id` = portador pendente) + `user-confirm` aceitando a contraparte por `tx.porteiro_id === session.id` (autorização estrita, com teste de regressão).~~
- ~~TASK-044 → REQ-027: UI — ação "Solicitar esta chave" no card mobile e na linha desktop para não-portadores; estado "já solicitada"; aceite/recusa pelo portador em `/confirm` com texto contextual.~~
- ~~TASK-045 → REQ-027: e2e smoke desktop/mobile.~~ *Consolidada na TASK-044: o `tests/e2e/pull-flow.spec.ts` (test-first) roda nos dois viewports via projects do Playwright, cumprindo o smoke. Os testes unitários do fluxo pull vivem em `tests/transactions.test.ts` (TASK-043).*

### Sprint 13 ✅ — Devolução Forçada Ampla e Clareza Mobile (CR 2026-07-07, Tipo C — REQ-028, ADR-009)
> Mudança em feature entregue (mobile/bypass). Sem migration (coluna `justification` já existe).
> Aproveita o WIP de responsividade CSS-driven (`.mobile-only`/`.desktop-only`) já iniciado.
- ~~TASK-046 → REQ-028: API — devolução forçada de qualquer chave em uso por porteiro/admin, com justificativa obrigatória informada no ato (não herdada) e log de auditoria; test→feat.~~
- ~~TASK-047 → REQ-028: UI mobile — botão "Devolver" no card (portador/portaria) + campo de justificativa na devolução forçada + estados claros; consolida o refactor CSS-responsivo; `withdraw_justification`/`in_use_since` no SSR; test (e2e) → feat.~~

> **Achados fora de escopo (registrados, não corrigidos nesta sprint):**
> - `keys.db` está rastreado no git (viola constitution §4.5) — deveria ser `git rm --cached` + `.gitignore`.
> - ~~Visão porteiro/desktop do Dashboard gera scroll horizontal (viola REQ-016)~~ — **quitado (2026-07-08, branch claude/keen-yonath-349772):** causa real era o tooltip decorativo invisível vazando além da viewport + botões estourando a coluna de Ações; corrigido com `overflow-x: clip` + flex-wrap e coberto por e2e de regressão (`no-horizontal-scroll.spec.ts`).

### Sprint 14 ✅ — Fluxo Unificado do Dashboard (CR 2026-07-09, Tipo C — REQ-029, ADR-010)
> Mudança em features entregues (REQ-021, REQ-016 e UI de REQ-003/004). Sem migration.
> Origem: re-crítica UI/UX dual-agent (snapshots `.impeccable/critique/` de 2026-07-08/09).
> Somente UI + 1 query de métrica — endpoints de transação e máquina de dupla confirmação intocados.
- ~~TASK-048 → REQ-029a: campo único busca+ação no desktop — filtra a lista em tempo real e age no Enter; remove o input de busca duplicado; seletor por linha permanece como caminho de mouse. test (e2e teclado)→feat.~~
- ~~TASK-049 → REQ-029b: painel de pendências inline no topo do Dashboard, confirmar/cancelar reutilizando os endpoints de `/confirm` (pending/user-confirm/cancel); `/confirm` permanece como visão completa. test→feat.~~
- ~~TASK-050 → REQ-029c: `/api/metrics/frequent-keys` ramifica por papel (portaria = frequência global, comum = própria); UI mostra chips para o porteiro no mobile. test (vitest)→feat.~~
- ~~TASK-051 → REQ-029d: light mode integral — sidebar tematizada no modo claro (AA/AAA medido; fallback dark do ADR não foi necessário); login respeita o tema salvo; decisão documentada no DESIGN.md. test (e2e)→feat.~~

### Sprint 15 🏃‍♂️ — Melhorias de Dashboard UX (CR 2026-07-18, Tipo C — REQ-030, ADR-011)
- [x] TASK-052 → REQ-030: Reordenar as abas no `DashboardClient.tsx`. Definir "Minhas chaves" como primeira aba (e ativa por padrão) caso o usuário tenha esse acesso; seguida por "Disponíveis", "Em uso" e "Todas".

### Sprint 16 🏃‍♂️ — Correções Críticas Pré-Nuvem (Etapa 1 da migração Supabase/Vercel)
> Origem: análise de viabilidade da migração para Supabase + Vercel (2026-09-02).
> Defeitos que hoje não aparecem porque o sistema roda em rede local, e que se
> tornam bloqueadores ao publicar na internet. Executada ANTES da mudança de stack,
> de propósito: valem por si mesmas mesmo que a migração não avance.
- [x] TASK-053 → lockout por conta, não por endereço de rede. `checkLockout` contava falhas com `username = ? OR ip = ?` no mesmo limiar de 5; no NAT do campus todos compartilham um IP público e cinco erros de senha de uma pessoa trancariam todos por 15 min. Limiar separado por IP (50) preserva defesa contra varredura de usernames. `clearLoginAttempts` deixa de apagar por IP. test→fix.
- [x] TASK-054 → rate limit sai do `Map` em memória para a tabela `rate_limit_hits`. Em serverless cada instância tinha o seu contador, zerado a cada cold start. `hit_at` em epoch ms — comparável por faixa em SQLite e Postgres. Migration UP/DOWN pareada. test→fix.
- [x] TASK-055 → fuso na auditoria. Filtros de dia/mês/hora comparavam o valor cru em UTC contra a hora exibida ao operador; movimentações entre 21h e a meia-noite local caíam no dia seguinte. Passam a faixa `[início, fim)` UTC (também sargável, preparando a Etapa 3). Normaliza as 6 linhas de `history` gravadas no formato do `CURRENT_TIMESTAMP`, que o JavaScript lia como hora local e exibia 3h adiantadas. Exibição presa a `America/Recife` via `APP_TIMEZONE`. test→fix.

> **Ação de deploy pendente:** aplicar `node db/migrate.mjs up` no `keys.db` de produção
> (migrations `202609021700_rate_limit_hits` e `202609021800_normalize_history_timestamps`).
> A segunda foi validada em cópia do backup de 2026-07-06: 30/30 timestamps em ISO,
> triggers de imutabilidade intactos, `integrity_check` ok.

### Sprint 17 🏃‍♂️ — Filtros e Paginação do Histórico (Etapa 2 da migração)
> Maior ganho funcional do plano de migração e independente da mudança de stack:
> vale por si mesmo mesmo que as Etapas 3–7 não avancem.
- [x] TASK-056 → filtro por portador, chave e tipo de movimentação na trilha de auditoria. A tela só filtrava por data/mês/hora, deixando sem resposta "quem pegou a chave X?" e "o que o Fulano pegou?". Montagem da consulta extraída para `src/lib/history-query.ts` — testável contra o banco sem renderizar, e ponto único para a conversão assíncrona da Etapa 4. Ação validada contra vocabulário fechado; id não numérico descartado. test→feat.
- [x] TASK-057 → paginação renderizada. O servidor já paginava (`LIMIT 50`), mas `currentPage`/`totalPages` chegavam como prop e nunca eram usados: o histórico ficava preso aos 50 registros mais recentes sem sinal de que havia mais. Entregue junto da TASK-056 (filtro sem navegação de página é meia funcionalidade). Verificado no navegador: 131 registros em 3 páginas, 31 na última, botões desabilitados nos extremos, mobile em cards sem overflow.

### Sprint 18 ✅ — Determinismo de Render (higiene, fora do plano de migração)
> Detectado ao verificar a Sprint 17 no navegador. Não faz parte das 7 etapas da
> migração — é defeito pré-existente que a verificação expôs.
- [x] TASK-058 → eliminar render dependente do relógio no SSR. O componente é renderizado no servidor e de novo na hidratação; onde a saída dependia do relógio, o React acusava "Hydration failed" e descartava a árvore vinda do servidor. Corrida por natureza: sumia quando SSR e hidratação caíam no mesmo segundo, o que fazia o erro parecer ruído. Guard estático no fonte + regra de atraso tornada pura (`findDelayedKeys`). test→fix.

### Sprint 19 ✅ — Higiene Constitucional (pré-requisito das Etapas 3–7)
> Divergências entre a `constitution.md` e o código, achadas ao levantar o impacto do
> ADR-012. Não são causadas pela migração, mas todas caem na área que ela toca — e são
> justamente os mecanismos que deveriam proteger a virada. Ir para a internet com eles
> inertes é o pior momento possível, então vêm ANTES da Etapa 3.
- [x] TASK-059 → **Gate 2 de migrations passa a rodar de fato.** `scripts/ci-gates.sh` procura UPs em `supabase/migrations/*.sql` e `migrations/*.sql`; as migrações reais vivem em `db/migrations/`. Nenhum dos dois existe, então o gate imprime "Nenhuma migration encontrada — pulando" e passa sempre — nunca reprovou nada. O pareamento está coberto por `tests/migrations.test.ts`, não pelo gate. Corrigir o caminho e provar que o gate REPROVA um UP sem DOWN. test→fix.
- [x] TASK-060 → **`APP_ENV` implementado** conforme constitution §8. A cláusula manda todo controle ler o perfil de ambiente de `src/lib/security-profile.ts`; não há uma ocorrência de `APP_ENV` no projeto e os controles usam constantes fixas. Implementar o perfil (`dev` | `production`) com o que §8 declara relaxável (lockout, rate limit) e o que nunca é. Default seguro: ausência de `APP_ENV` = `production`. test→feat.
- [x] TASK-061 → **`Retry-After` na resposta 429** (constitution §2.6). `login/route.ts:30` devolve 429 sem o header que a cláusula exige. Divergência de mesma classe que as anteriores, encontrada ao reescrever §2.6. test→fix.
- [x] TASK-062 → **nada a fazer no código — o registro é que estava errado.** Verificado com `git ls-files`: nenhum `.db`/`.sqlite` é rastreado hoje, e `git log --all -- keys.db` mostra a remoção já feita em `23c6bcd`, `2e83857` e `5874d62`. O débito no `plan.md` (e a divergência #3 do ADR-012, que o repetiu por confiar no registro em vez de verificar) estava obsoleto. **Pendência real remanescente:** o arquivo continua nos commits antigos do histórico; expurgá-lo exige reescrever história — decisão à parte, registrada abaixo.

### Sprint 20 ✅ — Etapa 3: Schema Postgres (ADR-012)
> Primeira sprint que toca a stack. Só começa com a Sprint 19 fechada.
- [x] TASK-063 → schema Postgres equivalente, com as conversões de dialeto mapeadas no ADR-012: `IDENTITY` no lugar de `AUTOINCREMENT`, `boolean` real, `timestamptz`, `json_build_object`, `RETURNING id` no lugar de `lastInsertRowid`, `ON CONFLICT DO NOTHING`.
- [x] TASK-064 → **índices** — o schema atual não declara nenhum. Mínimo: `history(timestamp DESC)`, `history(key_id)`, `history(user_id)`, `action_logs(timestamp DESC)`, `key_transactions(key_id, status)`, `key_transactions(user_id)`. Os filtros já foram tornados sargáveis na TASK-055.
- [x] TASK-065 → imutabilidade do histórico em PL/pgSQL + `REVOKE UPDATE, DELETE` (constitution §4.4). No Postgres fica mais forte que o trigger atual: o bypass de manutenção vira `set_config` com escopo transacional, dispensando a tabela-flag `_maintenance_mode`.
- [x] TASK-066 → consolidação de legado: `employees` está morta (0 linhas) mas ainda é `LEFT JOIN`ada; `keys` tem `employee_id` e `user_id` convivendo. Decidir e consolidar antes de carregar dados.
- [x] TASK-067 → carga dos dados de `keys.db` para o Postgres, com verificação de contagem por tabela. **Cópia, não movimentação** — o `keys.db` permanece íntegro (plano de reversão do ADR-012).

### Sprint 21 ✅ — Etapa 4: Camada de Dados Assíncrona (ADR-012)
> A maior das sete. A estimativa de 158 chamadas síncronas em 31 arquivos virou **162 em
> 28** na execução: `better-sqlite3` é síncrono por design e qualquer driver Postgres é
> assíncrono — não há adaptador que evite isso. Rede de segurança: a suíte de testes,
> agora rodando contra Postgres real em container (D-11).
- [x] TASK-068 → conexão via pooler (transaction mode). O proxy global e o `resetConnection()` de `src/lib/db.ts` não sobrevivem a instâncias efêmeras. Entregue como `src/lib/pg.ts`: `query`/`queryOne`/`execute`/`withTransaction`/`closePool`, tradução um-para-um do `.all()`/`.get()`/`.run()`, com **pool preguiçoso** (ver débito abaixo) e sem `name` em consulta alguma — transaction mode não suporta statement nomeado. Infra de teste junto: `docker-compose.test.yml` + `globalSetup` que reproduz a baseline da plataforma Supabase (papéis `anon`/`authenticated`) para que as migrations de `db/migrations-pg/` rodem no container **identicamente** à produção.
- [x] TASK-069 → conversão das consultas para assíncronas, incluindo os Server Components. Executada em **5 fatias por fronteira de execução** (não por pasta — ver lição abaixo): (a) módulos de `src/lib`, (b) autenticação e conta, (c) ciclo de vida das chaves, (d) demais rotas de API, (e) Server Components + `src/lib/history-query.ts`.
- [x] TASK-070 → transações explícitas com client dedicado, no lugar de `db.transaction(() => ...)`. O bypass da imutabilidade (`db-maintenance.ts`) deixou de ser uma linha numa tabela-flag e passou a ser `set_config(..., is_local = true)` — o Postgres o descarta no COMMIT/ROLLBACK, então não há estado que possa vazar. **`src/lib/db.ts` foi apagado** e nenhum arquivo de `src/` importa mais `better-sqlite3`, que virou devDependency (as ferramentas offline `db/migrate.mjs` e `db/load-pg.mjs` continuam usando).
- [x] TASK-071 → trocar `bcrypt` (addon nativo) por `bcryptjs`. `postinstall` (que rodava `npm rebuild better-sqlite3 && node scripts/init-db.js`) removido: quebraria o build da hospedagem.
- [x] **Fora do escopo original, decidido na execução:** `src/lib/backup.ts` e as rotas `backups/restore` e `backups/import` foram **neutralizados**, não convertidos. Backup por cópia de arquivo SQLite não tem equivalente em Postgres gerenciado, e `node-cron` exige processo de longa duração que não existe em execução serverless. `createBackup()` recusa explicitamente e as rotas devolvem 503, ambos citando a **TASK-078** (Etapa 7), que é a dona do desenho substituto. O 403 de não-ADMIN e a trilha de auditoria continuam antes da recusa. Agendar e nunca rodar seria pior do que não agendar.

> ## ⚠️ Reordenação aprovada em 2026-09-04
>
> **Objetivo declarado pelo usuário: fazer o sistema funcionar no Supabase + Vercel.**
> Não há migração de dados — o conteúdo do `keys.db` anterior era fictício. A Etapa 7 foi
> antecipada; Realtime (Etapa 5) é feature, não pré-requisito do go-live, e vai para o fim.
>
> **A Etapa 6 NÃO foi adiada junto, e o motivo é dela ser pré-requisito de verdade.**
> `structured-logger.ts:51` faz `fs.mkdirSync` + `fs.appendFileSync` em `logs/`. No Vercel
> o filesystem é efêmero e somente-leitura: a escrita falha, cai no `catch` e degrada para
> `console` — **sem derrubar nada e sem alarme.** A constitution §7 já tinha antecipado
> exatamente isso ("arquivo em `logs/` não serve à hospedagem serverless… a trilha se
> perderia"), e o REQ-031 nomeia **o log estruturado** no critério de aceite (d), junto com
> `history` e `action_logs`. Subir antes da TASK-074 seria reprovar o critério do próprio
> requisito que motiva a etapa — e do jeito mais traiçoeiro, com a aplicação parecendo bem.
> Por isso a TASK-074 sobe para a Sprint 22, e a TASK-075 acompanha a TASK-078, de que é
> dependente. A Etapa 6 deixa de existir como sprint e se dissolve nas duas primeiras.

### Sprint 22 ✅ — Etapa 7a: Pré-requisitos do Go-Live (ADR-012 · REQ-031)
> Tudo que precisa estar de pé ANTES de existir uma URL pública. Nenhuma destas é
> opcional: sem a 080 não se entra, sem a 074 a trilha se perde em silêncio, e a 076/077
> são o que separa "acessível pela internet" de "exposto na internet".
- [x] **TASK-080 → bootstrap do primeiro usuário ADMIN no Postgres. Precede a TASK-079: sem isto o sistema sobe inacessível.** REQ-001 + REQ-031. Numa base Supabase vazia não existe caminho para entrar — `scripts/init-db.js` só fala SQLite e saiu do `postinstall` na TASK-071, nenhuma migration de `db/migrations-pg/` insere usuário, e toda rota exige sessão (`/api/users` exige ADMIN). Desenho proposto — **script de operação, não rota**:
  - Vive em `db/` (junto de `migrate.mjs` e `load-pg.mjs`), fora do bundle da aplicação. Uma rota de bootstrap seria superfície de ataque permanente para um uso único; um script não é alcançável por HTTP.
  - **Recusa se `users` já tiver qualquer linha.** A garantia de "uma vez só" fica no estado do banco, não na disciplina de quem roda — mesma lógica pela qual o bypass da TASK-070 virou `set_config` transacional em vez de tabela-flag.
  - Senha inicial **nunca embutida e nunca padrão**: lida de variável de ambiente ou gerada aleatoriamente e impressa uma vez. O `admin`/`admin` do `init-db.js` nasceu numa intranet; aqui a exposição é pública (constitution §2).
  - Grava com `requires_password_change = true`. **Não inventa fluxo novo:** `login/route.ts:78` já devolve `REQUIRE_PASSWORD_CHANGE` (403) e força a troca na primeira entrada — caminho existente e testado.
  - Hash com `bcryptjs` (D-10), nunca o addon nativo. Registra a criação em `audit_logs`.
  - Teste contra o Postgres do container (D-11): cria numa base vazia; recusa numa base com usuário; a senha não aparece em log nem em `audit_logs` (constitution §6).
- [x] **TASK-074 → `structured-logger` passa a gravar em `app_logs`** (constitution §7), com `REVOKE UPDATE, DELETE`. `app_logs` fora de `tablesToClear` — é o destino que precisa sobreviver ao REQ-014. **Trazida da Etapa 6 por ser pré-requisito do deploy** (ver quadro acima). Cuidado de teste: a falha atual é silenciosa por design (`catch` → `console`), então o teste tem de provar que a linha chega em `app_logs`, não que a chamada não lançou.
- [x] TASK-076 → rotacionar `JWT_SECRET` com segredo aleatório real (o atual é UUID com sufixo, baixa entropia) e tornar `secure` incondicional no cookie (constitution §2.3).
- [x] TASK-077 → autorização com defesa em profundidade em `src/proxy.ts`, que hoje só renova cookie e deixa passar requisição sem sessão. Débito registrado desde a Sprint 9 como "tolerável em rede local; endereçar antes da exposição pública" — é agora.
- [x] **TASK-081 → a trilha de auditoria é esperada, não largada.** REQ-010 + REQ-031(d). Achado durante a TASK-076: **26 chamadas de `logAction` sem `await`**, em 12 arquivos. `logAction` grava em `action_logs` e chama `logStructured`, que a TASK-074 tornou assíncrono — e em execução serverless a instância pode congelar assim que a resposta sai, matando a escrita pendente. **Consequência direta: o que a TASK-074 entregou não se sustenta enquanto os chamadores soltam a promessa.** O critério daquela task ("a linha chega em `app_logs`") foi verificado e passa; o REQUISITO (trilha sem perda) não está cumprido. Além de corrigir os 26 pontos, deixar uma guarda mecânica — promise solta desta família não pode voltar em revisão humana.

### Sprint 23 ✅ — Etapa 7b: Backup e Deploy (ADR-012 · REQ-031)
- [x] TASK-078 → backup gerenciado + verificação por job agendado (constitution §4.3). O endpoint de restore por cópia de arquivo **já foi desativado na Sprint 21** (503 citando esta task); aqui entra o substituto. Peso revisto: não há dado real a perder hoje, mas §4.3 exige verificação, não existência.
- [x] TASK-075 → métrica de confiabilidade de backup deixa de ler `backups/backup-history.jsonl` e passa a ler do banco. **Trazida da Etapa 6 para junto da TASK-078**, de que é dependente: a fonte que ela lia deixou de ser escrita quando o `backup.ts` foi neutralizado.
- [x] TASK-079 → deploy e ping agendado contra a pausa por inatividade. **Remoção do aparato local revista:** não há mais "30 dias de retenção do PM2" a esperar — não existe servidor PM2 (ver Achados de 2026-09-04). Sai junto: `.bat`, `ecosystem.config.js`, `show-ip.js`, os scripts `dev`/`start` que o invocam, e a rota `/api/server-info`, que expõe IPs de rede local via `os.networkInterfaces()` — no Vercel ela devolveria endereços de container, informação sem sentido para o operador.

> **Fechada em 2026-09-04.** Entregue: `pg_dump` diário no GitHub Actions verificado por
> **restauração** (contagens **e esquema**) num Postgres descartável, com cada execução —
> inclusive a que falhou — gravada em `backup_runs`; a métrica de confiabilidade lendo o banco
> e distinguindo na tela quatro estados que antes eram um silêncio só; `/api/health` público e
> pobre de propósito, com ping diário contra a pausa do Supabase; o aparato local removido por
> inteiro; e `docs/runbook-deploy.md` escrito para quem não conhece o projeto.
>
> ⚠️ **O termo "backup gerenciado" no texto da TASK-078 acima está obsoleto** — o CR Tipo D
> `7770d2e` apurou que o plano gratuito do Supabase não tem backup gerenciado e a §4.3 foi
> corrigida. O alvo (RPO 24 h / RTO 4 h + verificação) não mudou; o meio virou `pg_dump`.
>
> **A sprint fecha SEM o sistema no ar, e isso é por desenho.** Criar o projeto na Vercel,
> cadastrar os secrets, criar o repositório privado de backup e aplicar as migrations no
> Supabase exigem credencial do usuário. Passo a passo em `docs/runbook-deploy.md`.

### Sprint 24 ✅ — Faxina da tela de configurações (CR Tipo C · ADR-013)
> Aberta pelo Change Request de 2026-09-06, depois do go-live. A tela `/settings` faz seis
> afirmações falsas, todas resíduo da topologia desmontada nas Sprints 21–23. **Nenhum
> requisito muda** — a tela passa a refletir o sistema que existe.
- [x] **TASK-084 → a trilha de auditoria para de ser inundada pelo próprio sistema.** ADR-013 (emenda de 2026-09-06), decisão 5. **Primeira da sprint.** Medido em produção duas horas após o go-live: 52 das 60 linhas de `app_logs` são `cron_desativado` — 87% da trilha. `src/instrumentation.ts` chama `startCronJobs()` a cada inicialização de instância, e a função existe apenas para gravar um log dizendo que não faz nada (resíduo da TASK-070). Em serverless, um cold start atrás do outro. A constitution §7.1 proíbe limpar `app_logs`, então o ruído é **permanente** e cresce para sempre num plano de 500 MB, dentro da tabela que existe para responder "o que aconteceu?" num incidente. Saem `startCronJobs()`, `src/instrumentation.ts` e a dependência `node-cron`.
- [x] **TASK-082 → a tela de configurações deixa de prometer o que o sistema não faz.** ADR-013, decisões 1 e 2. Saem: os campos "Horário do Backup" e "Retenção (quantidade de backups)" (gravados em `settings` e **nunca lidos** desde a TASK-070), o botão "Gerar Backup Agora" (503 desde a TASK-070), o card "Importar Banco (.db)" e as rotas `/api/backups/restore` e `/api/backups/import` (503 desde a TASK-068, e `.db` é SQLite, fora do runtime desde a Sprint 21). Entra no lugar: texto informativo com o estado real — backup diário às 03:00 (America/Recife) pelo GitHub Actions, retenção pelo histórico do repositório privado, e onde disparar manualmente. **Permanecem** o card de confiabilidade e a lista de execuções (TASK-075): eles leem `backup_runs`, que é fato. `docs/api-contract.md` acompanha a remoção das duas rotas.
- [x] **TASK-083 → o logout automático volta a disparar, e a senha padrão tem uma fonte só.** ADR-013, decisões 3 e 4. **Defeito vivo em produção:** `Sidebar.tsx` compara a hora corrente (`"14:35"`) com `settings.auto_logout_time`, cujo valor é `"30"` — a comparação nunca casa e o `<input type="time">` exibe vazio. O schema valida no POST, mas nada protege um valor herdado: a validação passa a valer também na **leitura**, com fallback explícito. E `default_reset_password` deixa de ter dois padrões — `GET /api/settings` devolve `'saojose123'` enquanto as rotas que aplicam a senha usam `'unifafire123'`; passa a existir uma constante só, consumida pelas três. Corrigir as linhas sintéticas de `settings` em produção é **operação**, não deploy: entra no runbook.

> **Lição registrada no ADR-013, e ela é reutilizável:** as quatro linhas de `settings` em
> produção vieram da carga sintética da TASK-067 e foram preservadas na limpeza do go-live
> sob o argumento de que eram "configuração, não dado sintético". O argumento estava errado,
> e é a causa direta do logout quebrado. **"Configuração" não é sinônimo de "legítimo"** —
> tabela de configuração povoada por seed carrega valor de teste para produção sem sintoma
> nenhum no momento da carga.

### Sprint 25 ✅ (código) — Etapa 5: Realtime (ADR-012 · REQ-032)
> Onde o requisito que motivou a migração é efetivamente entregue. **Adiada para depois do
> go-live por decisão de 2026-09-04:** é melhoria de experiência sobre um sistema que já
> funciona, não condição para ele funcionar. Até lá o polling de 3 s continua valendo.
>
> **Renumerada de 24 para 25 em 2026-09-06**, por decisão do usuário de executar a faxina
> da tela (ADR-013) primeiro. O número da sprint acompanha a ordem de execução; o vínculo
> com o ADR-012 é a **Etapa 5**, que não muda.
- [x] TASK-072 → substituir os 4 pollings de 3 s por assinatura Realtime. Critério de aceite do REQ-032: defasagem típica ≤ 500 ms, medida entre dispositivos.
- [x] TASK-073 → degradação graciosa: sem WebSocket, cair para polling em intervalo largo em vez de deixar a tela parada.

> **Fechada em 2026-09-06 — com uma ressalva que não é detalhe.** O código está entregue e
> em `main`, mas **o REQ-032 NÃO está demonstrado**: a defasagem de ≤ 500 ms exige Realtime
> de verdade (variáveis `NEXT_PUBLIC_SUPABASE_*` na Vercel e a migration
> `202609061800_sinal_realtime` aplicada no Supabase). O container de teste não tem o
> serviço. **Enquanto não houver um número medido registrado aqui, o requisito está
> entregue em código e não em fato.**
>
> O mecanismo mudou em relação ao que o ADR-012 sugeria, e a razão está no ADR e na
> micro-spec: `postgres_changes` autoriza por RLS, e este sistema tem RLS negando tudo a
> `anon` e não usa Supabase Auth. Usá-lo exigiria abrir as tabelas de chaves à chave
> anônima do bundle — trocar 3 s de defasagem por leitura pública (§3.2). O Realtime passou
> a carregar **sinal vazio**, e o dado continua saindo pelas rotas autenticadas.
>
> Medido no fecho, no cenário degradado (sem Realtime configurado): 12 requisições de API
> em 89 s, contra ~145 do polling de 3 s.
>
> **Mecanismo VALIDADO em produção em 2026-09-06**, sem escrever dado nenhum. O trigger é
> `FOR EACH STATEMENT`, então dispara com zero linhas afetadas — o que permitiu emitir o
> sinal com `UPDATE keys SET name = name WHERE false` e observá-lo chegar a um cliente real:
>
> ```
> 17:39:28  canal: SUBSCRIBED     (chave publicável aceita pelo Realtime)
> 17:39:53  UPDATE ... WHERE false (zero linhas)
> 17:39:55  SINAL RECEBIDO
> ```
>
> Provado: a chave publicável funciona, o canal público aceita assinatura sem JWT do
> Supabase, o trigger dispara e o sinal chega. **Não provado: a defasagem.** Os dois
> instantes vieram de relógios diferentes (servidor do Supabase e máquina local), com
> desvio desconhecido, mais a ida e volta da chamada MCP — o intervalo observado não é
> medida de nada.
>
> **A MEDIÇÃO DE ≤ 500 ms FOI ADIADA por decisão do usuário em 2026-09-06**, e a razão é
> boa: medi-la **por inteiro** exigiria criar usuário e chave de teste e operar em produção,
> gravando em `key_transactions`, `history` e `action_logs` — trilha **imutável por
> trigger**, que a §7.1 proíbe limpar. Os primeiros registros do histórico do sistema seriam
> sintéticos e permanentes.
>
> ---
>
> ## MEDIÇÃO PARCIAL — 2026-09-07, em produção, sem escrever nada
>
> A defasagem tem três pernas, e **duas delas se medem sem operação nenhuma**:
>
> | Perna | O que é | Medida |
> |---|---|---|
> | **A** | commit no Postgres → serviço Realtime | **não medida** — exige um cliente que dispare E observe, num relógio só, e disparar é escrever |
> | **B** | serviço Realtime → navegador (WebSocket) | **64 ms** (mediana; min 63, p90 66, n=15) |
> | **C** | sinal no navegador → dado novo em mãos | **335 ms por rota** (mediana; min 331, p90 346, n=25) |
>
> A perna B foi medida mandando *broadcast* para si mesmo no canal `chaves` de produção,
> com a chave publicável: mesmo caminho que o sinal do trigger percorre, ida e volta no
> mesmo relógio. A perna C, com `GET /api/health` — pública, e **consulta o banco**.
>
> ### O que a perna C revelou, e não era o que se esperava
>
> `/login` (renderiza na Vercel, **não toca o banco**) responde em **86 ms**.
> `/api/health` (um `SELECT 1`) responde em **335 ms**. A diferença é **249 ms — idêntica
> na mediana e no mínimo**, que é a assinatura de distância, não de trabalho.
>
> O cabeçalho diz por quê: `X-Vercel-Id: gru1::iad1::…`. A requisição **entra** em São
> Paulo e a função **executa em Washington** (`iad1`), enquanto o banco está em
> **`sa-east-1`, São Paulo**. Cada ida ao banco atravessa as Américas duas vezes, para
> voltar a 15 km de onde saiu. Não há `vercel.json`, e a região nunca foi escolhida — é o
> padrão da plataforma.
>
> ### O orçamento, somado
>
> O consumidor real do sinal é `refreshData` do `DashboardClient`, e para PORTEIRO/ADMIN
> — justamente quem opera o balcão — ele faz **duas buscas EM SÉRIE**
> (`await /api/keys` e depois `await /api/users`), que não dependem uma da outra:
>
> ```
>   B) sinal chega ao navegador          64 ms
>   C) GET /api/keys                    335 ms
>   C) GET /api/users  (serial)         335 ms
>   ------------------------------------------
>   observável                          734 ms      orçamento do REQ-032: 500 ms
>   + perna A (não medida)                  ?
> ```
>
> **O REQ-032 NÃO É CUMPRIDO como está no ar**, e por uma margem que não é ruído: ~734 ms
> contra 500 ms, sem contar a perna A. E a causa **não é o Realtime** — a perna que a
> Sprint 25 inteira construiu custa 64 ms dos 734. São duas coisas banais:
>
> 1. ~~**A função roda no continente errado.**~~ **CORRIGIDO em 2026-09-08 (TASK-092,
>    ADR-016).** `vercel.json` com `regions: ["gru1"]`. Os 249 ms viraram **19 ms** —
>    medição completa mais abaixo.
> 2. ~~**`refreshData` serializa duas buscas independentes.**~~ **CORRIGIDO em 2026-09-07
>    (TASK-091).** As duas saem juntas. Verificado no navegador, logado como PORTEIRO e
>    com `fetch` instrumentado: `/api/keys` e `/api/users` sobrepostas, 44 ms no total
>    local em vez da soma. Ficou `Promise.allSettled` e não `Promise.all` — `all` rejeita
>    na primeira falha e deixa a segunda rejeição órfã, e numa rede oscilando as duas
>    falham juntas.
>
> Sobra a região. Com ela, a soma observável cai para a casa dos 150 ms e o requisito
> passa a caber com folga — **projeção, não medida**.
>
> ---
>
> ## MEDIÇÃO DEPOIS DA TASK-092 — 2026-09-08, e a hipótese estava certa
>
> `X-Vercel-Id: gru1::gru1::…` — a função passou a executar em São Paulo. Mesmo
> harness, mesmos parâmetros (n=25), mesma máquina:
>
> | | antes (`iad1`) | depois (`gru1`) |
> |---|---|---|
> | `/login` (estática, servida da borda) | 86 ms | 92 ms |
> | `/api/health` (função + `SELECT 1`) | **335 ms** | **112 ms** |
> | diferença entre as duas | **249 ms** | **19 ms** |
> | B) Realtime → navegador | 64 ms | 51 ms |
> | **B + uma perna C** | **399 ms** | **162 ms** |
>
> Os 249 ms viraram 19. E continuam com a assinatura de distância — 19 ms na
> mediana contra 22 no mínimo —, só que agora a distância é dentro de São Paulo.
>
> ### ⚠️ Correção de uma imprecisão do registro de 2026-09-07
>
> Aquele registro chamou os 249 ms de "custo de UMA ida ao banco". **Não era só
> isso**, e a diferença importa para quem for ler isto depois. `/login` é
> **estática** (`○` no `next build`): ela é servida da borda e nunca executa
> função. A diferença entre as duas rotas mede, portanto, *chegar à função e dali
> ao banco* — e antes as duas pernas eram transcontinentais:
>
> ```
>   antes:  navegador → borda gru1 → função iad1 → banco sa-east-1 → volta
>   depois: navegador → borda gru1 → função gru1 → banco sa-east-1 → volta
> ```
>
> Eram **duas** travessias das Américas por requisição, não uma. Isso não muda a
> decisão nem o resultado — só explica por que a queda (230 ms) foi maior do que
> um único salto explicaria, e por que `/login` não melhorou: ela já estava na
> borda o tempo todo.
>
> ### Onde o REQ-032 está agora
>
> Com a TASK-091 (buscas em paralelo) as duas rotas do dashboard saem juntas, então
> o observável é **B + uma perna C ≈ 162 ms**, contra 500 ms de orçamento —
> **338 ms de folga** para a perna A. Antes das duas tasks eram ~734 ms.
>
> **Ainda não é o cumprimento demonstrado do requisito**, e a distinção não é
> formalidade: o REQ-032 mede da *confirmação da operação* até a tela do outro
> dispositivo, e a perna A (commit → serviço Realtime) segue sem número. O que
> mudou é que ela deixou de precisar caber em 100 ms para caber em 338.
>
> ### O que continua sem número
>
> A perna A e o total de ponta a ponta. Ambos exigem a **primeira operação real**, e o
> harness para captá-la está **versionado** em `scripts/medir-req032.mjs`. O custo que
> fazia esta medição escorregar de sprint em sprint nunca foi a medição — era montar o
> aparato toda vez. Com `--operacao` ele fica ouvindo e cronometra a primeira retirada de
> chave de verdade, sem nada a preparar:
>
> ```bash
> NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... >   node scripts/medir-req032.mjs --operacao
> ``` Até haver esse número aqui, **o REQ-032 continua entregue em código e não em
> fato** — e agora sabe-se, além disso, que **em fato ele está falhando**.

### Sprint 26 ✅ — Autorização de métricas e contrato de API (CR Tipo C · ADR-014)
> Aberta pelo Change Request de 2026-09-06. Uma rota expõe dados pessoais a qualquer usuário
> autenticado, e o exercício que achou isso — enumerar a superfície de API — vira o
> documento que faltava.
- [x] **TASK-085 → `/api/metrics/frequent-users` passa a validar papel.** ADR-014. Hoje a rota só chama `verifySession`: qualquer autenticado, **inclusive ALUNO**, recebe nome, username, papel e frequência de retirada dos cinco maiores usuários de uma chave, com `keyId` sequencial e portanto enumerável. As duas rotas irmãs (`business`, `frequent-keys`) já restringem a ADMIN/GESTOR/PORTEIRO; esta passa a restringir igual. O consumidor único já chama dentro de `if (isPorteiroOrAdmin)`, então **nenhum uso legítimo muda** — o que muda é o servidor garantir o que a tela presumia (§3.2). O teste tem de provar que ALUNO recebe **403**, e uma guarda deve varrer as demais rotas para que nenhuma outra fique só com checagem de sessão sem declarar que é pública.
- [x] **TASK-086 → `docs/api-contract.md`, com a superfície real.** Débito da Sprint 24: o arquivo está no mapa do projeto (`CLAUDE.md`) e nunca existiu, e um critério da TASK-082 ficou sem alvo por isso. Deve listar as 24 rotas com métodos, papéis exigidos e o que cada uma devolve — gerado a partir do código, não de memória. E deve registrar as três rotas públicas (`/login`, `/api/auth/login`, `/api/auth/logout`, `/api/health`) como lista fechada, casando com `ROTAS_PUBLICAS` do `proxy.ts`.
- [x] **TASK-087 → `GET /api/settings` para de entregar a senha padrão de reset a quem não pode resetar senha.** ADR-014 achado 2, encontrado minutos depois do primeiro e pelo mesmo método. O handler não tinha checagem **nenhuma** — nem de sessão — e devolvia `defaultResetPassword` a qualquer autenticado. Não era só exposição: em `login/route.ts`, com `requires_password_change` ligado, o login aceita a senha atual mais uma nova e troca na hora, então quem soubesse a senha padrão poderia tomar a conta de alguém na janela entre um reset legítimo e o primeiro acesso da vítima — **herdando o papel dela**. A correção OMITE O CAMPO em vez de recusar a requisição: `autoLogoutTime` é legítimo para todo papel, e negar o GET quebraria o logout automático de todo mundo (§2) para proteger um campo que papéis baixos nunca leram.

> **Fechada em 2026-09-06.** Três tasks: 085 (métricas), 087 (senha padrão) e 086 (contrato).
> **Duas falhas de autorização vivas em produção**, ambas encontradas pelo mesmo método —
> enumerar a superfície e comparar rotas irmãs — e nenhuma com sintoma. A segunda era
> escalada de privilégio.
>
> **A lição do achado, e é reutilizável:** a rota foi escrita com checagem de sessão e sem
> a de papel, e **nada acusou**. Não há teste que exija papel por rota, o proxy por desenho
> não cobre, e a tela nunca a chamou de um perfil baixo — o defeito não tinha sintoma. Foi
> preciso **enumerar a superfície inteira e comparar rotas irmãs**. O débito do
> `api-contract.md` se pagou antes mesmo de o arquivo existir.

### Sprint 27 — Autorização em Server Components (CR Tipo C · ADR-015)
> Terceiro CR de autorização em duas horas, e o de maior exposição. As páginas consultam o
> banco direto: quando verificam só a sessão, **não há 403 possível** — não existe rota no
> caminho, e a camada de API onde as checagens vivem é contornada.
- [x] **TASK-088 → `/keys` bloqueia; `/history` escopa ao próprio usuário.** ADR-015 decisão 1, **emendada em 2026-09-06**. Hoje um ALUNO que digitar o endereço vê o histórico completo de movimentação (quem retirou qual chave, quando, com nome) e o inventário com portador — o `Sidebar` esconde os links, mas isso é navegação e não autorização. `/keys` redireciona, como `/logs` e `/users` já fazem: não há leitura legítima do inventário alheio. **`/history` escopa**: "quando peguei a chave da sala 12" é dado do próprio usuário, e A/G/P continuam vendo tudo. ⚠️ **A restrição tem de ser TETO, não padrão:** `buildHistoryQuery` já aceita `userId` da query string, e aplicar a restrição como default desse campo deixaria um FUNCIONARIO passar `?userId=outro` e ler o histórico alheio — troca de uma exposição por outra, mais difícil de ver. Entra como parâmetro separado que **sobrescreve** o filtro da URL.
- [x] **TASK-089 → o dashboard escopa a lista de usuários ao papel que a usa.** ADR-015 decisão 2. `/` é legitimamente para todos os papéis — FUNCIONARIO e ALUNO precisam ver as próprias chaves —, mas entrega a **lista de todos os funcionários e alunos ativos** (`id`, `username`, `full_name`, `role`) ao navegador de todo mundo. A consulta serve à Ação Rápida do balcão, que não existe nesses perfis. **Escopar o que se entrega**, e não bloquear a página: mesma escolha da TASK-087.
- [x] **TASK-090 → guarda que varre as `page.tsx`.** ADR-015 decisão 3, e vale mais que as duas primeiras. Reprova página que consulta o banco sem verificar papel, com exceções em lista. É o análogo da guarda do ADR-014 para rotas, e existe pela mesma razão: sem ela, a próxima página nasce igual — foi assim que estas três nasceram.

> **O padrão, e é o que a sprint registra:** três achados, todos com a mesma forma — a
> sessão é verificada, o papel não, e a interface esconde o que o servidor não protege.
> Nenhum tinha sintoma, porque a tela certa nunca pediu o que não devia. A defesa não é
> lembrar melhor; é comparar irmãos lado a lado e transformar a comparação em teste.

> **Fechada em 2026-09-06.** 471 testes / 49 arquivos, 6 gates, tsc 0, eslint 0,
> `next build` verde sem `DATABASE_URL`.
>
> **A emenda do ADR foi sua, e mudou a task.** A decisão 1 dizia que `/history` bloqueava,
> como `/keys`. Você observou que ver o próprio histórico é legítimo — bloquear seria
> proteger a pessoa do dado dela mesma —, e a página passou a **escopar**. O que a emenda
> trouxe junto foi a armadilha: a restrição precisou entrar como **teto**, num campo
> separado que sobrescreve o `userId` da query string, e não como default dele. Aplicada
> como default, um FUNCIONARIO passaria `?userId=outro` e leria o histórico alheio — a
> mesma exposição, agora atrás de uma página que **parece** escopada. Há cenário para a
> sobrescrita, para o filtro continuar valendo a quem pode usá-lo, e para a restrição valer
> também na **contagem** (escopar só a listagem esconderia as linhas e revelaria quantas
> existem).
>
> **A guarda da TASK-090 nasceu cega duas vezes, e essa é a quinta e a sexta desta série.**
> `consultaBanco` usava `pgQuery\s*\(` e não casava com `pgQuery<HistoryItem>(` — a
> varredura concluía que NENHUMA página consulta o banco, e passava com as três abertas.
> `verificaPapel` usava `session.role`, que casa com `userRole={session.role}` — repassar o
> papel ao componente de cliente, exatamente o que as páginas desprotegidas faziam. As duas
> só apareceram porque rodei o vermelho e conferi **quais** cenários passavam, em vez de
> contar quantos falhavam.

### Etapa 6 — dissolvida
> Não existe mais como sprint. A TASK-074 subiu para a Sprint 22 (pré-requisito do deploy)
> e a TASK-075 foi para a Sprint 23 (dependente da TASK-078). Mantido aqui o registro para
> que a numeração das etapas do ADR-012 continue rastreável.

### Achados de 2026-09-04 — não existe produção (confirmado pelo usuário)

> ⚠️ **SUPERADO EM 2026-09-06: a produção passou a existir.** O sistema está no ar em
> https://projeto-uni-fafire.vercel.app, com banco Supabase, backup diário verificado e
> ADMIN criado. O que esta seção descreve continua **historicamente correto** — não havia
> produção quando foi escrita, e as três conclusões abaixo guiaram as Sprints 22 e 23 —,
> mas não vale mais como estado do projeto. Estado atual: `CLAUDE.md ## Checkpoint Atual`.

> Não há servidor PM2 em uso, não há `keys.db` com dados reais e ninguém usa o sistema
> hoje. Os dados reais ainda serão cadastrados ou importados de outra fonte, direto no
> Postgres. Três coisas que este projeto vinha carregando como verdade caem com isso.

1. **A pendência de deploy era fantasma.** `node db/migrate.mjs up` no "`keys.db` de produção" atravessou várias sprints no checkpoint descrevendo um banco que não existe — a mesma classe de erro do débito do `keys.db` rastreado no git, que a TASK-062 desmentiu. `db/migrations/` (SQLite) permanece como histórico; o Gate 2 e `tests/migrations.test.ts` seguem cobrindo o pareamento UP/DOWN. **Lição, de novo: pendência herdada se reverifica antes de ser repetida.**
2. **O plano de reversão do ADR-012 está vazio.** Os itens 2, 3 e 4 (§Reversão) pressupõem `keys.db` de produção íntegro, ponto de não-retorno na primeira escrita e servidor PM2 ligado por 30 dias. Nada disso existe. Na prática o risco é **menor** do que o ADR supõe — sem estado anterior não há o que perder —, mas o documento declara uma rede de segurança inexistente, e isso é pior do que declarar que não há rede. **Correção pendente: CR Tipo C** (changelog no `spec.md` + atualização do ADR-012). Não aplicada sem confirmação.
3. **A TASK-067 ficou sem origem.** `db/load-pg.mjs` foi construído para ler `keys.db` e reconciliar contagens. Sem `keys.db` real não há de onde carregar. O código continua correto e testado — o que falta é decidir de onde os dados reais vêm (ver Decisões pendentes).

**🚨 Gap bloqueante do go-live, ainda sem task: bootstrap do primeiro ADMIN no Postgres.**
`scripts/init-db.js` cria `admin`/`admin`, mas só fala SQLite e saiu do `postinstall` na
TASK-071. Nenhuma migration de `db/migrations-pg/` insere usuário. Toda rota exige sessão
e `/api/users` exige papel ADMIN. Numa base Supabase vazia, **ninguém consegue entrar** —
não há caminho para criar o primeiro usuário. Precisa de task própria na Etapa 7, com dois
cuidados: a senha inicial não pode ser previsível (o `admin`/`admin` do SQLite nasceu numa
intranet; aqui a exposição é pública, constitution §2) e o procedimento tem de ser
executável uma vez só, sem deixar caminho de escalada aberto depois.

### Decisões pendentes das Etapas 3–7
- ~~**Banco dos testes (Etapa 4).**~~ — **resolvida em 2026-09-03 (D-11):** Postgres real em container, conforme a recomendação do ADR-012. Implementada na TASK-068.
- **`keys.db` no histórico do git.** Não está mais rastreado (TASK-062 confirmou), mas continua nos commits antigos. Expurgar exige reescrever história — decisão do usuário. Baixo risco: o banco não contém secret, apenas dados operacionais e hashes bcrypt. **Risco revisto para BAIXÍSSIMO em 2026-09-04:** aqueles arquivos nunca contiveram dados reais.
- ~~**Origem dos dados reais (Etapa 7)**~~ — **não é bloqueio (esclarecido em 2026-09-04):** o conteúdo do `keys.db` anterior era **fictício**. Não há dado a preservar nem migração a fazer, e o objetivo declarado é fazer o sistema funcionar no Supabase + Vercel. O cadastro dos dados reais é operação posterior, pela própria UI, depois da TASK-080. **Consequência:** o `db/load-pg.mjs` da TASK-067 fica sem uso no caminho de produção — segue correto e testado, e é a ferramenta pronta caso um dia exista um SQLite de origem, mas não faz parte do go-live.
- **Dados sintéticos no Supabase — limpeza operacional, não risco de PII.** As 20 users / 5 keys / 92 tx / 30 history / 99 logs / 4 settings da TASK-067 são fictícios, como o `keys.db` que os originou; não há urgência de expurgo. Ao limpar, lembrar que `history` é imutável (TASK-065): exige o bypass autorizado do REQ-014, não um `DELETE` solto. A TASK-080 recusa base com usuário, então a limpeza de `users` é pré-requisito de rodá-la contra o Supabase atual.

- **A §3.2 fala em "rota de API", e a fronteira real é maior (achado do ADR-015, 2026-09-06).** A cláusula diz "Toda **rota de API** valida a sessão E a permissão no servidor", e é razoável lê-la como dirigida a handlers. As três falhas desta sprint estavam em **Server Components**, que consultam o banco direto e nas quais não há 403 possível — a letra não as alcança, a intenção sim. A Sprint 27 corrigiu o código e pôs a guarda; **a cláusula continua com o texto antigo**. Emendá-la é Change Request **Tipo D** (constitution), e a decisão é sua. Enquanto não for, quem ler a §3.2 e escrever uma página nova vai concluir que ela não se aplica — o teste reprova, mas o documento discorda dele.

### Itens não bloqueantes
- E2E smoke com Playwright para os 4 fluxos "que não podem falhar" (spec §4) — parcialmente coberto pelo setup da Sprint 4 real (login) e completado pela TASK-028.

### Débitos técnicos registrados
- ~~**Lint**~~ — **quitado (Sprint 9 — higiene, 2026-07-03):** os 64 warnings restantes (33 `no-explicit-any`, 28 `no-unused-vars`, 3 `exhaustive-deps`) foram zerados. `no-explicit-any` voltou de *warn* para *error* no `eslint.config.mjs` — nenhuma exceção residual. `npx eslint src` limpo (0 erros, 0 warnings).
- ~~**Testes desativados na Sprint 6**~~ — **quitado (TASK-035, Sprint 7):** os 4 `.test.old` viraram suíte Vitest real (session-policy, password-policy, security-profile) com cobertura extra do strict pwd_hash check.
- ~~**Next 16 — convenção `middleware` deprecada**~~ — **quitado (Sprint 9, 2026-07-03):** `src/middleware.ts` renomeado para `src/proxy.ts` (função `middleware` → `proxy`), conforme codemod oficial `middleware-to-proxy`.
- **`docs/tasks-sprint-N.md` sem arquivamento desde a Sprint 8** (2026-07-02) — as Sprints 9–14 não geraram o snapshot correspondente em `docs/`. Fonte de verdade permanece íntegra em `.sdd/memory/tasks.md` (sobrescrito por sprint) + histórico de commits (`test`/`feat`/`refactor(TASK-NNN)`) + ADRs. Não reconstruído retroativamente para evitar fabricar detalhe BDD sem fonte confiável — se precisar do arquivo formal de uma sprint passada, gerar sob demanda a partir do `tasks.md` daquele commit + `git log`.
- **TASK-042 (REQ-026, Sprint 11) entregue sem teste** — feat commit (`13f623c`) sem commit `test` correspondente e sem commit de CR (`docs: change request`) próprio; débito herdado já causou 1 falha de gate na Sprint 12 (ver métricas abaixo). Não corrigido retroativamente nesta rodada (Fase 11 é revisão/documentação, não implementação) — próxima sprint que tocar o fluxo de transferência mobile deve cobrir com teste antes de qualquer outra mudança no mesmo arquivo.
- **Autorização sem defesa em profundidade** — `src/proxy.ts` (ex-`middleware.ts`, convenção Next 16) só renova a expiração do cookie e limpa JWT inválido; requisição sem sessão segue adiante (`NextResponse.next()`). A verificação de papel é feita manualmente em cada handler, então uma rota nova esquecida nasce aberta. Tolerável em rede local; endereçar antes da exposição pública (Etapa 7).
- ~~**Erro de hidratação pré-existente**~~ — **quitado (TASK-058, 2026-09-02):** dois pontos, ambos anteriores ao ciclo de migração. `HistoryClient` renderizava `new Date().toLocaleString()` direto no JSX (commit original `95af5ac`); `DashboardClient` calculava as chaves em atraso dentro de `useMemo` a partir de `new Date().getTime()`, e o `useMemo` roda no SSR. A regra de atraso saiu para `business-rules.findDelayedKeys(keys, now)` — pura, recebe o instante como argumento — e os dois componentes passaram a usar `useClientClock` (`useSyncExternalStore`), que devolve nulo no SSR e na hidratação. Medido antes do fix: três renders do servidor devolviam `14:01:38`, `:41` e `:43` contra `14:01:08` no cliente.
- ~~**`keys.db` segue rastreado no git**~~ — **registro obsoleto, corrigido na TASK-062 (2026-09-03):** a remoção já havia sido feita em `23c6bcd`/`2e83857`/`5874d62` e nenhum `.db` é rastreado hoje. O débito permaneceu no `plan.md` por várias sprints descrevendo um problema inexistente — e chegou a ser propagado para o ADR-012. **Lição:** débito herdado deve ser reverificado antes de ser repetido em documento novo. Resta apenas o arquivo no histórico antigo de commits (ver decisão pendente).

- ~~**Backup da aplicação sem substituto até a TASK-078 (Sprint 21 → Etapa 7).**~~ — **quitado no código (TASK-078, Sprint 23), com uma ressalva que não é detalhe.** O registro anterior dizia que "a única proteção de dados é o backup gerenciado do provedor — que existe, mas não foi verificado". A primeira metade era **falsa**: o plano gratuito do Supabase não tem backup gerenciado, e a própria documentação recomenda `db dump` + off-site para esse plano (verificado no CR Tipo D `7770d2e`). Entre a Sprint 21 e hoje não havia proteção nenhuma — só a suposição. Entregue: `pg_dump` diário no GitHub Actions, verificado por restauração numa base descartável com reconciliação de contagens **e de esquema**, dump em repositório privado separado, e cada execução — inclusive a que falhou — gravada em `backup_runs`. **A ressalva:** o mecanismo só passa a proteger quando o usuário criar o repositório privado e cadastrar os três secrets. Até lá o job falha na primeira etapa, que é o comportamento certo, mas continua não havendo backup. Este débito só fecha de verdade na primeira execução verde.
- **Lição de execução (Sprint 21) — fatia se desenha por fronteira de execução, não por pasta.** As 5 fatias da TASK-069 foram desenhadas por diretório e isso produziu **4 correções de escopo**: `history-query.ts`, `db-maintenance.ts` e `backup.ts` saíram das fatias em que estavam, e `user-confirm` voltou para a fatia (c) depois de ter saído — o teste provou que a dupla confirmação atravessa `transactions/route.ts` e `user-confirm` **em tempo de execução**, e converter um sem o outro deixa o fluxo pela metade. Converter é uma operação sobre o grafo de chamadas; a árvore de pastas é só uma projeção dele.
- **Lição de execução (Sprint 21) — a suíte cobre funções, não o sistema.** Dois defeitos passaram por 270+ testes verdes: (1) o pool criado no topo de `src/lib/pg.ts` quebrava `npm run build` (o Next importa cada rota para coletar dados da página, e ali não há `DATABASE_URL`; em teste ela sempre existe); (2) `normalizeTimestamp` recebia `Date` do driver e chamava `.trim()` nele — a página de histórico quebrava no navegador, mas nenhum teste passava valor lido do banco pela formatação que a tela usa. Ambos foram cobertos test-first depois do fato, e **`npm run build` + render no navegador entraram na verificação de cada fatia**. Nota operacional: a verificação no navegador e a suíte compartilham o mesmo container, e `tests/setup.ts` dá `TRUNCATE` — semear para verificação e rodar `vitest` na sequência apaga a semente. **Reincidiu 3x na Sprint 22**, sempre com a mesma aparência enganosa: o login passa a recusar credencial que estava correta, e o primeiro palpite é defeito no código de autenticação que se acabou de escrever. Regra prática adotada: **verificação no navegador é sempre o ÚLTIMO passo**, depois da suíte e dos gates. Se voltar a atrapalhar, a correção de verdade é um segundo banco no mesmo container só para verificação manual.

- **25 promessas soltas em componentes de cliente (achado da TASK-081, Sprint 22).** Ao ligar `@typescript-eslint/no-floating-promises` em todo o `src/`, 25 pontos acusaram em `DashboardClient`, `KeysClient`, `PendingInline`, `Sidebar`, `ConfirmClient`, `LogsClient`, `SettingsClient` e `UsersClient`. **Não são o defeito da TASK-081:** no navegador a página continua viva e a promessa liquida; o risco de a instância congelar com a escrita pendente é do servidor. O sintoma aqui é outro e mais brando — `fetch` em handler de evento sem tratamento de rejeição, então quando a chamada falha a tela simplesmente não reage e o usuário não sabe por quê. A regra foi escopada para a superfície de servidor de propósito: a correção honesta no cliente é **mostrar o erro ao usuário**, não calar o lint com `void` em 25 lugares. Task de UI, a ser criada quando alguém tocar essas telas.
- **Gate 1 não varre arquivos de configuração.** A TASK-081 descobriu `typescript-eslint` sendo importado pelo `eslint.config.mjs` sem ser dependência declarada — resolvia por ser transitiva do `eslint-config-next`, e uma atualização futura teria quebrado o lint sem aviso. É exatamente a classe que o Gate 1 existe para impedir, e ele passou porque só varre `src/`. Corrigido o caso concreto (declarado em devDependencies); o gate continua cego para `*.config.*` na raiz. Estender exige mexer em `scripts/ci-gates.sh`, que é zona somente leitura — CR à parte.

- **A restauração foi ENSAIADA em 2026-09-06 — parcialmente.** O dump do repositório privado foi baixado, restaurado numa base descartável e conferido: **72 s** do início ao fim para as etapas 1–5 do runbook §6.5, sem um único erro, com 11 tabelas / 23 índices / 6 triggers / 11 sob RLS / 67 linhas — idêntico ao que o job registrou. Os guardas de imutabilidade foram **exercitados**, não só contados (`UPDATE app_logs` e `DELETE backup_runs` recusados pela base restaurada), e o ADMIN voltou com hash bcrypt íntegro. **O que continua sem medição:** provisionar um projeto Supabase novo, repontar a aplicação e o tempo humano de perceber e decidir — as três etapas que exigem credencial de produção, e que na prática dominam o RTO. Detalhamento na tabela do runbook §6.6. O item abaixo fica como registro do que motivou o ensaio.
- ~~**A verificação restaura, mas ninguém ensaiou a RESTAURAÇÃO EM PRODUÇÃO (TASK-078, Sprint 23).**~~ O job prova que o dump volta idêntico numa base descartável — que é o que a §4.3 pede como *verificação*. Não prova o RTO de 4 h: ninguém cronometrou pegar o dump do repositório privado, criar a base e subir a aplicação apontada para ela. O ensaio pertence ao responsável nomeado no runbook, depois do primeiro backup real, e o `workflow_dispatch` existe para isso.
- **`contarLinhas` consulta a lista de tabelas da ORIGEM contra a restauração (TASK-078).** Se uma tabela sumir inteira do dump, a consulta estoura em `relation does not exist` antes de a reconciliação montar o relatório — o job reprova do mesmo jeito (é o que importa), mas com a mensagem crua do Postgres em vez do `"(tabela ausente)"` que `reconciliarContagens` sabe produzir. Esse caminho, hoje, só é exercitado pelo teste unitário. Custo baixo, correção óbvia (consultar `information_schema` nos dois lados antes de contar) — não feita aqui para não crescer o escopo da task depois do ciclo fechado.

- **"Horário do Backup" e "Retenção (quantidade de backups)" continuam na tela sem controlar nada (achado da TASK-075, Sprint 23).** Os dois campos são salvos em `settings` e não são lidos por ninguém desde que o agendamento saiu do `node-cron` (TASK-070). Hoje o horário é o `cron` do workflow, e a retenção é o histórico do repositório privado de dumps. A tela chega a prometer que "backups mais antigos serão removidos automaticamente" — nada remove. Não foi tocado nesta task porque nenhum critério da TASK-075 alcança esses campos e removê-los mexe também na rota de settings, mas **é mentira em tela**, da mesma família do que a task veio corrigir. Vale como CR pequeno: ou os campos saem, ou passam a ser texto informativo apontando o workflow.
- **O botão "Gerar Backup Agora" continua na tela devolvendo 503 (TASK-075).** A mensagem foi corrigida — antes mandava esperar o backup gerenciado do provedor, que não existe; agora aponta o `workflow_dispatch` do job. Mas o botão segue oferecendo uma ação que nunca funciona. Mesmo tratamento e mesma decisão do item acima: fica para um CR de tela, junto com os campos inertes.

- **Não há runner de migrations para Postgres, nem registro do que já foi aplicado (achado da TASK-079, Sprint 23).** `db/migrate.mjs` é o runner do SQLite antigo: usa `better-sqlite3`, escreve numa tabela `_migrations` daquele banco e não serve para produção. Hoje as migrations de `db/migrations-pg/` são aplicadas à mão por `psql`, na ordem do nome, e **nada registra quais foram aplicadas** — a única forma de saber é inspecionar o schema. Numa base só e com um mantenedor, funciona; com duas bases (produção e uma restaurada) ou seis meses de intervalo, é como se perde uma migration. O Gate 2 continua garantindo o PAREAMENTO UP/DOWN, que é outra coisa. Documentado no runbook §4 como procedimento manual — mas procedimento manual não é o mesmo que garantia. Vale um CR próprio.
- **Os scripts legados de `scripts/` ainda falam SQLite (achado da TASK-079).** `add_active_column_to_users.js`, `add_ip_to_logs.js`, `add_settings_table.js`, `migrate_keys.js`, `migrate_keys_soft_delete.js`, `migrate-employees-soft-delete.js`, `migrate-to-user-system.js` e `reset-db.js` são de antes das migrations pareadas e operam sobre `keys.db`, que não existe. Não foram removidos nesta task porque nenhum critério os alcança e `.bat`/`ecosystem`/`show-ip` estavam nomeados na micro-spec — mas são a mesma classe: instrução que não funciona esperando alguém tentar. CR de limpeza.
- **`/api/backups/restore`, `/api/backups/import` e o card "Importar Banco (.db)" continuam na tela (achado da TASK-079).** As rotas respondem 503 desde a TASK-068 e a tela ainda oferece "Substitua o banco de dados atual por um arquivo externo (.db)" — arquivo `.db` é SQLite, que saiu da stack na Sprint 21. Mesma família dos débitos da TASK-075 (campos de agendamento e retenção inertes, botão "Gerar Backup Agora"): **tela prometendo o que o sistema não faz**. Já são quatro itens do mesmo tipo na mesma tela — vale um CR único de faxina da tela de configurações, em vez de quatro correções soltas.

- ~~**`docs/api-contract.md` está no mapa do projeto e não existe (achado da TASK-082, Sprint 24).**~~ — **quitado (TASK-086, Sprint 26):** o arquivo existe, descreve as 24 rotas com papéis exigidos, tem seção "O que NÃO existe" para as removidas, e é guardado por teste (rota nova sem entrada reprova). Registro original abaixo, porque o débito se pagou antes de ser quitado — foi ao enumerar a superfície para escrevê-lo que as falhas do ADR-014 apareceram.

  > **`docs/api-contract.md` está no mapa do projeto e não existe (achado da TASK-082, Sprint 24).** O `CLAUDE.md` o lista em "Localização dos artefatos principais" e o `.sdd/memory/` o menciona, mas o arquivo nunca foi criado. Um critério BDD da TASK-082 — "as rotas removidas não aparecem mais como disponíveis no contrato" — ficou **sem alvo**, e foi marcado como não cumprido em vez de riscado. Duas saídas: criar o contrato de verdade (as rotas públicas já estão descritas de forma dispersa entre `proxy.ts`, os handlers e o runbook), ou tirá-lo do mapa. Deixar como está é a coisa que esta própria sprint existe para combater: documento afirmando o que não está lá.

- **Nenhuma garantia de que toda tabela nasça com RLS e sem grant (achado da varredura de 2026-09-06, ADR-015).** As 11 tabelas de produção estão certas hoje — RLS ligado, zero políticas, nenhum grant a `anon`/`authenticated` —, mas isso depende de **cada migration lembrar**. Não há `ALTER DEFAULT PRIVILEGES` no schema `public`, nem teste que reprove uma tabela nova sem RLS. É a mesma forma dos três achados de autorização deste dia: o estado está correto e nada o defende. Endurecimento, não defeito ativo — cabe numa sprint própria, junto com o item abaixo.
- **Os workflows não declaram `permissions:` (achado da mesma varredura).** `backup.yml` e `keepalive.yml` rodam com o `GITHUB_TOKEN` no padrão do repositório em vez do mínimo que cada um precisa. O backup já usa um PAT próprio para o repositório privado, então o `GITHUB_TOKEN` amplo não está sendo usado para nada — é superfície ociosa. Correção de uma linha por workflow, mas mexe em arquivo que o Gate 2 observa: CR pequeno.

- **O ledger de migrations do Supabase NÃO descreve o que está no banco (medido em 2026-09-07).** Agrava o item do runner, acima, e **contradizia o runbook**, que chamava o ledger de "única fonte confiável" — corrigido no §4.1 na mesma data. O ledger tem 6 entradas e `db/migrations-pg/` tem 6 arquivos, e o número igual esconde que os conjuntos divergem **nos dois sentidos**: `search_path_history_imutavel_task_065` está no ledger e não tem arquivo; `202609061800_sinal_realtime` tem arquivo, **está aplicada** (o sinal do Realtime funciona em produção) e **não está no ledger**. Ele não serve nem como limite inferior nem superior. O conferidor que vale é o schema — e não só as tabelas: **trigger ausente não se manifesta**, a escrita proibida simplesmente passa. Enquanto não houver runner, a divergência cresce a cada migration aplicada à mão.
- **A região da função da Vercel nunca foi escolhida (medido em 2026-09-07 · REQ-032).** `X-Vercel-Id: gru1::iad1::…` — entra em São Paulo, executa em Washington, banco em `sa-east-1`, São Paulo. **249 ms por ida ao banco**, idêntico na mediana e no mínimo. **O plano gratuito PERMITE escolher**, verificado na documentação da Vercel em 2026-09-07: o limite do Hobby é o *número* de regiões (uma), não a escolha, e `gru1` é exatamente `sa-east-1` — nenhuma região é restrita a plano pago. Correção: `vercel.json` com `{"regions": ["gru1"]}` ou o painel (Settings → Functions → Function Regions). Muda a topologia de deploy do ADR-012 → **CR Tipo C**. Ressalva: `gru1` fica na ponta cara do preço regional, mas isso é cobrança acima da franquia (1 TB / 10 M edge requests) e o Hobby não cobra excedente — irrelevante para ~10 usuários. A confirmação final é o painel da conta `unifafiregc@gmail.com`, que o CLI logado como `ptamay` não enxerga (runbook §0).
- **O backup diário está rodando de verdade (verificado em 2026-09-08).** Três execuções verdes consecutivas — 06, 07 e 08 de setembro — depois das três falhas do dia do go-live. O `keepalive` também. Isto **fecha a ressalva** do débito do backup, acima: ele só protegeria de fato na primeira execução verde, e agora há três. A lição que motivou o registro continua valendo: job de CI só está verificado depois de rodar de verdade.

- *(novas ideias entram aqui via Change Request, nunca direto no código)*

## 7. Encerramento do Roadmap Inicial (Fase 11 — 2026-07-10)

O backlog de sprints planejadas está vazio — Sprint 14 foi a última entregue e não há
próxima sprint definida. Revisão de estado real antes de qualquer merge/deploy:

- **`main` está travado em `e873796` (2026-07-03, fim da Sprint 9)** — 72 commits das
  Sprints 10–14 (mais o CR do REQ-021/bypass e a reformulação de UI/UX) existem apenas em
  branches de feature (`feature/sprint-10-*` … `feature/sprint-14-fluxo-unificado`) e na
  branch de trabalho atual, nunca mergeados nem deployados. `docs/releases/` nunca existiu.
- **Release consolidado gerado**: `docs/releases/release-v0.2.0.md` — cobre REQ-021 a
  REQ-029 como uma única entrega (nada disso foi deployado separadamente até aqui).
  Risco 🟡 (uma migration real no lote: `202607041500_add_justification`, UP/DOWN pareados).
- **Aceite do Cliente**: registrado retroativamente como N/A (exceção MODO EXPRESSO/uso
  interno) para as Sprints 7–14 — ver changelog do `spec.md`. Protocolo passa a valer de
  fato a partir do próximo ciclo.
- **Threat model**: revisado — `docs/threat_model_stride.md` e a cópia em `.sdd/memory/`
  já estavam sincronizadas (2026-07-10) e cobrem a superfície atual; Sprint 14 foi só UI,
  sem rota/integração/schema novos, então nenhuma atualização adicional foi necessária.
- **Cross-tenant**: N/A — projeto de cliente único, sem `tenant_id` (constitution §0).
- **Pendente (ação manual, fora do escopo desta revisão)**: push da branch + PR + merge em
  `main` + deploy PM2 real. Antes de mergear, considerar consolidar as branches de feature
  soltas (`feature/sprint-10-*` a `feature/sprint-13-*`) na branch atual ou confirmar que já
  estão todas presentes nela (ver `git log main..HEAD`).

## 5. AI Cost Budget
Opcional em MODO EXPRESSO — não definido. Se sprints agentic forem executadas via API paga, definir cap mensal antes da Sprint 1.

## 6. Métricas do Processo
> Preenchida pelo memory-agent no Step 10 de cada sprint. Fontes mecânicas: git log
> (datas), tasks.md vs Report (pontos e retrabalho). Não estime — meça.

| Sprint | Início | Fim | Dias | Pts plan. | Pts entr. | Tasks c/ retrabalho | Falhas de gate | Bugs pós-release | Custo IA (US$) |
|--------|--------|-----|------|-----------|-----------|--------------------|----------------|------------------|----------------|
| 7 (dívida) | 2026-07-02 | 2026-07-02 | 1 | 15 | 15 | 0 | 1 (pre-commit lint bloqueado por débito legado — quitado na própria sprint) | — | — |
| 8 (mobile) | 2026-07-02 | 2026-07-02 | 1 | 14 | 14 | 0 | 1 (boot Edge Runtime quebrado por regressão da Sprint 7 — corrigido; detectado pelo E2E) | — | — |
| 10 (transfer) | 2026-07-06 | 2026-07-06 | 1 | 15 | 15 | 0 | 1 (lint type checking) | — | — |
| 12 (pull REQ-027) | 2026-07-07 | 2026-07-07 | 1 | 3 tasks | 3 (045 consolidada em 044) | 0 | 1 (Gate 4 falha por débito herdado da Sprint 11 — TASK-042 feat sem test; não introduzido nesta sprint) | — | — |
| 13 (devolução REQ-028) | 2026-07-07 | 2026-07-07 | 1 | 2 tasks | 2 | 1 (TASK-047: seletor e2e ambíguo + stash interrompido pelo lock do keys.db do dev server — recuperado sem perda) | 0 | — | — |
| 14 (fluxo unificado REQ-029) | 2026-07-10 | 2026-07-10 | 1 | 4 tasks | 4 | 0 | 0 (todos os gates verdes em cada task) | — | — |
| 20 (schema Postgres · Etapa 3 ADR-012) | 2026-09-03 | 2026-09-03 | 1 | 5 tasks | 5 | 1 (TASK-065: search_path mutavel em history_imutavel introduzido pela propria task, achado do get_advisors e corrigido em test->fix; e o criterio de EXPLAIN da TASK-064 reescrito na execucao — Index Cond vs Filter no lugar de Seq Scan) | 1 (Gate 5 type-check: literal BigInt e counts sem tipo em pg-load.test — corrigido com .d.mts) | — | — |
| 21 (camada async · Etapa 4 ADR-012) | 2026-09-03 | 2026-09-04 | 2 | 4 tasks | 5 (as 4 + neutralizacao do backup, fora do escopo original) | 2 (TASK-068: pool criado no topo do modulo quebrou `npm run build` — refeito preguicoso em fix; TASK-069: 4 correcoes de escopo entre fatias — history-query, db-maintenance e backup sairam, user-confirm voltou — mais o `Date` do driver na formatacao, corrigido em test->fix) | 2 (Gate 5 type-check: `if (checkLockout(...))` com Promise<boolean> sempre verdadeiro em login/route — travaria todo usuario, pego antes do commit; `npm run build`: pool no topo do modulo) | — | — |
| 22 (pre-requisitos do go-live · Etapa 7a ADR-012) | 2026-09-04 | 2026-09-04 | 1 | 4 tasks | 5 (as 4 + TASK-081, aberta em CR no meio da sprint) | 3 (TASK-074: meu proprio teste BDD 7 cobria so escrita em disco e deixava passar leitura e unlinkSync — verde sem provar o que dizia; TASK-076: a varredura de emissores de cookie ficou cega quando o literal 'session' saiu dos call sites, e so nao passou despercebido porque eu tinha posto uma asercao de "pelo menos um emissor encontrado"; TASK-077: quebrei o hot reload ao manter o matcher excluindo apenas _next/static e _next/image) | 1 (Gate 5 type-check: `unknown[]` vs `Param[]` no mock de execute em app-logs.test) | — | — |
| 23 (backup e deploy · Etapa 7b ADR-012) | 2026-09-04 | 2026-09-04 | 1 | 3 tasks | 3 | 3 (TASK-078: a verificacao por contagem de linhas aprovou um dump truncado no ensaio — perdeu o RLS de `users` e as contagens bateram; entrou `compararEsquema` num segundo commit vermelho. TASK-075 e TASK-079: quatro varreduras de fonte MINHAS escritas errado — tres proibiam ate o comentario que explica o codigo morto, e uma exigia "responsavel" no singular contra um cabecalho "Responsaveis") | 0 (todos os gates verdes em cada task) | — | — |
| 24 (faxina da tela · CR Tipo C ADR-013) | 2026-09-06 | 2026-09-06 | 1 | 2 tasks | 3 (a TASK-084 nasceu ao preparar a micro-spec, e virou a primeira da fila) | 3 (TASK-082: duas regex minhas — uma proibia a palavra "Retencao" e reprovava a propria correcao, outra exigia uma unica forma de escrever o cleanup; TASK-083: o cenario de literal espalhado achou um QUINTO ponto com a senha padrao, nao previsto no ADR) | 0 (todos os gates verdes em cada task) | — | — |
| 25 (Realtime · Etapa 5 ADR-012) | 2026-09-06 | 2026-09-06 | 1 | 2 tasks | 2 | 2 (TASK-072: a tabela do stub de `realtime.send` foi parar em `public` e quebrou a verificacao de esquema do backup — pega por um teste EXISTENTE, escrito na Sprint 23 para outra coisa; e o `globalSetup` nao derrubava o schema `realtime`, colidindo em 42P07 na segunda execucao) | 0 (todos os gates verdes em cada task) | — | — |
| 26 (autorizacao e contrato de API · CR Tipo C ADR-014) | 2026-09-06 | 2026-09-06 | 1 | 2 tasks | 3 (a TASK-087 nasceu de um SEGUNDO achado, minutos depois do primeiro e pelo mesmo metodo) | 2 (minha guarda anti-reincidencia nasceu CEGA — usava `role`, que casa com `u.role` do SQL, e passava COM O DEFEITO PRESENTE; e escrevi o contrato ANTES dos cenarios, invertendo a ordem TDD, corrigido tirando o arquivo do lugar para obter o vermelho de verdade) | 0 (todos os gates verdes) | — | — |
| 27 (autorizacao em Server Components · CR Tipo C ADR-015) | 2026-09-06 | 2026-09-06 | 1 | 3 tasks | 3 | 1 (a guarda da TASK-090 nasceu cega DUAS vezes no mesmo teste: `pgQuery\s*\(` nao casava com `pgQuery<HistoryItem>(`, entao a varredura concluia que NENHUMA pagina consulta o banco; e `session.role` casava com `userRole={session.role}`, que e repassar o papel ao cliente — exatamente o que as paginas desprotegidas faziam. Quinta e sexta varredura de texto larga ou estreita demais nesta serie) | 0 (todos os gates verdes) | — | — |
