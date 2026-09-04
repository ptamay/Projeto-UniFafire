# ADR-012: Migração para Supabase (Postgres) e Vercel

**Data:** 2026-09-02
**Status:** **Aceito** — aprovado pelo usuário em 2026-09-02 (Change Request **Tipo D**)
**Change Request:** Tipo D — alterou `constitution.md` §0, §1.3, §2.3, **§2.5**, §2.6, §4.3 e §7

> **Aprovado em 2026-09-02.** `constitution.md`, `spec.md` (REQ-031, REQ-032) e `plan.md`
> (Sprints 19–24) foram atualizados na sequência. Decisões registradas na aprovação:
>
> - **`/api/*` permanece sem prefixo de versão**, conforme proposto na seção §0 abaixo.
> - **As divergências pré-existentes serão corrigidas antes da Etapa 3**, na Sprint 19.
> - **§2.5 (lockout) entrou na lista** durante a execução: a cláusula dizia "por conta e
>   por IP" com limiar único, exatamente o que a TASK-053 mudou de propósito. Mantê-la
>   faria a lei máxima contradizer código já entregue.
> - Uma **quarta divergência** foi encontrada ao reescrever §2.6: `login/route.ts:30`
>   devolve 429 sem o header `Retry-After` que a cláusula exige. Incluída na Sprint 19
>   como TASK-061.

---

## Contexto

O sistema roda hoje em PM2 num servidor interno da UniFAFIRE, com SQLite em arquivo
(`keys.db`) e backup diário por `node-cron`. A `constitution.md` §0 registra essa postura
como decisão consciente: *"Intranet local (PM2 em servidor interno). Sem API pública"*.

Três limitações operacionais motivam a revisão:

1. **Disponibilidade presa a uma máquina.** Se o servidor da portaria desliga, reinicia ou
   perde energia, o sistema inteiro sai do ar. Não há redundância nem monitoramento.
2. **Sem acesso fora do campus.** O único caminho externo hoje é um túnel Cloudflare
   levantado manualmente (`npm run tunnel`), que não é operável por um funcionário.
3. **Backup dependente do mesmo host que ele protege.** O backup grava em `backups/`, no
   mesmo disco do banco — não atende o cenário de perda do equipamento, embora o RPO/RTO
   declarado em §4.3 suponha que atenda.

O projeto é iniciativa sem fins lucrativos, uso interno, sem transação comercial, operado
por ~19 usuários. O orçamento é **zero**.

### Requisito que dirige a escolha técnica

Levantado pelo usuário durante a análise de viabilidade: **o sincronismo do estado das
chaves precisa ter atraso mínimo.** Não precisa ser tempo real estrito, mas a defasagem
atual é ruim e não pode piorar.

Medição do mecanismo atual: **quatro pollings independentes de 3 segundos**
(`DashboardClient.tsx:311`, `Sidebar.tsx:178`, `PendingInline.tsx:50`,
`ConfirmClient.tsx:67`), somando ~5 requisições a cada 3 segundos por aba aberta.
Projetando 10 usuários simultâneos, 8h/dia, 22 dias:

```
5 req / 3s  →  6.000 req/h  →  ~10,5 milhões de requisições/mês
```

Dois problemas: a latência real de sincronismo é **até 3.000 ms** — não "quase tempo
real" — e esse volume inviabiliza qualquer plano gratuito serverless. Hoje o custo é
invisível porque o SQLite responde em ~1 ms na mesma máquina; sob rede, cada tick vira
ida-e-volta com cold start.

---

## Decisão

Migrar para **Supabase (Postgres, região São Paulo)** como banco e **Vercel** como
hospedagem, substituindo os 4 pollings por **Supabase Realtime**.

O Realtime é o motivo técnico da escolha, não um efeito colateral: resolve
simultaneamente o requisito de sincronismo e o problema de cota.

| | Polling atual | Supabase Realtime |
|---|---|---|
| Latência de sincronismo | até 3.000 ms | ~100–300 ms |
| Requisições/mês (10 usuários) | ~10,5 milhões | ~2.000 mensagens |
| Cabe no plano gratuito | não | sim (200 conexões / 2M msg/mês) |

A execução foi decomposta em 7 etapas, das quais **1 e 2 já foram entregues** por não
dependerem da mudança de stack:

| Etapa | Conteúdo | Estado |
|---|---|---|
| 1 | Correções críticas pré-nuvem (Sprint 16) | ✅ entregue |
| 2 | Filtros e paginação do histórico (Sprint 17) | ✅ entregue |
| — | Higiene constitucional (Sprint 19) — pré-requisito acordado na aprovação | ✅ entregue |
| 3 | Schema Postgres — índices, `timestamptz`, consolidação de legado (Sprint 20) | ✅ entregue |
| 4 | Camada de dados assíncrona (Sprint 21) | ✅ entregue |
| 7a | Pré-requisitos do go-live — bootstrap ADMIN, `app_logs`, `JWT_SECRET`, autorização (Sprint 22) | liberada |
| 7b | Backup verificado + deploy Vercel e ping agendado (Sprint 23) | liberada |
| 5 | Realtime no lugar dos pollings (Sprint 24) | liberada |
| 6 | — dissolvida (ver nota abaixo) | — |

> ### Correção de 2026-09-04 — ordem de execução e Etapa 6
>
> A ordem 5 → 6 → 7 pressupunha que Realtime e logs em tabela fossem melhorias sobre um
> sistema já hospedado. Não é o caso: **o sistema nunca foi hospedado nem usado**, e o
> objetivo declarado pelo usuário passou a ser fazê-lo funcionar em Supabase + Vercel.
> A Etapa 7 foi antecipada e dividida em 7a (o que precisa existir antes de haver URL
> pública) e 7b (backup e deploy). A Etapa 5 vai para o fim: é melhoria de experiência
> sobre um sistema que funciona, não condição para ele funcionar.
>
> A **Etapa 6 deixou de existir como etapa** e se dissolveu nas duas primeiras, porque não
> era melhoria: `structured-logger.ts:51` grava em `logs/` com `fs.appendFileSync`, e no
> Vercel a escrita falha, cai no `catch` e degrada para `console` — sem derrubar nada e sem
> alarme. A §7 da constitution já registrava que arquivo em `logs/` não serve à hospedagem
> serverless, e o critério de aceite (d) do REQ-031 nomeia o log estruturado ao lado de
> `history` e `action_logs`. Fazer o deploy antes disso reprovaria o critério do próprio
> requisito que motiva a migração. A task de `app_logs` foi para a 7a; a métrica de backup,
> que dependia de um arquivo que deixou de ser escrito, foi para a 7b junto do backup.

---

## Alternativas Consideradas

### A) VPS com Docker (~US$ 5/mês) — rejeitada

Zero reescrita: mantém SQLite, PM2, `node-cron` e o backup em arquivo exatamente como
estão. Resolve disponibilidade e acesso externo.

**Rejeitada porque** não resolve o requisito de sincronismo — continuaria com os 4
pollings de 3 s — e exige orçamento recorrente, que não existe. Era a recomendação
inicial da análise, revista quando o requisito de latência entrou na mesa.

### B) Turso (libSQL) + Vercel — rejeitada

Dialeto SQLite preservado, o que dispensaria a conversão de SQL (§1.3 ficaria quase
intacta). Reescrita limitada à assincronia.

**Rejeitada porque** não oferece push ao cliente. O sincronismo continuaria por polling,
mantendo latência e cota — o problema central ficaria de pé, pagando ainda assim a
reescrita assíncrona.

### C) Supabase + Vercel — escolhida

Maior custo de implementação das três (conversão de SQL, assincronia, backup e logging
redesenhados), mas é a única que ataca o requisito que motiva a mudança.

### D) Manter como está — rejeitada

Não endereça nenhuma das três limitações.

---

## Impacto Constitucional

Esta é a seção que caracteriza o CR como Tipo D. **Todas as cláusulas abaixo já foram
alteradas** na `constitution.md` após a aprovação de 2026-09-02 — o texto permanece aqui
como registro do antes/depois e da justificativa de cada mudança.

### §0 — Contexto Constitucional

| Parâmetro | Hoje | Proposto |
|---|---|---|
| Exposição | Intranet local (PM2 interno). Sem API pública. | Internet pública (Vercel), atrás de sessão. |
| Stack aprovada | Next.js + React + better-sqlite3 + PM2 | Next.js + React + Postgres (Supabase) + Vercel |
| Dados sensíveis | Nenhum dado regulado; MODO SENSÍVEL não ativado | Reavaliação necessária — ver abaixo |

**Sobre versionamento de rota.** A regra inegociável *"nunca rota pública sem prefixo
`/v[N]/`"* está hoje desativada pela justificativa de §0 (*"Sem API pública"*). Ao expor
na internet, a questão volta.

**Proposta: manter `/api/*` sem prefixo de versão**, com justificativa registrada — são
endpoints internos da própria aplicação, consumidos só pelo seu front-end, todos exigindo
sessão; não há contrato publicado a terceiros nem consumidor externo cuja
compatibilidade precise ser preservada. Alcançabilidade pela internet não é o mesmo que
ser API pública. Se algum dia houver consumidor externo, a regra volta a valer integralmente.

**Sobre LGPD.** O sistema guarda nome completo, matrícula e telefone de funcionários e
alunos. Hoje esses dados não saem do campus; passariam a residir em provedor terceiro.
Isso **não é impedimento** — é obrigação de registro: usar a região **São Paulo
(`sa-east-1`)**, e a direção da instituição precisa ter ciência formal antes do go-live.
§6.1 (proibição de PII combinada em log) já cobre a parte técnica e permanece intacta.

### §1.3 — Anti-injeção

Hoje: *"better-sqlite3 apenas com prepared statements (`db.prepare(...).run/get/all`)"*.

O **princípio não muda** (concatenação de string em SQL segue BLOQUEADOR); muda a API
nomeada. Auditoria feita durante a análise: **todas as 103 queries do sistema já são
parametrizadas** — a única interpolação encontrada (`clear-database/route.ts:38`) vem de
array constante no código, não de input. A cláusula precisa ser reescrita em termos de
*parâmetros vinculados*, independente de driver.

### §2.6 — Rate limiting

Hoje: *"(Rate limit em memória é aceitável — instância única PM2.)"*

**Esta ressalva já está obsoleta.** A TASK-054 moveu o contador para a tabela
`rate_limit_hits` justamente porque em serverless cada instância teria o seu `Map`,
zerado a cada cold start. A cláusula precisa ser corrigida de qualquer forma.

### §2.3 — Cookie de sessão

Hoje: *"`secure` quando servido via HTTPS"*. Na Vercel é sempre HTTPS, então `secure`
passa a ser incondicional em produção. É **aperto** de regra, não relaxamento.

### §4.3 — Disaster Recovery

Hoje: *"Backup diário automatizado do SQLite via node-cron (já existente em
`src/lib/backup.ts`)"*. `node-cron` depende de processo de longa duração, que não existe
em serverless.

~~Proposta: backup gerenciado do Supabase (diário no plano gratuito) + Vercel Cron para
verificação.~~ **A parte entre parênteses estava errada e é o que a nota abaixo corrige:
não há backup gerenciado no plano gratuito.** **RPO 24h / RTO 4h permanecem** — o meio
muda, o alvo não, e foi exatamente essa cláusula que permitiu corrigir sem mexer no alvo.


> ### ⚠️ Correção de 2026-09-04 (CR Tipo D) — não existe backup gerenciado no plano gratuito
>
> A documentação do Supabase é explícita: backup automático diário só nos planos **Pro,
> Team e Enterprise**. Para o plano gratuito ela **recomenda exportar com `db dump` e manter
> backups off-site**. A §4.3 e este ADR falavam em "verificar o backup gerenciado do
> provedor" — não havia o que verificar.
>
> O alvo não muda: RPO 24 h, RTO 4 h, e **verificação obrigatória**. Muda o meio:
>
> - `pg_dump` diário em job agendado do **GitHub Actions** (o mesmo lugar do ping contra a
>   pausa por inatividade, então não entra infraestrutura nova).
> - Destino: **repositório privado separado**. O repositório do código é PÚBLICO, e em repo
>   público os artefatos de workflow são baixáveis por qualquer pessoa — o dump não pode
>   encostar aqui.
> - Verificação no próprio job: restaura o dump numa base descartável e reconcilia as
>   contagens por tabela contra a origem. **Backup não verificado não conta como backup** —
>   é o ponto que a §4.3 sempre quis e que "gerenciado pelo provedor" nunca garantiu.
> - Cada execução, sucesso ou falha, é gravada em tabela do banco, para a métrica de
>   confiabilidade (TASK-075) ler fato em vez de promessa.
>
> Custo permanece zero, como o REQ-031 restringe. A alternativa honesta seria o plano Pro
> (US$ 25/mês), apresentada ao usuário e descartada por ele em favor desta.

### §7 — Observabilidade

Hoje: *"logger estruturado local (`logs/`)"*. O filesystem da Vercel é efêmero e
somente-leitura: os logs se perderiam. Proposta: tabela `app_logs` no Postgres com
`REVOKE UPDATE, DELETE`.

**Isto é ganho, não remendo.** Hoje o `.jsonl` é arquivo texto que qualquer pessoa com
acesso ao servidor edita sem deixar rastro. Em tabela com `REVOKE`, a trilha ganha a
mesma imutabilidade real que o `history` já tem por trigger (§4.4). O REQ-014 — trilha
que sobrevive à limpeza do banco — continua atendido, bastando `app_logs` ficar fora da
lista de `tablesToClear`.

### Sem alteração

§1.1, §1.2, §1.4, §1.5, §2.1, §2.2, §2.4, §2.5, §2.7–§2.9, §3 (RBAC integral), §4.1,
§4.2, §4.4, §4.5, §5, §6, §8 e §9 permanecem como estão. Em particular, **§4.1 (migração
UP com DOWN pareado) e §4.4 (imutabilidade do histórico) valem integralmente no Postgres**
e ficam mais fortes lá.

---

## Divergências pré-existentes detectadas

Encontradas ao levantar o impacto. **Não são causadas por esta mudança**, mas caem
exatamente na área que ela toca, e corrigi-las antes evita carregá-las para a nuvem.

1. **O Gate 2 de migrations nunca rodou.** `scripts/ci-gates.sh` procura UPs em
   `supabase/migrations/*.sql` e `migrations/*.sql`; as migrações reais vivem em
   `db/migrations/`. Nenhum dos dois diretórios existe, então o gate imprime *"Nenhuma
   migration encontrada — pulando"* e passa sempre. O pareamento UP/DOWN está de fato
   coberto, mas por `tests/migrations.test.ts`, não pelo gate. Ironicamente o gate foi
   escrito supondo Supabase: a migração faria o caminho `supabase/migrations/` passar a
   existir e o gate a funcionar **por acidente**. Corrigir explicitamente, não por sorte.

2. **`APP_ENV` não existe no código.** §8 determina que todo controle leia o perfil de
   ambiente de `src/lib/security-profile.ts` via `APP_ENV`. Não há nenhuma ocorrência de
   `APP_ENV` no projeto: os controles usam constantes fixas. A cláusula descreve um
   mecanismo que nunca foi implementado. Relevante agora porque §8 é justamente o que
   deveria impedir relaxamento de segurança em produção.

3. ~~**`keys.db` ainda rastreado no git**~~ — **este item estava errado.** Verificado na
   Sprint 19 (TASK-062): `git ls-files` não retorna nenhum `.db`/`.sqlite`, e a remoção já
   havia sido feita em `23c6bcd`, `2e83857` e `5874d62`. O ADR repetiu um débito obsoleto
   do `plan.md` sem reverificá-lo contra o repositório. Resta apenas o arquivo nos commits
   antigos do histórico, cujo expurgo é decisão à parte.

4. **429 sem `Retry-After`** — encontrada ao reescrever §2.6: `login/route.ts:30` devolvia
   o status sem o header que a cláusula exige. Corrigida na TASK-061.

---

## Consequências

### Positivas

- Sincronismo ~10× mais rápido (até 3.000 ms → ~100–300 ms) com ~99,9% menos requisições.
- Disponibilidade deixa de depender de uma máquina física na portaria.
- Acesso fora do campus sem túnel manual.
- Backup gerenciado, independente do host que ele protege.
- Trilha de auditoria ganha imutabilidade real (`REVOKE`) em vez de arquivo editável.
- Índices e `timestamptz` corrigem duas lacunas já identificadas: nenhum índice declarado
  no schema, e filtros de data não-sargáveis — este último já preparado na TASK-055.

### Negativas e riscos

- **Reescrita da camada de dados inteira.** 158 chamadas síncronas em 31 arquivos
  (`better-sqlite3` é síncrono por design; qualquer driver Postgres é assíncrono). Não há
  adaptador que evite isso. Risco de regressão mitigado por 125 testes automatizados.
- **Superfície de ataque cresce.** Sai da proteção implícita da rede local. Exige, antes
  do go-live: rotação do `JWT_SECRET` (o atual tem baixa entropia — UUID com sufixo) e
  autorização com defesa em profundidade (`src/proxy.ts` hoje só renova cookie e deixa
  passar requisição sem sessão; a verificação de papel é manual em cada handler).
- **Dependência de dois fornecedores externos** com planos gratuitos que podem mudar de
  termos. Mitigação no plano de reversão abaixo.
- **Projeto Supabase gratuito pausa após ~7 dias sem requisição.** Contornável com ping
  agendado via GitHub Actions — com a ressalva de que workflows agendados no GitHub são
  desativados após ~60 dias sem atividade no repositório.
- **Vercel Hobby proíbe uso comercial.** Uso institucional sem fins lucrativos e sem
  transação deve caber; confirmar nos termos antes do go-live.
- **Restore de backup muda de natureza.** Hoje é cópia de arquivo
  (`restore/route.ts:51`); não há equivalente em serverless. O usuário classificou este
  item como secundário e ele fica para depois da Etapa 7 — mas o endpoint atual deixa de
  funcionar e precisa ser **desativado, não deixado quebrado**.

### Impacto em testes

Os 125 testes usam SQLite em memória (`MOCK_DB_IN_MEMORY`). A Etapa 4 exige decidir entre
Postgres efêmero em container ou manter duplo dialeto. **Recomendação: Postgres real em
container** — testar contra dialeto diferente do de produção anula boa parte da garantia.

---

## Plano de Reversão

> ### ⚠️ Correção de 2026-09-04 — este plano protegia algo que não existe
>
> O plano abaixo, escrito e aprovado em 2026-09-02, pressupõe um sistema em produção:
> `keys.db` de produção íntegro, ponto de não-retorno na primeira escrita, e servidor PM2
> ligado por 30 dias. **Confirmado com o usuário em 2026-09-04: nada disso existe.** Não há
> servidor PM2 em uso, não há `keys.db` com dados reais, ninguém usa o sistema, e o
> conteúdo do banco anterior era fictício.
>
> Na prática o risco é **menor** do que este ADR supunha — sem estado anterior não há o que
> perder, e não existe ponto de não-retorno. Mas um documento aprovado que declara uma rede
> de segurança inexistente é pior do que um que admite não ter rede: alguém pode contar com
> ela numa decisão futura. Daí a correção, e não a remoção silenciosa.
>
> **O que de fato vale hoje:**
>
> 1. **Reversão de código é por git**, etapa a etapa, como antes. Isso continua verdadeiro
>    e é a única cláusula do plano original que sobrevive intacta.
> 2. **Não há dado a preservar.** Os dados hoje no Supabase são sintéticos (TASK-067), como
>    o `keys.db` que os originou.
> 3. **Não há PM2 para religar.** A remoção do aparato local (`.bat`, `ecosystem.config.js`,
>    `show-ip.js`, `/api/server-info`) deixa de depender de uma janela de retenção de 30
>    dias e entra na TASK-079 sem espera.
> 4. **O ponto de não-retorno se desloca para o primeiro dado REAL cadastrado em produção**
>    — que, pela decisão de 2026-09-04, é operação posterior ao go-live, feita pela UI.
>    Até lá, reverter custa um `git revert` e uma base recriada pelas migrations.
>
> A ciência formal da direção sobre PII em provedor terceiro (constitution §0) continua
> exigida — ela vale para quando o dado real entrar, não para o deploy em si.

### Texto original (2026-09-02) — mantido para rastreabilidade, **premissas inválidas**

Aplicável enquanto o SQLite não for descartado.

1. **Etapas 3–6 são reversíveis por git.** Cada etapa é uma sprint com commits próprios;
   `git revert` do intervalo devolve o sistema ao PM2 + SQLite.
2. ~~**O `keys.db` de produção não é destruído pela migração**~~ — a carga para o Postgres é
   cópia, não movimentação. Ele permanece como fonte íntegra até o go-live ser aceito.
3. ~~**Ponto de não-retorno: a primeira escrita em produção no Postgres.**~~ A partir daí,
   voltar exige exportar os dados novos do Postgres de volta para SQLite. Antes desse
   ponto, reverter custa um `git revert` e religar o PM2.
4. ~~**Retenção:** manter o servidor PM2 atual ligado e capaz de assumir por **30 dias**
   após o go-live, com o `keys.db` congelado no estado da virada.~~

---

## Aprovação — executada em 2026-09-02

| # | Ação | Estado |
|---|---|---|
| 1 | `constitution.md` §0, §1.3, §2.3, §2.5, §2.6, §4.3 e §7 atualizadas | ✅ |
| 2 | `spec.md` — changelog v2.0 + REQ-031 (operação fora do campus) e REQ-032 (sincronismo ≤ 500 ms) | ✅ |
| 3 | `plan.md` — Sprints 19 a 24 lançadas | ✅ |
| 4 | Etapa 3 iniciada pelo ciclo TDD | pendente da Sprint 19 |

As divergências pré-existentes foram aceitas para correção **antes** da Etapa 3, na
Sprint 19 (TASK-059 a TASK-062) — decisão do usuário na aprovação.
