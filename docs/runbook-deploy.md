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
| _(preencher)_ | E-mail da conta Vercel dona do projeto: `________________` | **Preencha esta linha.** Deixei em branco de propósito em vez de chutar |

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

| Nome | Valor | Observação |
|---|---|---|
| `DATABASE_URL` | String de conexão do Supabase, **modo pooler / transaction** | Serverless devolve a conexão a cada transação; o modo direto esgota o limite |
| `JWT_SECRET` | Segredo forte, ≥ 32 caracteres | **Recusado** se for UUID, caractere repetido ou o exemplo do `.env.example` (`src/lib/secret-policy.ts`) |
| `APP_TIMEZONE` | `America/Recife` | Sem ela, datas na tela saem no fuso do servidor |
| `APP_ENV` | `production` | O cookie de sessão passa a exigir HTTPS (`secure`) incondicionalmente |

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

**Não há runner automático de migrations para Postgres.** `db/migrate.mjs` é o
runner do SQLite antigo e **não serve** para o banco de produção (débito
registrado no `plan.md`). Em produção, aplique os arquivos à mão, **em ordem de
nome**, que é ordem cronológica:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations-pg/<timestamp>_<nome>.up.sql
```

Regras que não se negociam:

- **Ordem de nome, sempre.** Os arquivos são prefixados por timestamp.
- **Gere um backup antes** (§6.3, "Rodar o backup à mão").
- **Nunca edite o banco à mão.** Toda mudança de schema entra por um par
  UP/DOWN em `db/migrations-pg/` — o Gate 2 reprova UP sem DOWN.
- Para reverter, aplique o `.down.sql` correspondente.

> ⚠️ **Pendência conhecida:** a migration `202609041800_backup_runs.up.sql`
> (TASK-078) precisa ser aplicada ao Supabase **antes** da primeira execução do
> job de backup — é ela que cria a tabela onde cada execução é registrada. Sem
> ela o job falha no passo final e a tela de configurações fica sem métrica.

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

| Data | Quem | Tempo até o sistema no ar | Resultado |
|---|---|---|---|
| _(pendente — fazer após o primeiro backup real)_ | | | |

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
