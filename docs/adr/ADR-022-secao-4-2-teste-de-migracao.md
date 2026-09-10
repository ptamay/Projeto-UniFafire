# ADR-022 — A §4.2 exige ida e volta, e cópia de produção quando a migration toca dados

- **Status:** Aceito — aprovado pelo usuário em 2026-09-10. TASK-106 feita em 2026-09-10
  (a base de teste reproduz o `pg_default_acl` lido em produção; a ida e volta achou o
  `PUBLIC` que o DOWN da imutabilidade esquecia). TASK-107 feita em 2026-09-10 (primeiro
  ensaio real, retroativo, da `202609090900`: `DELETE 1`, `UPDATE 0`). Falta a TASK-108
- **Data:** 2026-09-10
- **Tipo de Change Request:** **D** (altera `constitution.md` §4.2)
- **Relacionado:** constitution §4.1, §4.2 · ADR-021 · runbook §4, §6.5 · regra `20-migrations`
- **Origem:** achado ao fechar o ADR-021 — a §4.2 envelheceu do mesmo jeito que a §4.1

## Contexto

A §4.2 diz, desde a Fase 6:

> **Teste de migração:** UP + DOWN testados contra uma CÓPIA do banco (`backups/` ou
> cópia temporária) antes de tocar o banco de produção. Nunca aplicar migração direto
> em `keys.db` de produção.

O que envelheceu à vista é o **meio**: `keys.db` não é produção desde o go-live
(Postgres no Supabase), e `backups/` era a pasta de cópias do SQLite — o backup de
hoje é `pg_dump` num repositório privado. Mas o levantamento feito para este ADR
mostrou que o problema não é só de letra. **O princípio também não está sendo
cumprido**, em duas metades:

### 1. O DOWN nunca foi executado

Medido em 2026-09-10: das 10 migrations de `db/migrations-pg/`, **nenhum `.down.sql`
é executado** por teste ou procedimento. As guardas conferem que o arquivo existe e,
em alguns casos, o que ele diz (`DROP TRIGGER`, o aviso de que senhas invalidadas não
voltam). A regra `20-migrations` exige que o DOWN restaure "o estado EXATO anterior".
Ninguém verificou isso uma vez sequer.

A primeira ida e volta de verdade foi feita para este ADR, numa base descartável
(UP → DOWN → comparar o schema com o de antes do UP → UP de novo):

| migration | DOWN restaura o anterior? | UP de novo |
|---|---|---|
| `baseline_postgres` | exato | ok |
| `indices` | exato | ok |
| `imutabilidade_historico` | **diverge em 81 linhas** | ok |
| `app_logs`, `backup_runs`, `sinal_realtime` | exato | ok |
| `codigo_de_reset`, `sem_senha_compartilhada` | exato | ok |
| `tutorial_visto`, `registro_de_migracoes` | exato | ok |

### 2. A divergência não é do DOWN — é da BASE DE TESTE

O DOWN da imutabilidade devolve `GRANT ALL` a `anon` e `authenticated` porque, no
Supabase, **toda tabela nova em `public` já nasce com esses grants**: é o default
privilege da plataforma, e o próprio cabeçalho do DOWN diz que restaura "os
privilégios como o Postgres os deixa por padrão no Supabase". O Postgres puro da
suíte não tem esse default — `pg_default_acl` está **vazio** lá. O DOWN está certo
para produção e "errado" para um banco que não existe em lugar nenhum.

É a mesma classe de cegueira que o `global-setup` já corrigiu duas vezes (os papéis
`anon`/`authenticated` e o stub de `realtime.send`): a base de teste diferia de
produção, e o teste validava um banco imaginário. Aqui a consequência vai além da
ida e volta: **na suíte, `anon` não tem grant nenhum, então qualquer teste de "anon não
lê" passa trivialmente**, sem que as `REVOKE`s das migrations sejam exercitadas.

### 3. UP contra cópia de produção aconteceu uma vez

Na adoção do ADR-021, contra o backup de 2026-09-10 restaurado. No dia a dia o UP roda
numa base **vazia** montada pelo runner — prova a sequência, não o comportamento sobre
dado real, que é onde `NOT NULL`, `UNIQUE` e `UPDATE` quebram. A migration
`202609090900_sem_senha_compartilhada` (que zera senhas) foi conferida por uma
consulta prévia **no próprio banco de produção**, e não numa cópia.

## Decisão

**1. Ida e volta obrigatória, verificada pela suíte, para TODAS as migrations.** UP →
DOWN → UP em base descartável, com o schema depois do DOWN idêntico ao de antes do UP.
Migration que não passa = BLOQUEADOR.

**2. A base de teste reproduz os default privileges do Supabase.** Pré-requisito da
decisão 1: sem isso, a ida e volta acusa o DOWN certo e a suíte segue validando
permissões que produção não tem. O valor exato é conferido no `pg_default_acl` de
produção, não suposto.

**3. Cópia de produção só quando a migration toca dados** — `UPDATE`, `DELETE`,
`INSERT`, ou restrição que dado existente pode violar (`NOT NULL`, `UNIQUE`, `CHECK`,
chave estrangeira). Ensaio sobre o dump mais recente restaurado em base descartável
(runbook §6.5), com o resultado registrado. Migration aditiva pura (tabela nova,
coluna anulável, índice não único) fica só na base da suíte.

> Por que não "sempre": o restore leva segundos, mas traz a PII de produção (nome,
> matrícula, telefone) para a máquina de quem publica. Vale o custo quando prova algo
> que a base vazia não prova — e a base vazia só não prova o que depende de dado.

**4. A §4.2 passa a ter este texto** (aplicado na TASK-108):

> **Teste de migração:** nenhuma migration toca produção sem antes passar, em base
> descartável, (a) pela **ida e volta** — UP → DOWN → UP, com o schema depois do DOWN
> idêntico ao de antes do UP —, verificada pela suíte para todas as migrations; e (b)
> quando **toca dados** (`UPDATE`, `DELETE`, `INSERT`, ou restrição que dado existente
> pode violar: `NOT NULL`, `UNIQUE`, `CHECK`, chave estrangeira), por um **ensaio sobre
> a cópia restaurada do backup mais recente** (runbook §6.5), com o resultado
> registrado. Produção nunca é o primeiro banco a ver uma migration.

### Por que a emenda vem por último

É a lição do ADR-021: emendar antes de o teste existir deixaria a lei afirmando uma
verificação que ninguém executa — que é exatamente o defeito do texto atual ("UP +
DOWN testados"). O CR registra a decisão hoje; a letra muda quando for verdade.

## Alternativas consideradas

**Só ajustar o texto** ("DOWN conferido por leitura"). Mais honesto que hoje, e barato.
Rejeitada pelo usuário: não verifica que o DOWN funciona, e o único DOWN que a
medição acusou só foi entendido porque foi EXECUTADO.

**Cópia de produção sempre.** Mais forte. Rejeitada pelo custo em PII, pelo motivo da
decisão 3.

**Base vazia basta.** Aceita que migration de dados só se prova em produção — que é
como a `202609090900` foi conferida. Rejeitada.

**Branch efêmero de banco por PR** (o que a regra `20-migrations` do framework
descreve, com Neon). Não é a stack deste projeto, e o plano gratuito do Supabase não
oferece branching. Registrado para não parecer esquecido.

## Consequências

**Positivas**
- A frase "DOWN testado" passa a ser verdade, e verificada a cada execução da suíte.
- A suíte deixa de validar permissões imaginárias: as `REVOKE`s das migrations passam a
  ser exercitadas contra o default real.
- Migration de dados deixa de ter produção como primeiro banco.

**Negativas / riscos**
- Suíte mais lenta: uma ida e volta por migration, numa base própria.
- **A decisão 2 pode quebrar testes existentes** que dependem, sem saber, de `anon` não
  ter grant. É o objetivo — se algum quebrar, ele estava passando pelo motivo errado —,
  mas entra no custo da TASK-106.
- Corrigir um DOWN já aplicado **não** dispara o `conferir` (o checksum do runner é só
  do UP). Correto: o DOWN não roda em produção sem ato deliberado. Mas o registro não
  denuncia a mudança; o histórico do git, sim.
- Um processo manual (o ensaio da decisão 3) depende de alguém lembrar. A TASK-107 o
  torna verificável.

## Implementação

A ordem não é preferência: a 108 é a única que não pode vir antes.

- **TASK-106 — ida e volta na suíte.** Primeiro, o `global-setup` reproduz os default
  privileges do Supabase, com o valor conferido no `pg_default_acl` de produção. Depois,
  um teste que, para cada migration em ordem, numa base descartável: captura o schema,
  aplica UP e DOWN, compara com o capturado, e aplica UP de novo. Critério de aceite:
  as 10 migrations atuais passam — incluindo a `imutabilidade_historico`, que hoje
  diverge só por ambiente.
- **TASK-107 — o ensaio de dados fica verificável.** Critério objetivo de "toca dados"
  e registro do ensaio que uma guarda consiga conferir. ⚠️ O registro **não pode ir no
  `.up.sql` de migration já aplicada**: muda o checksum e o `conferir` acusa alteração.
  Procedimento no runbook §4.
- **TASK-108 — a emenda da §4.2**, com o texto da decisão 4, e guarda no molde da
  TASK-104 (a regra descreve o que a suíte faz). Só depois de 106 e 107 no ar.

## Fora de escopo, registrado

- A §0 da constitution ainda tem a linha "Transição em curso" (SQLite + PM2 válidos até
  a Etapa 7), vencida desde o go-live.
- A regra `20-migrations` (zona somente leitura do framework) descreve
  `supabase/migrations/` + `db/migrations/` e branch Neon — nenhum dos três é deste
  projeto.
