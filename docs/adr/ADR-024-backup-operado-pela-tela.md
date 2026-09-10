# ADR-024 — O backup volta à tela, desta vez de verdade: agenda, retenção, execução e restauração

- **Status:** Aceito — aprovado pelo usuário em 2026-09-10; implementação nas TASK-112 a 116.
  TASK-112 feita em 2026-09-10 — com uma diferença do texto: a retenção NÃO entrou na tela na 112,
  e sim na 113 junto com a poda (campo que nada obedece seria o controle inerte do ADR-013); e as
  chaves são novas (`backup_hora`, `backup_vezes_por_dia`), porque a órfã `backup_time` valia
  "02:00" em produção
- **Data:** 2026-09-10
- **Tipo de Change Request:** **D** (a restauração pela tela mexe no que a §3.5 e a §4.4 da
  constitution dizem; a agenda e a retenção sozinhas seriam Tipo C)
- **Relacionado:** ADR-012 §Backup · **ADR-013 (desfaz as decisões 1 e 2)** · TASK-075 ·
  constitution §3.5, §4.3, §4.4, §7.1 · runbook §6
- **Origem:** pedido do usuário em 2026-09-10, ao ver a tela de Configurações

## Contexto

### O que o ADR-013 removeu, e por quê

Em 2026-09-05 o ADR-013 tirou da tela os controles de agendamento e retenção, o botão
de backup manual e o card de importar `.db`. O motivo não era gosto: **eram inertes**. O
backup tinha virado `pg_dump` no GitHub Actions (ADR-012), com agenda fixa no YAML, e os
controles gravavam em `settings` linhas que ninguém lia — `backup_time` e
`backup_retention_count` estão lá até hoje, órfãs. Restaurar passou a ser só o
procedimento com credencial do runbook §6.5.

O critério do ADR-013 foi "remover o que não é verdade e mostrar o que é". Ele continua
valendo — e é por ele que os controles podem voltar, **se forem verdade**.

### O que o usuário pediu

Backup manual pelo ADMIN; retenção de até 7 dias, configurável; horário e quantidade de
backups por dia configuráveis; e restaurar pela tela de Configurações.

### O que torna cada pedido possível — ou perigoso

- **Agenda configurável.** O `cron` do Actions é fixo no arquivo. Mas o workflow pode
  rodar de hora em hora e só executar quando bater com o que está no banco: o repositório
  é público, então os minutos de Actions são gratuitos. O GitHub atrasa agendas sob
  carga — o horário é "por volta de", e a tela tem de dizer isso.
- **Retenção.** Tirar o arquivo da pasta não apaga: ele continua no histórico do git do
  repositório privado, com nome, matrícula e telefone de todo mundo, para sempre.
- **Backup manual.** A aplicação pode disparar o workflow pela API do GitHub — com um
  token que ela hoje não tem.
- **Restaurar.** É a parte perigosa, por três razões que se somam:
  1. **Segurança.** O dump é SQL puro, executado como `postgres`. Aceitar arquivo enviado
     pela tela faria de uma sessão de ADMIN roubada o controle total do banco.
  2. **Constitution.** Restaurar um backup antigo por cima de produção APAGA o histórico
     de transações posterior (§4.4) e a trilha de auditoria (§7.1) — inclusive a entrada
     que a §3.5 manda gravar ANTES de executar.
  3. **Técnica.** Função da Vercel tem limite de corpo e de tempo; restaurar exige
     derrubar dados com a aplicação no ar; e os triggers de imutabilidade do `history`
     bloqueiam `DELETE` linha a linha — só `TRUNCATE` passa, o mesmo mecanismo que o
     "Limpar Banco" (§3.5) já usa.

## Decisão

Decisões do usuário, todas nas opções recomendadas.

**1. Agenda: hora cheia, até 4 vezes por dia.** O ADMIN escolhe a hora (00–23) e 1, 2, 3
ou 4 execuções por dia, espaçadas igualmente (ex.: 03h e 15h). Padrão: **03:00, 1 vez**.
O workflow roda de hora em hora e um passo inicial lê a configuração do banco e decide.
Mínimo de 1 por dia: é o RPO de 24 h da §4.3. Validada na escrita **e na leitura** — a
lição da Sprint 24 (um `"30"` herdado deixou o logout inerte em produção).

**2. Retenção: N dias, padrão 7, apagando DE VERDADE.** Depois de verificar o dump novo, o
job reescreve o histórico do repositório privado mantendo só os arquivos da janela, e
força o push. Dump fora da janela deixa de existir — minimização de dados. Guardas:
nunca apaga se o dump novo não foi verificado; nunca fica sem nenhum; faixa de 3 a 30
dias (abaixo de 3, um dump ruim e verificado por azar deixaria pouca escolha).

**3. Backup manual pelo ADMIN.** Um botão dispara o workflow pela API do GitHub. O token é
de granularidade fina, **só `Actions: write` neste repositório**, guardado como secret na
Vercel — criado pelo usuário, que é quem maneja credencial. Rota exclusiva de ADMIN
(§3.2), com entrada na trilha.

**4. Restaurar: escolhendo da lista, sem upload.** O ADMIN escolhe um dos backups
**verificados** (os que o `backup_runs` registra). Nenhum arquivo de fora executa SQL. A
restauração roda no GitHub Actions, não na função da Vercel:
- **antes**, um backup do estado atual — o que a restauração vai desfazer fica guardado;
- restaura só as tabelas **de negócio**, numa transação; a **trilha de auditoria não volta
  no tempo** (`action_logs`, `audit_logs`, `app_logs`, `backup_runs`, `migracoes_aplicadas`
  ficam como estão), e a restauração fica registrada nela;
- confirmação forte na tela (modal destrutivo, §3.5), exclusiva de ADMIN;
- recusa backup de schema incompatível com o atual (registro de migrations diferente).

**5. A constitution é emendada por último** (lição do ADR-021): a §3.5 e a §4.4 passam a
dizer o que é a restauração — a única reversão em massa do histórico, pelo fluxo acima,
preservando a trilha e o estado anterior. Só depois de a restauração existir.

## Alternativas consideradas

**Upload de arquivo** (o pedido literal). Serve para dump guardado fora do repositório.
Rejeitada pelo usuário em favor da lista: mesmo exigindo que o hash bata com um backup do
sistema, é um caminho de arquivo externo até o SQL de produção.

**Continuar só no runbook.** Nada muda na constitution. Rejeitada: o ADMIN precisa de
resposta sem abrir terminal no dia do problema.

**Retenção só na pasta.** Mais simples. Rejeitada: a PII antiga continuaria no histórico.

**Horário livre, até 24×/dia.** Rejeitado: mais execuções e mais dumps com PII, por uma
precisão que o próprio atraso do GitHub desfaz.

## Consequências

**Positivas**
- Os controles voltam, e desta vez fazem o que dizem — o critério do ADR-013 cumprido.
- Dump com PII tem prazo de validade.
- Restaurar deixa de exigir terminal, credencial e o runbook aberto.

**Negativas / riscos**
- **Mais credenciais:** o token de Actions na Vercel.
- **Restaurar desfaz trabalho real.** Transações e cadastros posteriores ao backup somem
  das tabelas de negócio — ficam só no backup de segurança feito antes. **Senhas voltam
  ao que eram:** quem trocou depois do backup volta à senha antiga. A tela tem de dizer
  isso no modal, com a data.
- Reescrever o histórico do repositório privado é irreversível por desenho — é o ponto.
- O workflow passa a rodar 24 vezes por dia (em 23 delas, só lê a agenda e sai).
- A §4.3 (DR) passa a depender de configuração; os limites da decisão 1 impedem desligar.

## Implementação

Ordem: 112 → 113 → 114 → 115 → 116. A 115 é a que pode desfazer dados; a 116 é a única
que não pode vir antes.

- **TASK-112 — a agenda.** Configuração em `settings` (hora, vezes, dias), validada na
  escrita e na leitura; o workflow roda de hora em hora e o passo inicial decide.
  Migration normaliza as duas linhas órfãs. A tela ganha os três campos.
- **TASK-113 — retenção de verdade.** Nomes de arquivo com hora (vários por dia), poda da
  janela reescrevendo o histórico do repositório privado, com as guardas da decisão 2.
- **TASK-114 — backup manual.** Rota ADMIN que dispara o workflow; estado lido do
  `backup_runs`. Depende do token criado pelo usuário.
- **TASK-115 — restaurar da lista.** Workflow de restauração com backup de segurança,
  transação só nas tabelas de negócio, trilha preservada e registrada, recusa de schema
  incompatível. Ensaiada contra cópia antes de existir em produção (ADR-022).
- **TASK-116 — emenda da §3.5 e da §4.4.** Depois de 112–115 no ar.
