# tasks.md — Micro-spec da Sprint Ativa (Sprint 23 · 🔴 crítica)

> **Etapa 7b do ADR-012 — Backup e Deploy.** A sprint que põe o sistema no ar e define o
> que acontece se o banco morrer.
>
> Canal: Claude Code · Modelo: Opus 5 · Esforço: alto.
> Criticidade 🔴: expõe o sistema à internet e decide a recuperabilidade dos dados.
>
> A Sprint 22 entregou o que faltava para o sistema ser **usável**. Esta entrega o que falta
> para ele ser **operável**: recuperável se o banco sumir, e alcançável por uma URL.

---

## ⚠️ Onde esta sprint para, e por quê

Três coisas desta sprint **não são minhas para fazer**. A micro-spec as trata como entrada
do usuário, não como task:

1. **Criar o projeto na Vercel e conectar o repositório** — exige autenticação numa conta sua.
2. **Cadastrar os secrets** (`DATABASE_URL` de produção, `JWT_SECRET`, o token do repositório
   de backup). Segredo que passa por mim é segredo queimado.
3. **Criar o repositório privado de backup.**

O que eu entrego é tudo que torna esses três passos mecânicos: configuração pronta,
workflows escritos, runbook com o passo a passo exato, e todo o resto verificável sem
credencial nenhuma. **O clique de deploy é seu** — direi exatamente quando.

---

## Decisões de execução

**D1 — O backup é `pg_dump` no GitHub Actions, não backup gerenciado.** Decidido em CR Tipo
D (`7770d2e`) depois de verificar a documentação: o plano gratuito do Supabase **não tem**
backup gerenciado, e a própria Supabase recomenda `db dump` + off-site. A §4.3 foi
corrigida; o alvo (RPO 24 h / RTO 4 h + verificação) não mudou.

**D2 — O destino é um repositório PRIVADO separado.** O repositório do código é público, e
em repo público os artefatos de workflow são baixáveis por qualquer um. Hoje os dados são
fictícios; a partir do cadastro real seriam PII de funcionários e alunos.

**D3 — Verificação por restauração, não por "o arquivo existe".** O job restaura o dump num
Postgres descartável e reconcilia contagens por tabela contra a origem. *Backup não
verificado não conta como backup* — um dump corrompido tem exatamente a mesma aparência de
um bom até a hora em que se precisa dele.

**D4 — A métrica lê o banco, e o job escreve nele.** Fecha o ciclo da TASK-075: o workflow
grava o resultado de cada execução — **inclusive as que falharam** — e a métrica passa a ler
fato em vez de promessa. Registrar só sucesso a tornaria inútil: 100% de sucesso e nenhuma
execução seriam indistinguíveis.

**D5 — O aparato local sai nesta sprint, sem janela de retenção.** Não existe PM2 em
produção (Achados de 2026-09-04), então não há o que manter ligado por 30 dias.

---

## TASK-078: Backup diário verificado, e o registro de cada execução

**Contexto**: `createBackup()` recusa desde a Sprint 21 e as rotas de restore/import
devolvem 503 citando esta task. **Não há backup nenhum hoje** — só a suposição, agora
desfeita, de que o provedor faria.

**Critérios BDD**:
- [x] **Cenário**: A tabela de execuções existe, com migration pareada
      Dado `db/migrations-pg/`
      Então há UP criando `backup_runs` e o DOWN correspondente escrito antes dele
      E o Gate 2 passa (constitution §4.1).
- [x] **Cenário**: Toda execução é registrada, inclusive a que falhou
      Dado um resultado de execução de backup
      Quando ele é gravado
      Então `backup_runs` guarda o instante, o resultado, o tamanho do dump e a mensagem de erro quando houver
      E execução malsucedida aparece como registro, não como ausência de registro.
- [x] **Cenário**: A trilha de backup é imutável como as demais
      Dada uma linha em `backup_runs`
      Quando se tenta `UPDATE` ou `DELETE`
      Então o banco recusa (mesma postura de `history` e `app_logs`).
- [x] **Cenário**: O workflow existe e roda diariamente
      Dado `.github/workflows/`
      Então há workflow agendado que faz `pg_dump`, envia para o repositório privado e grava em `backup_runs`
      E ele **não** deixa o dump em artefato deste repositório, que é público.
- [x] **Cenário**: A verificação é por restauração, não por existência
      Dado um dump recém-gerado
      Quando o job o verifica
      Então ele restaura numa base descartável e reconcilia as contagens por tabela contra a origem
      E divergência de contagem reprova o job.
- [x] **Cenário**: A falha é visível
      Dado um job que falhou
      Então o registro em `backup_runs` marca a falha com a mensagem
      E o job termina com código diferente de zero — falha silenciosa de backup é a pior classe possível.
- [x] **Cenário**: Nenhum segredo no workflow
      Dado o arquivo do workflow
      Então `DATABASE_URL` e o token vêm de `secrets.*`, nunca literais (constitution §6.2).

**O que a execução ensinou** (registrado aqui porque não estava na micro-spec):

- **Contar linhas não verifica backup — verifica dados.** O ciclo fechou verde com a
  reconciliação por contagem e só o ensaio derrubou isso: truncar o FIM de um dump não
  perde linha nenhuma, porque as instruções finais são esquema, não dados. No ensaio o
  dump truncado perdeu exatamente `ALTER TABLE public.users ENABLE ROW LEVEL SECURITY`.
  O `psql` restaurou sem erro, as contagens bateram, e a verificação APROVOU. Medido:
  origem com 11 tabelas sob RLS, restauração com 10. Daí `lerEsquema`/`compararEsquema` —
  tabelas, índices, triggers, RLS e funções —, que vão além da letra do critério BDD 5 de
  propósito: restaurar um backup com um controle de segurança a menos, no meio de um
  incidente, é a falha que ninguém procuraria.
- **O que os testes do workflow provam, e o que não provam.** Eles leem o YAML como texto:
  que a agenda existe, que o registro roda sob `always()`, que não há segredo literal e que
  o dump não vira artefato deste repositório, que é público. Nenhum deles executa o job.
  YAML não tem teste — por isso a decisão de aprovar ou reprovar mora em
  `db/verify-dump.mjs`, que tem. **A primeira execução real é a prova que falta, e ela
  depende dos secrets do usuário.**

---

## TASK-075: A métrica de confiabilidade passa a ler o banco

**Contexto**: `getBackupReliability()` lê `backups/backup-history.jsonl` — arquivo que
deixou de ser escrito quando o `backup.ts` foi neutralizado na Sprint 21, e que no Vercel
não existiria de qualquer forma. Hoje a métrica devolve "sem dados", e a tela não distingue
isso de "nenhum backup rodou".

**Critérios BDD**:
- [x] **Cenário**: A confiabilidade vem de `backup_runs`
      Dadas execuções registradas nos últimos 30 dias
      Quando a métrica é calculada
      Então o percentual reflete sucessos sobre dias com execução, lido do banco.
- [x] **Cenário**: "Nunca rodou" e "rodou e falhou" são estados diferentes na tela
      Dado nenhum registro de execução
      Então a métrica informa que não há execução registrada
      E isso **não** é apresentado como 0% nem como 100% — ambos seriam mentira.
- [x] **Cenário**: Nada mais lê o `.jsonl`
      Dado o código de `src/`
      Então não há referência a `backup-history.jsonl`
      E `backup.ts` sai da lista de exceção da guarda de filesystem da TASK-074.
- [x] **Cenário**: A rota de confiabilidade continua restrita
      Dada `/api/backups/reliability`
      Quando um não-ADMIN a acessa
      Então recebe 403 — trocar a fonte não afrouxa a autorização.

**O que a execução ensinou** (registrado aqui porque não estava na micro-spec):

- **São TRÊS estados sem número, não dois.** O critério pede para separar "nunca rodou" de
  "rodou e falhou". Escrever os cenários revelou o terceiro, e é o pior: **rodou por meses e
  parou**. Dentro de uma janela de 30 dias ele produz exatamente o mesmo `percent: null` de
  quem nunca rodou — e as duas situações não se parecem em nada. Por isso `lastRun` é lido
  **fora** da janela: é o que permite a tela dizer "sem execução nos últimos 30 dias; a
  última foi em 21/07/2026 e terminou verificada". Verificado no navegador.
- **O quarto estado é "não sei".** Se a leitura da métrica falhar, devolver "nenhuma
  execução" seria repetir o defeito desta task num lugar novo: a tela diria que o backup não
  rodou quando o que houve foi o banco não responder. A rota devolve 503 e a tela diz que
  não foi possível ler.
- **A condicional que escondia o bloco era o defeito, não um detalhe de layout.** A tela
  fazia `bkpReliability.totalDays > 0 && (...)`: sem execução nenhuma, o bloco inteiro sumia,
  e tela sem bloco é indistinguível de "está tudo bem". Por isso a decisão de apresentação
  virou função pura (`descreverConfiabilidade`), com teste nos quatro estados — condicional
  dentro de JSX não tem teste, exatamente como YAML não tem.
- **O que saiu junto, porque a guarda de filesystem não admite meio-termo.** Para
  `src/lib/backup.ts` sair da lista de exceção da TASK-074, o módulo tinha de perder TODO o
  acesso a disco — não só o `.jsonl`. Foram junto `getAvailableBackups`, `deleteBackup`, o
  `DELETE /api/backups` e os botões de restaurar e excluir da tela. A lista de exceção agora
  está **vazia**.

---

## TASK-079: Deploy, ping contra a pausa, e o fim do aparato local

**Contexto**: o projeto Supabase gratuito pausa após ~7 dias sem requisição (ADR-012), e o
repositório carrega scripts de uma topologia que não existe mais.

**Critérios BDD**:
- [x] **Cenário**: Há um endpoint de saúde, e ele não vaza nada
      Dado `/api/health`
      Quando acessado sem sessão
      Então responde 200 confirmando que a aplicação e o banco respondem
      E **não** revela versão, caminho, variável de ambiente nem contagem de dados.
- [x] **Cenário**: O ping agendado evita a pausa por inatividade
      Dado `.github/workflows/`
      Então há workflow agendado chamando `/api/health` em intervalo menor que a janela de pausa
      E fica registrada a ressalva de que workflows agendados são desativados após ~60 dias sem atividade no repo.
- [x] **Cenário**: O aparato local sai por inteiro
      Dado o repositório
      Então não existem `.bat`, `ecosystem.config.js`, `scripts/show-ip.js` nem `/api/server-info`
      E nenhum script do `package.json` os invoca
      E a suíte continua verde — nada de produção dependia deles.
- [x] **Cenário**: O build não exige banco
      Dado o repositório
      Quando `npm run build` roda **sem `DATABASE_URL` definida**
      Então ele passa — é a regressão que a TASK-068 já custou uma vez, e o deploy a
      encontraria de novo no pior momento.
- [x] **Cenário**: O runbook existe e é executável por outra pessoa
      Dado `docs/runbook-deploy.md`
      Então ele traz o passo a passo do deploy, dos secrets, do bootstrap do ADMIN e da restauração de backup
      E nomeia o responsável pós-entrega (constitution §4.3).

**O que a execução ensinou** (registrado aqui porque não estava na micro-spec):

- **O health e o ping são um mecanismo só, e ele tinha três jeitos de mentir.** (1) Responder
  200 porque o processo subiu: em serverless a instância sempre sobe, e o que pausa é o banco
  — por isso ele consulta. (2) O `curl` sem `--fail` trata 503 com corpo JSON como sucesso.
  (3) Mesmo com `--fail`, um proxy ou página de erro devolve **200 com HTML** — por isso o job
  também confere o corpo. Os três caminhos foram exercitados de verdade: com o container do
  Postgres parado, `/api/health` respondeu 503 e o `curl` do workflow saiu com código 22
  depois das tentativas; religado, voltou a 200.
- **A entrada no proxy não é detalhe de configuração.** Depois da TASK-077 rota nova nasce
  fechada. Sem `/api/health` na lista pública, o ping mediria a página de login — e 307 é
  resposta, então o monitor ficaria **verde com o banco parado**. Há cenário para isso.
- **O que estava errado no repositório era pior do que estar obsoleto: estava instruindo.**
  `docs/runbook.md` mandava parar o serviço PM2, copiar `keys.db` por cima e restaurar por um
  botão que a TASK-075 removeu. Os `.bat` chamavam `pm2` num app `sao-jose` — nome que nem
  batia com o `ecosystem.config.js` (`unifafire`) — e o `scripts/init-db.js`, removido na
  TASK-080. Nada disso funcionaria; tudo isso seria tentado.
- **A leitura do runbook do começo ao fim encontrou quatro lacunas**, todas do tipo que só
  aparece para quem não conhece o projeto: não dizia que é preciso ter `psql` (nem que ele vem
  sem o servidor, nem a alternativa por Docker); não dizia de qual máquina se roda o bootstrap;
  não dizia como gerar um `JWT_SECRET` que a política aceita; e mandava "criar a base de
  destino" sem dizer qual das duas opções serve para qual falha — no meio de uma restauração,
  que é o pior momento para decidir isso. As quatro foram corrigidas.

**O que falta, e é do usuário** (§ do runbook entre parênteses): criar o projeto na Vercel e
conectar o repositório (§2), cadastrar as variáveis e os secrets (§3), criar o repositório
privado de backup (§6.1), aplicar as migrations no Supabase — **incluindo a de `backup_runs`,
que ainda não está lá** (§4) — e limpar os dados sintéticos da TASK-067 de `users` antes do
bootstrap (§5).

---

## Definition of Done da sprint

- [x] Os 3 pares `test(TASK-NNN)` → `feat(TASK-NNN)` na ordem, suíte inteira verde a cada um
- [x] Migration de `backup_runs` com DOWN escrito antes do UP
- [x] `./scripts/ci-gates.sh` limpo (6 gates), `tsc --noEmit` 0, `eslint` 0
- [x] `npm audit` sem HIGH/CRITICAL — **lido inteiro, sem `head`/`tail` cortando**
- [x] `npm run build` verde **sem `DATABASE_URL` definida**
- [x] App exercitado no navegador contra o container — **último passo, depois da suíte**
- [x] Runbook lido do começo ao fim como se eu não soubesse nada do projeto
- [ ] Fase 11 + Memory Sync

> **Fora da DoD, porque não é meu:** o deploy em si, os secrets e o repositório privado de
> backup. A sprint fecha com tudo pronto e o runbook na mão — **não com o sistema no ar**.
