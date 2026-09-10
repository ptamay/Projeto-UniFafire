# Runbook — Deploy e Operação

> **TASK-079 (Sprint 23 · Etapa 7b do ADR-012).** Este documento substitui o
> `docs/runbook.md` original (TASK-036, Sprint 7), que descrevia uma topologia
> que não existe mais: PM2 numa máquina da instituição, banco em arquivo
> `keys.db`, atalhos `.bat` e restauração por botão na tela.
>
> Escrito para ser executado por **outra pessoa**, sem contexto do projeto. Se
> algum passo exigir saber algo que não está aqui, isso é defeito deste
> documento — corrija-o.

## Responsáveis (constitution §4.3)

| Papel | Quem | O que responde |
|---|---|---|
| Operador primário | Administração da UniFafire (conta ADMIN do sistema) | Uso diário, criação de usuários, conferência mensal das agendas (§7) |
| Suporte técnico / mantenedor | **Paulo Tamay** | Deploy, secrets, migrations, restauração de backup, ensaio semestral de restauração |

**Objetivos de recuperação:** **RPO 24 h** (perde-se no máximo um dia de
movimentações) · **RTO 4 h** (o sistema volta ao ar em até quatro horas).

---

## 0. O que você precisa antes de começar

Na **sua máquina** (o deploy é feito de fora, não de dentro do servidor):

| Ferramenta | Para quê | Como conferir |
|---|---|---|
| **Git** | Clonar o repositório | `git --version` |
| **Node.js 22+** | Rodar o bootstrap do ADMIN (§5) | `node --version` |
| **`psql`** (cliente PostgreSQL 17) | Aplicar migrations (§4) e restaurar backup (§6.5) | `psql --version` |

O `psql` é a única que costuma faltar. Ele vem no instalador do PostgreSQL
(postgresql.org/download) — **você não precisa do servidor, só das ferramentas de
linha de comando**. Alternativa sem instalar nada, se houver Docker:

```bash
docker run --rm -i postgres:17 psql "<URL>" -v ON_ERROR_STOP=1
```

### As contas, e uma pegadinha que já custou tempo

| Serviço | Conta | Observação |
|---|---|---|
| **GitHub** | `ptamay` — dono de `ptamay/Projeto-UniFafire` | Precisa de permissão de administrador para cadastrar secrets |
| **Vercel** | Escopo **`projeto-uni-fafire`** (`team_WIfabVaM7632RsSQheQDTEbW`), projeto `projeto-uni-fafire` | ⚠️ **É uma conta Vercel DIFERENTE da que está ligada ao GitHub `ptamay`.** Decisão de 2026-09-05: fica como está |
| **Supabase** | Projeto em `sa-east-1` | — |
| **Vercel — login** | `unifafiregc@gmail.com` | A conta que criou e é dona do projeto. Senha no gerenciador da instituição |

⚠️ **A pegadinha:** o `vercel` CLI autenticado como `ptamay` **não enxerga** esse
projeto — `vercel teams ls` lista só `ptamays-projects`, e qualquer
`vercel inspect ... --scope projeto-uni-fafire` responde *"The specified scope
does not exist"*. Não é erro de digitação nem de permissão no repositório: é
conta diferente. Para operar pelo CLI, entre com a conta dona do projeto; pelo
navegador, use o link do §8.

Os deploys funcionam mesmo assim porque quem os dispara é a **integração com o
GitHub**, não a conta do CLI.

> **Requisito operacional:** as credenciais dessa conta Vercel precisam estar no
> gerenciador de senhas da instituição, junto com o `JWT_SECRET`. Sem isso, o
> procedimento de incidente do §8 — "abra o painel da Vercel" — não é executável
> por quem estiver de plantão, e o responsável nomeado no topo deste documento
> responde por um sistema em que não consegue entrar.

---

## 1. A topologia, em cinco linhas

| Peça | Onde | Observação |
|---|---|---|
| Aplicação (Next.js) | **Vercel**, escopo `projeto-uni-fafire` | Execução serverless: sem processo longo, sem disco para escrever. Conta própria — ver §0 |
| Banco | **Supabase Postgres** (`sa-east-1`) | Plano gratuito: **pausa após ~7 dias sem requisição** |
| Backup | **GitHub Actions** → repositório **privado** | `pg_dump` diário, verificado por restauração (§6) |
| Ping de saúde | **GitHub Actions** | Impede a pausa por inatividade (§7) |
| Segredos | Vercel (aplicação) e GitHub (jobs) | Nunca no repositório, nunca no chat |

Não há PM2, não há `keys.db`, não há diretório `backups/` na aplicação, e o disco
do Vercel é efêmero e somente-leitura — nada que a aplicação escrever em arquivo
sobrevive à requisição.

---

## 2. Deploy na Vercel (primeira vez)

1. **Criar o projeto**: vercel.com → *Add New* → *Project* → importar este
   repositório. Framework detectado: Next.js. Não altere o comando de build.
   Em *Production Branch*, escolha a branch que deve ir ao ar — a partir daí,
   todo push nela publica.
2. **Configurar as variáveis de ambiente** (§3) **antes do primeiro deploy**. Sem
   `JWT_SECRET` válido o processo **não sobe** — é deliberado
   (`src/lib/secret-policy.ts`).
3. **Deploy**. Ao terminar, guarde a URL (`https://<projeto>.vercel.app`).
4. **Aplicar as migrations** no banco de produção (§4).
5. **Criar o primeiro ADMIN** (§5).
6. **Configurar os jobs** de backup (§6) e de ping (§7).
7. **Conferir**: abra `https://<projeto>.vercel.app/api/health`. Resposta
   esperada, sem estar logado:

   ```json
   {"status":"ok","database":"ok"}
   ```

   Se vier `503` com `"database":"down"`, a aplicação subiu mas não alcança o
   banco — revise a `DATABASE_URL` (§3).

### Atualizações depois da primeira vez

Push na branch de produção → a Vercel constrói e publica sozinha. **Migration
nova não é aplicada pelo deploy** — veja §4.

---

## 3. Variáveis e segredos

### 3.1 Na Vercel (Settings → Environment Variables)

Entre com a conta do §0, abra o projeto `projeto-uni-fafire` →
**Settings** → **Environment Variables** → *Add Another*. Para cada variável:
nome, valor, e **marque os ambientes** em que ela vale.

A coluna dos ambientes não é detalhe — ela decide se o build do PR passa e se um
preview público alcança os dados reais:

| Nome | Valor | Ambientes | Por quê |
|---|---|---|---|
| `JWT_SECRET` | Segredo forte, ≥ 32 caracteres | **Production + Preview + Development** | É exigido em tempo de **BUILD**: `session-edge.ts` valida na importação do módulo, e o Next importa as rotas ao coletar dados das páginas. Faltando em Preview, **o build do PR falha** |
| `APP_TIMEZONE` | `America/Recife` | Production + Preview + Development | Sem ela, datas na tela saem no fuso do servidor |
| `APP_ENV` | `production` | Production + Preview | O cookie de sessão passa a exigir HTTPS (`secure`) incondicionalmente |
| `DATABASE_URL` | String de conexão do Supabase, **modo pooler / transaction** | **SÓ Production** | Ver o aviso abaixo. Serverless devolve a conexão a cada transação; o modo direto esgota o limite do plano |

> ⚠️ **Por que `DATABASE_URL` fica fora de Preview.** Todo PR ganha uma URL de
> preview **pública**. Apontá-la para o banco de produção põe os dados reais
> atrás de um endereço que qualquer pessoa com o link alcança, e um preview de
> branch pode conter código não revisado. Sem a variável, o preview constrói
> normalmente (o build não precisa do banco) e o `/api/health` dele responde
> `503` — o que é a resposta honesta: aquela instância não tem banco.

Marque `JWT_SECRET` e `DATABASE_URL` como **Sensitive** ao salvar: o valor deixa
de ser legível de volta no painel.

**Variável cadastrada não se aplica sozinha a um deploy que já existe.** Depois
de salvar, vá em *Deployments*, abra o mais recente e use **Redeploy** — ou
empurre um commit novo.

Onde achar a string de conexão: Supabase → *Project Settings* → *Database* →
*Connection string* → aba **Transaction pooler**.

Como gerar um `JWT_SECRET` que a política aceita:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Guarde-o no gerenciador de senhas da instituição. **Trocar esse segredo derruba
todas as sessões ativas** — o que é o procedimento certo se ele vazar.

### 3.2 No GitHub (Settings → Secrets and variables → Actions)

**Secrets:**

| Nome | Valor |
|---|---|
| `PROD_DATABASE_URL` | A mesma string de conexão do Supabase |
| `BACKUP_REPO` | `usuario/nome-do-repositorio-privado` (§6.1) |
| `BACKUP_REPO_TOKEN` | Personal Access Token com escrita **apenas** nesse repositório |

**Variables:**

| Nome | Valor |
|---|---|
| `HEALTH_URL` | `https://<projeto>.vercel.app/api/health` |

> `HEALTH_URL` é *variable* e não *secret* porque a URL é pública por definição —
> quem abre o sistema já a conhece. Ela fica fora do repositório apenas para que
> o endereço de produção não seja versionado num repositório público.

---

## 4. Migrations

**Desde o ADR-021 há runner: `db/runner-migracoes.mjs`.** Ele aplica em ordem de
nome, cada migration numa transação junto com o seu registro na tabela
`migracoes_aplicadas`, e para na primeira falha. (`db/migrate.mjs` é o runner do
SQLite antigo e **não serve** para produção.)

```bash
# o que falta, o que mudou depois de aplicado, o que está no banco sem arquivo
# (sai com código 1 se houver qualquer um dos três)
DATABASE_URL="<URL>" node db/runner-migracoes.mjs conferir

# aplica o que estiver pendente
DATABASE_URL="<URL>" node db/runner-migracoes.mjs aplicar
```

Regras que não se negociam:

- **Gere um backup antes** (§6.3, "Rodar o backup à mão").
- **Nunca edite o banco à mão.** Toda mudança de schema entra por um par
  UP/DOWN em `db/migrations-pg/` — o Gate 2 reprova UP sem DOWN. SQL colado no
  editor do Supabase não entra no registro, e é assim que o ledger antigo divergiu.
- **Nunca edite uma migration já aplicada.** O registro guarda o hash do arquivo, e
  `conferir` acusa a alteração — escreva uma migration nova.
- Para reverter, aplique o `.down.sql` correspondente à mão **e apague a linha dela
  em `migracoes_aplicadas`**, senão o runner nunca a reaplica.

#### 4.0 Adoção — uma vez só, na primeira vez que o runner encontra o banco

O registro nasce vazio e produção não: as migrations até
`202609101000_tutorial_visto` foram aplicadas à mão. Rodar `aplicar` direto
tentaria reexecutá-las. A adoção as marca como `adotada` **sem executar nenhuma**:

```bash
DATABASE_URL="<URL>" node db/runner-migracoes.mjs adotar 202609101000_tutorial_visto
DATABASE_URL="<URL>" node db/runner-migracoes.mjs conferir   # tem de sair limpo
```

- **`ate` é obrigatório** e é o nome da última migration que você SABE estar no
  banco. Adotar além dele marcaria como aplicado algo que nunca rodou.
- **Antes de marcar, ela confere no catálogo** cada tabela, índice, função, trigger
  (na tabela certa), coluna, restrição e RLS que as migrations declaram. Faltou um,
  **recusa tudo** e lista o que falta — não adota pela metade.
- **Se recusar, NÃO insista:** o banco não tem o que o repositório diz. Aplique a
  migration que falta (ou descubra por que ela não está lá) e adote de novo.
- Migration só de dados (`UPDATE`/`DELETE`) não deixa nada no catálogo: é adotada
  **e dita como não conferida** na saída. Hoje é só a `202609090900`.
- Uma recusa deixa a tabela `migracoes_aplicadas` criada e vazia de adoções. É
  inofensivo; a próxima tentativa segue dali.
- ⚠️ **Adote ANTES de publicar o código da TASK-103.** Desde ela, `/api/health`
  responde 503 `schema_pendente` quando o registro não tem o que o código espera —
  e **sem registro nenhum, tudo está pendente**. Publicar antes da adoção deixa o
  health vermelho (o sistema continua servindo; o que falha é o aviso).

#### 4.0.1 Quem avisa quando o código chega antes do schema

`/api/health` compara `src/lib/migracoes-esperadas.ts` com o registro e responde
**503 `schema_pendente`** se faltar alguma; os nomes vão só para o log da função na
Vercel. Dois workflows perguntam a ele e falham — o GitHub avisa por e-mail:

- **`pos-deploy.yml`**, a cada deploy de produção bem-sucedido, minutos depois do
  merge. É o que fecha a janela da TASK-093.
- **`keepalive.yml`**, uma vez por dia, como rede.

Viu `schema_pendente`? Rode `conferir` para ver quais, e `aplicar`. Nenhum dos dois
workflows aplica nada — eles não têm credencial de banco, e não devem ter.

Toda migration nova precisa entrar também em `src/lib/migracoes-esperadas.ts`; a
suíte reprova se a lista e o diretório divergirem.

#### 4.0.2 Migration que toca dados: ensaio sobre a cópia ANTES de produção

A suíte prova toda migration numa base vazia, com ida e volta (ADR-022). O que ela
não prova é o que depende de dado: `SET NOT NULL` sobre linhas nulas, `UNIQUE` sobre
duplicatas, quantas linhas um `UPDATE` pega. Migration que faz `INSERT`/`UPDATE`/
`DELETE`/`TRUNCATE`, ou que põe restrição em tabela existente, é **ensaiada sobre o
backup mais recente** — a suíte reprova enquanto não houver o registro do ensaio.

1. Baixe o dump mais recente e restaure numa base **descartável** (§6.5, passos 2–4) —
   nunca no projeto de produção. Se o backup for anterior à adoção (2026-09-10), adote
   nela primeiro (`adotar`, §4.0).
2. Ensaie, apontando para a CÓPIA:

   ```bash
   DATABASE_URL="<cópia local>" node db/runner-migracoes.mjs ensaiar <migration> backups/AAAA/MM/AAAA-MM-DD.sql.gz
   ```

   Ele aplica o UP numa transação, conta as linhas de cada comando e as tabelas cuja
   contagem mudou, faz a ida e volta **sobre os dados** (DOWN → schema idêntico → UP),
   e grava `db/migrations-pg/<migration>.ensaio.md`. Se o dado violar a migration, ou o
   DOWN não restaurar, ele recusa nomeando o motivo e a cópia volta a como estava.
   Com uma URL do Supabase ele **recusa antes de conectar**.
3. **Leia os números** antes de publicar — `UPDATE 40` onde se esperava 2 é o motivo de
   o ensaio existir. Versione o `.ensaio.md` junto com a migration. Não o edite à mão: ele
   leva o checksum do UP, e mudar o UP depois vence o ensaio.
4. **Apague o dump e a base descartável.** Eles têm a PII de produção.

> Primeiro ensaio real, 2026-09-10, retroativo: `202609090900_sem_senha_compartilhada`
> sobre o backup de 2026-09-09 (anterior a ela) — `DELETE 1`, `UPDATE 0`, ida e volta
> ok. Bate com a conferência que em 2026-09-09 teve de ser feita no próprio banco de
> produção; agora sai da cópia.

> Verificado em 2026-09-10 contra o **backup de produção daquele dia**, restaurado numa
> base descartável: 9 adotadas (8 conferidas + a de dados), `conferir` limpo,
> `aplicar` sem nada a fazer, e o dump antes/depois **idêntico linha a linha** fora do
> registro. Com o trigger `history_no_delete` removido, a RLS de `users` desligada e a
> coluna `onboarding_visto_em` apagada, a adoção recusou nomeando as três e não
> marcou nada.

### 4.1 Como descobrir o que já foi aplicado

> ✅ **Desde 2026-09-10 a resposta é `node db/runner-migracoes.mjs conferir`** (§4).
> Produção foi adotada naquele dia: 48 de 48 objetos declarados conferidos no catálogo,
> 9 migrations `adotada` + o registro `aplicada`. O que segue abaixo é o registro de por
> que o ledger do Supabase foi abandonado — continua valendo como aviso, não como
> procedimento.

> ⚠️ **NÃO CONFIE NO LEDGER DO SUPABASE.** Até 2026-09-07 esta seção mandava
> consultá-lo e o chamava de "única fonte confiável". **Ele não é**, e a medição
> daquele dia provou nos dois sentidos ao mesmo tempo. Leia o resto desta seção
> antes de tomar qualquer decisão a partir dele.

O Supabase mantém um registro próprio das migrations, no schema
`supabase_migrations`:

```bash
psql "$DATABASE_URL" -c "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;"
```

(Pelo painel: Supabase → *Database* → *Migrations*.)

**Por que ele não serve como fonte de verdade.** Os conjuntos **divergem nos dois
sentidos**:

| | no repositório | no ledger | está no banco? |
|---|---|---|---|
| `search_path_history_imutavel_task_065` | **não existe** | sim | sim |
| `202609061800_sinal_realtime` | sim | **não** | **sim** — o sinal do Realtime funciona em produção |
| `202609081200_codigo_de_reset` | sim | **não** | **sim** — aplicada à mão em 2026-09-08 |
| `202609090900_sem_senha_compartilhada` | sim | **não** | **sim** — aplicada em 2026-09-09 |

Ou seja: o ledger **mostra o que não tem arquivo e esconde o que está aplicado**, e
não se pode tratá-lo nem como limite inferior nem como superior do que está no banco.

> **A divergência cresce a cada aplicação, e já foram duas em dois dias.** Em
> 2026-09-07 este texto dizia "seis entradas e seis arquivos", e observava que o número
> igual escondia duas divergências. Depois disso:
>
> | data | migration | entrou no ledger? |
> |---|---|---|
> | 2026-09-08 | `202609081200_codigo_de_reset` | **não** |
> | 2026-09-09 | `202609090900_sem_senha_compartilhada` | **não** |
>
> Hoje: **oito arquivos, seis entradas, quatro divergências.** Não é descuido de quem
> aplicou — aplicar SQL fora da CLI do Supabase **não escreve no ledger, e nada avisa**.
> É a previsão do parágrafo abaixo se cumprindo duas vezes seguidas, e é o argumento
> inteiro do ADR-021.

Some-se a isso que **os nomes não batem com os arquivos** — o ledger guarda o nome
que quem aplicou digitou. Comparar por nome não funciona em nenhuma direção.

A causa é conhecida e está registrada como Change Request em aberto: **não há
runner de migrations**. Elas são aplicadas à mão, e o ledger só recebe entrada
quando quem aplicou se lembra de escrevê-la — ou quando usa uma ferramenta que a
escreve por ele. Enquanto o runner não existir, a divergência tende a crescer a
cada migration aplicada.

#### O conferidor que vale: o schema

**Pergunte ao banco o que ele tem, não ao registro do que disseram que ele tem.**
Foi assim que se descobriu, no dia do go-live, que faltavam duas migrations que
ninguém sabia estarem pendentes:

```bash
# as tabelas
psql "$DATABASE_URL" -c "\dt public.*"

# os triggers — é aqui que mora a imutabilidade da §7.1, e um trigger ausente
# NÃO se manifesta: a escrita proibida simplesmente passa
psql "$DATABASE_URL" -c "SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE NOT tgisinternal ORDER BY 2, 1;"

# as funções
psql "$DATABASE_URL" -c "\df public.*"
```

As **11 tabelas** esperadas estão listadas em `TABELAS_ESPERADAS`, no
`db/backup-run.mjs`. Menos que isso significa migration faltando. O ensaio de
restauração do §6.6 registra o esperado completo: 11 tabelas, 23 índices, 6
triggers, 11 sob RLS, 4 funções.

> **Migration que falta CALA em vez de gritar.** Uma tabela ausente quebra na
> primeira consulta e você descobre em minutos. Um TRIGGER ausente não quebra
> nada — só deixa de proibir o que deveria proibir, e você descobre quando alguém
> já apagou a trilha. Confira os triggers, não só as tabelas.

### 4.2 Estado em 2026-09-07

Todas as migrations conhecidas estão aplicadas. As 11 tabelas existem, com RLS
ligado, e os triggers de imutabilidade de `history`, `app_logs` e `backup_runs`
estão no lugar.

A coluna **onde aparece** é o ponto do §4.1: nenhuma das duas fontes, sozinha,
descreve o que está no banco.

| Aplicada | Onde aparece | O que traz |
|---|---|---|
| `baseline_postgres_task_063` | ledger + repositório | As 9 tabelas de base |
| `indices_task_064` | ledger + repositório | Índices de consulta |
| `imutabilidade_historico_task_065` | ledger + repositório | Trigger de imutabilidade de `history` |
| `search_path_history_imutavel_task_065` | **só no ledger** | Correção do `search_path` — sem arquivo no repositório |
| `app_logs` | ledger + repositório | Tabela `app_logs` (TASK-074) |
| `backup_runs` | ledger + repositório | Tabela `backup_runs` (TASK-078) |
| `202609061800_sinal_realtime` | **só no repositório** | Trigger de sinal do Realtime (TASK-072). **Está no banco** — validado em produção em 2026-09-06, com `UPDATE ... WHERE false` e o sinal recebido por um cliente real |
| `202609081200_codigo_de_reset` | **só no repositório** | `users.reset_code_hash` e `users.reset_code_expires_at` + índice parcial (TASK-093, ADR-017). Aplicada à mão em 2026-09-08, **depois** de o código já estar no ar — ver o aviso abaixo |
| `202609090900_sem_senha_compartilhada` | **só no repositório** | Apaga `settings.default_reset_password` e invalida contas com reset pendente ANTIGO (TASK-094, ADR-017). Aplicada em 2026-09-09, com a conferência prévia: **0 contas afetadas** pelo `UPDATE`, e nenhuma ficou sem acesso |

> ⚠️ **MERGE NÃO APLICA MIGRATION — e o intervalo entre os dois é uma janela quebrada.**
> Em 2026-09-08 a TASK-093 foi mergeada e a Vercel publicou o código antes de as colunas
> existirem. O login continuou funcionando (o `SELECT *` devolve coluna ausente como
> `undefined` e a checagem do código simplesmente não casa), mas **resetar acesso e criar
> usuário responderam 500** até a migration ser aplicada à mão — `UPDATE` referenciando
> coluna inexistente.
>
> Nada se perdeu e ninguém ficou sem acesso; o que parou foi o balcão conseguir cadastrar
> gente nova ou resetar quem esqueceu a senha. **Ao mergear um PR que traga migration,
> aplique-a ANTES ou imediatamente depois**, e confira o schema (§4.1) em vez de supor.
> O runner existe (§4), mas **não roda sozinho no merge** — de propósito (ADR-021).
> A ordem continua sendo responsabilidade de quem faz o merge: `aplicar` antes ou
> logo depois, e `conferir` para ter certeza.

> **Por que `app_logs` quase passou batido, e o que isso ensina.** Ela ficou
> pendente desde a Sprint 22 sem ninguém notar, porque a falta dela **não produz
> erro visível**: o logger degrada para console e a requisição segue respondendo
> 200 (é o desenho da TASK-074, e há teste afirmando isso). O sistema pareceria
> saudável e a trilha de auditoria simplesmente não existiria. Já a falta de
> `backup_runs` faz barulho — o job de backup falha no passo final.
>
> A lição para a próxima migration: **conferir o schema depois de aplicar, não
> só o código de saída do comando.** Migration que falta cala em vez de gritar.

---

## 5. Criar o primeiro ADMIN (bootstrap)

Não existe usuário padrão. Não existe `admin/admin` — foi removido na TASK-080.

Rode **da sua máquina**, dentro do repositório clonado (`npm ci` antes, se for a
primeira vez). Não há como fazer isso pela Vercel:

```bash
DATABASE_URL="<a string de conexão de produção>" node db/bootstrap-admin.mjs
```

O que o script faz e o que ele **recusa** fazer:

- Cria **um** usuário ADMIN com senha **aleatória**, impressa **uma única vez**
  no terminal. Ela não é gravada em lugar nenhum — copie na hora.
- **Recusa rodar se já houver qualquer usuário na base.** É proteção por
  construção (`NOT EXISTS` dentro do próprio SQL), não uma checagem que dá para
  contornar.
- O primeiro login **exige trocar a senha**.

> ⚠️ Se o projeto Supabase ainda tiver os dados sintéticos da TASK-067, o
> bootstrap vai recusar. Limpar a tabela `users` é pré-requisito — e é uma
> operação destrutiva: confirme que está no projeto certo antes.

---

## 6. Backup

### 6.1 Antes da primeira execução

1. **Crie um repositório PRIVADO** para os dumps (ex.: `unifafire-backups`).
   O repositório do código é público, e em repositório público os artefatos de
   workflow são baixáveis por qualquer pessoa. **O dump não pode encostar aqui.**
2. Cadastre os três secrets de §3.2.
3. Aplique a migration de `backup_runs` (§4).
4. Dispare o job à mão (§6.3) e confirme que ele terminou verde.

### 6.2 O que o job faz, todo dia às 03:00 (America/Recife)

`.github/workflows/backup.yml`:

1. `pg_dump` do banco de produção, comprimido.
2. **Restaura o dump numa base descartável** e reconcilia contra a origem: a
   contagem de linhas de cada tabela **e** o esquema (tabelas, índices, triggers,
   funções e quais tabelas estão sob RLS).
3. Envia o dump para o repositório privado, em `backups/AAAA/MM/AAAA-MM-DD.sql.gz`.
4. **Registra a execução em `backup_runs` — inclusive quando falha.**

Divergência reprova o job. *Backup não verificado não conta como backup*: um dump
truncado restaura sem erro nenhum e só se revela no dia em que for necessário.

### 6.3 Rodar o backup à mão

GitHub → **Actions** → *Backup diário verificado* → **Run workflow**. Use isto
antes de qualquer migration e antes de qualquer operação destrutiva.

### 6.4 Onde ver se o backup está bem

Tela **Configurações** (perfil ADMIN), card **Backup**. Quatro estados
possíveis, e eles não significam a mesma coisa:

| O que aparece | O que é |
|---|---|
| **100% de confiabilidade** | Todos os dias com execução terminaram verificados. É o alvo |
| **Um percentual abaixo de 100%** | Houve dia com falha. Veja a lista de execuções logo abaixo, com a mensagem de erro |
| **Nenhuma execução de backup registrada** | O backup **nunca rodou**. Não há cópia dos dados. Volte para §6.1 |
| **Sem execução nos últimos 30 dias** | Rodou antes e **parou**. Suspeite dos ~60 dias do §7 |
| **Não foi possível ler as execuções** | Não sabemos — o banco não respondeu. Não confunda com "não rodou" |

### 6.5 Restaurar um backup

> Não existe botão de restaurar na tela. Foi removido na TASK-075: restauração é
> procedimento com credencial, feito aqui.

1. **Não sobrescreva a evidência.** Se o banco atual está corrompido mas
   acessível, não o apague — crie uma base nova e restaure nela.
2. Baixe o dump do repositório privado (`backups/AAAA/MM/AAAA-MM-DD.sql.gz`).
   Prefira o mais recente **que tenha aparecido como verificado** em §6.4.
3. **Crie a base de destino.** Duas opções, e a escolha depende do que quebrou:
   - **Projeto Supabase novo** — se o projeto atual está inacessível, pausado
     além do recuperável, ou se você não confia mais nele. É o caminho mais
     seguro; custa criar o projeto e esperar a base subir (alguns minutos).
   - **Base nova no mesmo projeto** — se o Postgres responde e o problema foi
     de dados. Mais rápido, e mantém a evidência do estado atual intacta.

   O dump traz o schema inteiro: **não** aplique as migrations antes de
   restaurar, ou o `psql` vai encontrar objetos já existentes e parar.
4. Restaure:

   ```bash
   gunzip -c AAAA-MM-DD.sql.gz | psql "<URL_DA_BASE_NOVA>" -v ON_ERROR_STOP=1
   ```

   `ON_ERROR_STOP=1` não é opcional: sem ele o `psql` engole erros e você fica
   com uma restauração parcial parecendo bem-sucedida.
5. Confirme antes de apontar a aplicação para ela:

   ```bash
   node db/verify-dump-cli.mjs "<URL_DA_ORIGEM>" "<URL_DA_BASE_NOVA>"
   ```

   Sem origem viva para comparar, confira ao menos que as tabelas esperadas
   existem e que `users` está sob RLS.
6. Troque a `DATABASE_URL` na Vercel (§3.1) e force um novo deploy.
7. Verifique `/api/health`, faça login e confira o histórico.

### 6.6 Ensaio de restauração (semestral — constitution §4.3)

O job prova que o dump **volta**. Ele **não** prova o RTO de 4 h: ninguém
cronometrou o caminho completo. O mantenedor deve executar §6.5 de ponta a ponta
uma vez por semestre, cronometrar, e registrar aqui:

| Data | Quem | Tempo | Resultado |
|---|---|---|---|
| 2026-09-06 | Claude Code (assistido) | **72 s** para as etapas 1–5 | ✅ Restauração íntegra. Ver detalhamento abaixo |

**O que este ensaio cobriu (etapas 1 a 5 do §6.5):**

| Etapa | Tempo | Resultado |
|---|---|---|
| Baixar o dump do repositório privado + descomprimir | 1 s | 4.739 B → 31.870 B (1.050 linhas) |
| Criar a base descartável e restaurar (`ON_ERROR_STOP=1`) | 1 s | **sem um único erro** |
| Conferir estrutura | — | 11 tabelas · 23 índices · 6 triggers · 11 sob RLS · 4 funções |
| Conferir dados | — | **67 linhas**, idêntico ao que o job registrou |
| Conferir que os controles FUNCIONAM | — | ver abaixo |

**A verificação que vale mais que as contagens.** Objeto de esquema pode existir e não
funcionar. Os guardas foram exercitados na base restaurada, não apenas contados:

```
UPDATE app_logs  → ERROR: §7: app_logs é imutável — UPDATE bloqueado
DELETE backup_runs → ERROR: §4.3: backup_runs é imutável — DELETE bloqueado
```

E o ADMIN voltou utilizável: `admin` · papel ADMIN · hash bcrypt `$2b$` de 60 caracteres ·
ativo. Um dump que restaura tudo menos a capacidade de entrar no sistema não serviria para
recuperar coisa alguma.

**⚠️ O que este ensaio NÃO cobriu, e por isso o RTO de 4 h ainda não está medido:**

1. **Provisionar a base de destino real.** A restauração foi para um Postgres descartável
   local, não para um projeto Supabase novo — que leva alguns minutos para subir e exige
   conta.
2. **Repontar a aplicação** (trocar `DATABASE_URL` na Vercel + redeploy) e confirmar o
   sistema no ar com o dado restaurado.
3. **O tempo humano**: perceber o incidente, decidir restaurar, encontrar o dump certo.
   Na prática costuma dominar os outros dois.

O que o ensaio prova é que **a parte técnica da restauração é de segundos e o dump está
íntegro** — o que remove a maior incógnita. As etapas 1 a 3 acima são as que faltam
cronometrar, e exigem credencial de produção.

**Nota de escala:** o dump tinha 67 linhas. Com dados reais de um semestre, a restauração
levará mais — mas a ordem de grandeza continua muito abaixo do RTO. O gargalo de 4 h nunca
foi o `psql`.

---

## 7. Ping de saúde, e os ~60 dias

`.github/workflows/keepalive.yml` bate em `/api/health` todo dia às 18:00 UTC.
Sem isso o projeto Supabase **pausa após ~7 dias sem requisição**, e o sistema
volta indisponível sem avisar ninguém.

> ⚠️ **O GitHub desativa workflows agendados após ~60 dias sem atividade no
> repositório.** Num período de férias, sem commits, **as duas agendas morrem
> caladas** — o ping e o backup — e o banco pausa poucos dias depois. Isso não
> tem solução dentro do próprio agendamento: o mecanismo que falharia é o mesmo
> que teria de avisar.
>
> **Mitigação, e ela é humana:** uma vez por mês, abra **Actions** e confirme que
> *Backup diário verificado* e *Ping de saúde* rodaram nos últimos dias. Um
> **Run workflow** manual reinicia a contagem dos 60 dias.

---

## 8. Incidentes comuns

| Sintoma | O que fazer |
|---|---|
| Sistema não abre | `GET /api/health`. `503` = banco fora ou pausado → abra o painel do Supabase e despause. Sem resposta nenhuma → painel da Vercel em https://vercel.com/projeto-uni-fafire/projeto-uni-fafire (§0: exige a conta dona do projeto, não a do GitHub), últimos deploys e *Build Logs* |
| "Projeto pausado" no Supabase | Despause pelo painel; confira depois se o ping está rodando (§7) |
| Processo não sobe, erro de segredo | `JWT_SECRET` ausente ou fraco. Ele é recusado por política (§3.1) — troque por um segredo forte e faça novo deploy |
| Backup falhando | §6.4 para ver o erro registrado; depois a execução do job em Actions. Token expirado é a causa mais comum |
| Nenhuma execução registrada | O job nunca rodou: §6.1 |
| Login recusa senha correta logo após rodar a suíte de testes | Ambiente de desenvolvimento: a suíte dá `TRUNCATE` no mesmo banco. Não é defeito de autenticação. Rode `node db/bootstrap-admin.mjs` de novo |
| Operação destrutiva contestada | Trilha em `/logs` (tela de Logs, perfil ADMIN) e tabela `app_logs`, que é imutável por trigger |

---

## 9. O que NÃO existe mais

Registrado para que ninguém procure — ou reconstrua:

- **PM2**, `ecosystem.config.js` e os `.bat` (`Ligar_Sistema`, `Desligar_Sistema`,
  `Build_Producao`, `iniciar_sistema`) — removidos na TASK-079.
- **`scripts/show-ip.js`** e a rota **`/api/server-info`** — expunham IPs da rede
  interna, hostname, plataforma e uptime da máquina. Removidos na TASK-079.
- **Acesso por IP da rede interna** (`http://192.168.x.x:3000`) — o acesso agora é
  uma URL só.
- **`keys.db`, `backups/*.db` e restauração por botão** — a stack é Postgres desde
  a Sprint 21; a restauração está em §6.5.
- **`scripts/init-db.js` e o usuário `admin/admin`** — removidos na TASK-080. O
  caminho é §5.
