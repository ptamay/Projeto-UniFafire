# ADR-021 — Um runner de migrations, e uma §4.1 que descreve o que existe

- **Status:** Proposto — aguarda implementação pelo ciclo TDD
- **Data:** 2026-09-08
- **Tipo de Change Request:** **D** (altera `constitution.md` §4.1)
- **Relacionado:** constitution §4.1 · ADR-012 · runbook §4.1/§4.2 · TASK-079, TASK-093
- **Origem:** débito registrado desde a TASK-079, cobrado por dois incidentes em 48 h

## Contexto

Não há runner de migrations para Postgres. `db/migrate.mjs` é o runner do SQLite
antigo — usa `better-sqlite3`, escreve numa tabela `_migrations` daquele banco, e não
serve para produção. As migrations de `db/migrations-pg/` são aplicadas **à mão**,
por `psql` ou pelo editor SQL do Supabase.

Isso foi tolerável enquanto era teoria. Em 48 horas produziu dois incidentes.

### Incidente 1 — o registro não descreve o banco

O ledger do Supabase (`supabase_migrations.schema_migrations`) só recebe entrada
quando quem aplica se lembra de escrevê-la, ou usa uma ferramenta que o faça.
Aplicar SQL pelo editor **não escreve nada**, e nada avisa.

Em 2026-09-07 o runbook §4.1 passou a documentar a divergência e previu que ela
cresceria a cada aplicação manual. **Cresceu no dia seguinte.** O estado hoje:

| | no repositório | no ledger | está no banco? |
|---|---|---|---|
| `search_path_history_imutavel_task_065` | não | sim | sim |
| `202609061800_sinal_realtime` | sim | **não** | sim |
| `202609081200_codigo_de_reset` | sim | **não** | sim |

Sete arquivos, seis entradas, três divergências — e o ledger não serve nem como
limite inferior nem como superior do que está aplicado.

### Incidente 2 — merge publica código, não schema

Em 2026-09-08 a TASK-093 foi mergeada e a Vercel publicou antes de as colunas
existirem. O login sobreviveu por acidente — `SELECT *` devolve coluna ausente como
`undefined` —, mas **resetar acesso e criar usuário responderam 500** até a migration
ser aplicada à mão.

Nada se perdeu. O que parou foi o balcão conseguir cadastrar gente nova ou resetar
quem esqueceu a senha. O runbook §4.2 registrou o caso; o que ele **não** pode fazer
é impedir a repetição, porque procedimento manual documentado continua sendo
procedimento manual.

### E a §4.1 descreve um projeto que não existe

Descoberto ao escrever este ADR. A cláusula diz:

> toda alteração de schema tem UP em `db/migrations/NNNN_up_*.sql` e DOWN pareado
> `NNNN_down_*.sql` com o mesmo prefixo.

A realidade é `db/migrations-pg/202609081200_codigo_de_reset.up.sql` e
`.down.sql`. **Nem o diretório nem o padrão de nome batem.** O Gate 2 passa porque
verifica *pareamento*, não a convenção que a constitution descreve.

O princípio da cláusula — DOWN antes do UP, migração sem DOWN é bloqueador — está
vivo e é respeitado. O que envelheceu foi a descrição, e uma lei que descreve
caminhos inexistentes ensina errado quem a lê pela primeira vez.

## Decisão

**1. Um runner aplica as migrations, e registra o que aplicou.** Idempotente: aplicar
duas vezes não repete. Ordenado por prefixo. Falha ruidosa e para na primeira que
não aplicar — nunca "continua e avisa depois".

**2. O registro é do projeto, não do Supabase.** Tabela própria, escrita pelo runner
na mesma transação da migration.

O ledger do Supabase continua existindo e continua incompleto; disputar com ele é
perder. O que se pode ter é um registro que **só existe se a migration foi aplicada
por quem sabe escrevê-lo** — e um comando que compara os arquivos com esse registro
e diz o que falta.

**3. A §4.1 passa a descrever o que existe**, mantendo intacto o princípio:

> **Migrações pareadas:** toda alteração de schema tem UP em
> `db/migrations-pg/<timestamp>_<nome>.up.sql` e DOWN pareado
> `<timestamp>_<nome>.down.sql`. **DOWN escrito ANTES de aplicar o UP.** Migração sem
> DOWN = BLOQUEADOR. **A aplicação é feita pelo runner do projeto, que registra o que
> aplicou**; aplicar schema à mão sem registrar deixa o banco e o repositório
> divergentes sem sintoma.

**4. O deploy pergunta antes de servir.** A aplicação verifica, ao subir, se há
migration pendente — e diz isso em vez de responder 500 numa rota qualquer meia hora
depois. **Verifica e avisa; não aplica.** Aplicar schema automaticamente no boot de
uma função serverless é como várias instâncias correndo o mesmo `ALTER TABLE` ao
mesmo tempo, e a §4.1 exige que a aplicação seja um ato deliberado.

## Alternativas consideradas

**Adotar uma ferramenta pronta** (`node-pg-migrate`, `dbmate`, Prisma Migrate).
Resolveria mais do que se pede e traria convenções próprias de nomenclatura e de
tabela de controle, obrigando a migrar os sete arquivos existentes e a reescrever o
Gate 2 — que é zona somente leitura. Rejeitada pelo tamanho, não pelo mérito: se o
projeto crescer para várias bases, vale reabrir.

**Confiar no ledger do Supabase e disciplinar o uso.** É o estado atual com um pedido
de atenção em cima. Já falhou duas vezes em 48 h, com o aviso escrito no runbook nas
duas. Rejeitada: procedimento que depende de lembrar não é controle.

**Aplicar migrations automaticamente no deploy.** Tentador, e é o que a maioria dos
frameworks faz. Rejeitada para runtime serverless: várias instâncias sobem em
paralelo e correriam o mesmo DDL, e um `ALTER TABLE` que falha pela metade em
produção é pior que a janela que se quer fechar. Daí a decisão 4 verificar e avisar.

**Não fazer nada e conviver.** Defensável com um mantenedor e uma base. Mas os dois
incidentes aconteceram **com** um mantenedor e uma base — o custo já está sendo pago,
e a divergência é cumulativa: cada migration nova aumenta a distância entre o que o
repositório diz e o que o banco tem.

## Consequências

**Positivas**
- Passa a existir uma resposta confiável para "o que está aplicado?".
- A janela entre merge e schema deixa de ser silenciosa.
- A §4.1 volta a descrever o projeto, e o Gate 2 passa a concordar com ela.

**Negativas / riscos**
- Mais uma tabela e mais uma ferramenta para manter.
- **O registro nasce vazio e o banco não.** As sete migrations já aplicadas precisam
  ser marcadas como tal na adoção, senão o runner tenta reaplicá-las — e a primeira
  a rodar duas vezes é um `ALTER TABLE ADD COLUMN` que falha, ou pior, um `CREATE
  TRIGGER` que duplica. **É o passo mais perigoso desta mudança**, e tem de ser
  explícito e testado contra uma base restaurada, não contra uma vazia.
- Emenda de constitution, com o peso que isso tem.

## Implementação

- **TASK-101** — o runner: aplicação idempotente e ordenada, registro em tabela
  própria na mesma transação, e um comando de conferência (arquivos × registro ×
  schema). Migration UP/DOWN para a tabela de controle.
- **TASK-102** — a **adoção**: marcar as sete migrations existentes como aplicadas
  sem reexecutá-las, verificado contra uma base **restaurada do backup**, que é o
  único jeito de exercitar o caminho real.
- **TASK-103** — a aplicação verifica pendências ao subir e **avisa**; nunca aplica.
- **TASK-104** — a §4.1 passa a descrever `db/migrations-pg/*.up.sql` e a exigir o
  registro. Só depois de 101–103 estarem no ar: emendar antes deixaria a lei
  descrevendo algo que ainda não existe, que é o defeito que ela veio corrigir.

> A ordem 101 → 102 → 103 → 104 não é preferência. A 102 é a que pode quebrar
> produção, e ela depende da 101 existir; a 104 é a única que não pode vir primeiro.
