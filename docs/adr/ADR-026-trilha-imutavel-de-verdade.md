# ADR-026 — A trilha de auditoria passa a ser imutável de verdade

- **Status:** Aceito — aprovado pelo usuário em 2026-09-13; implementação na TASK-124
- **Data:** 2026-09-13
- **Tipo de Change Request:** **C** (muda um controle de segurança já implementado; nenhum
  requisito muda, e a constitution não é emendada — ela passa a ser VERDADE)
- **Relacionado:** constitution §3.5, §4.4, §7.1 · REQ-005, REQ-010, REQ-014 · TASK-065 (gatilhos
  do `history`), TASK-074/033 (`app_logs`), TASK-078 (`backup_runs`) · ADR-024/TASK-115 e 116
- **Origem:** achado da TASK-116 (2026-09-13), ao conferir o que a §3.5 afirma

## Contexto

### O que a constitution e o código afirmam

A §3.5 manda os endpoints destrutivos gerarem "entrada **imutável** no log de auditoria ANTES de
executar". Dois trechos de código decidiram com base nessa premissa:

- `src/app/api/auth/logout/route.ts` — "`action_logs` é IMUTÁVEL (§7.1): o que entra ali fica"
  (por isso o motivo da saída é de lista fechada);
- `src/app/api/users/reset-password/route.ts` — "`action_logs` é imutável — o que entrar ali fica"
  (por isso o código de reset nunca vai para a trilha).

### O que o banco faz — medido em 2026-09-13

| Tabela | UPDATE/DELETE | TRUNCATE |
|---|---|---|
| `history` | recusados por gatilho (TASK-065) | **passa** |
| `app_logs` | recusados por gatilho (TASK-074) | **passa** |
| `backup_runs` | recusados por gatilho (TASK-078) | **passa** |
| `action_logs` | **passam** | **passa** |
| `audit_logs` | **passam** | **passa** |

No banco de teste, que é montado pelas mesmas migrations de produção: `UPDATE action_logs SET
details = 'adulterado'` e `DELETE` passaram; o mesmo `UPDATE` em `history` foi recusado com
"REQ-005: o histórico é imutável".

`action_logs` é a trilha que a tela de Logs mostra (REQ-010). Quem tem a credencial da aplicação —
ou um defeito de código — adultera a tela sem deixar marca na própria tabela.

O que salva a §3.5 hoje é um acidente feliz: todo `logAction` também grava no canal estruturado
`app_logs` (TASK-033), e esse, sim, recusa UPDATE e DELETE. Mas nem ele está a salvo de um
`TRUNCATE`: gatilho de linha não dispara em TRUNCATE, e a §7.1 diz que o `app_logs` "nunca entra em
rotina de limpeza" sem que nada no banco garanta isso.

### Por que o REVOKE não basta

Pelo mesmo motivo registrado na TASK-065 e na migration do `app_logs`: o DONO da tabela ignora o
REVOKE, e a aplicação conecta com papel amplo. Quem de fato barra é o gatilho, que vale para todos.

## Decisão

Decisões do usuário, todas nas opções recomendadas.

1. **`action_logs` e `audit_logs` ganham o gatilho que o `history` já tem:** UPDATE e DELETE
   recusados, com o mesmo bypass (`set_config('app.maintenance_mode', 'on', true)`, local à
   transação), mais `REVOKE UPDATE, DELETE` como defesa em profundidade. A §3.5 e os comentários do
   código passam a ser verdade — sem emenda.
2. **TRUNCATE passa a ser recusado nas cinco tabelas da trilha** — `history`, `action_logs`,
   `audit_logs`, `app_logs`, `backup_runs` —, por gatilho de instrução (`BEFORE TRUNCATE ... FOR
   EACH STATEMENT`), com o mesmo bypass. Hoje um `TRUNCATE` em qualquer ponto do código apaga
   qualquer uma delas inteira.
3. **O Limpar Banco (REQ-014) continua como está:** apaga `history`, `action_logs` e `audit_logs`,
   como exceção consciente — agora pelo modo de manutenção, que ele já usa. O registro prévio dele
   vai para o `app_logs`, que ele não alcança.

### O que continua funcionando, e por quê

- **Limpar Banco** e **limpar histórico**: já rodam dentro de `withMaintenanceMode`.
- **Restauração** (TASK-115): o motor liga o modo de manutenção antes do `TRUNCATE` do `history`.
- **Backup**: o `pg_dump` restaura os dados antes de criar os gatilhos (seção pós-dados), e a
  verificação só insere.
- **`db/load-pg.mjs --truncate`** (ferramenta offline de carga): passa a ligar o modo de
  manutenção antes do TRUNCATE — sem isso, ele seria recusado.
- **A suíte**: os testes que esvaziam tabelas da trilha entre cenários passam a usar o mesmo bypass.
  É o preço, e é informativo: cada um desses pontos é um lugar onde a trilha era apagada.

## Alternativas consideradas

**Corrigir só a cláusula** (Tipo D): a §3.5 diria que a cópia imutável é o `app_logs`, e que a tela
de Logs pode ser alterada. Rejeitada pelo usuário: mais barata, e deixaria a adulteração da tela de
Logs possível, descoberta só comparando com o `app_logs`.

**Só UPDATE e DELETE**, sem TRUNCATE: igualaria as tabelas ao `history` de hoje. Rejeitada: o
TRUNCATE é a forma mais barata de apagar tudo, e passa por cima de gatilho de linha.

**Nenhum bypass**: soaria mais forte e seria pior, pelos motivos da migration do `app_logs` —
incoerência com o `history` (a trilha mais protegida tem bypass para o REQ-014) e nenhum caminho de
retenção para uma tabela que cresce.

**Tirar a trilha do Limpar Banco**: mudaria o REQ-014. Fora deste CR, por decisão do usuário.

## Consequências

**Positivas**
- A constitution, o `spec.md` e o código dizem a mesma coisa que o banco faz.
- Adulterar ou esvaziar a trilha passa a exigir o bypass explícito, que só existe dentro de uma
  transação e só nos fluxos autorizados.

**Negativas / riscos**
- O bypass continua nas mãos de quem tem a credencial da aplicação: o gatilho protege contra
  defeito e contra acesso indevido pela API, não contra quem já controla o banco. É o mesmo nível de
  proteção do `history` desde a TASK-065 — e está registrado lá.
- Testes e ferramentas que esvaziavam essas tabelas sem cerimônia passam a precisar do bypass.

## Implementação

- **TASK-124 — trilha imutável.** Migration com os gatilhos de linha em `action_logs` e `audit_logs`,
  os de TRUNCATE nas cinco tabelas e os REVOKE; guarda que exige os três gatilhos em toda tabela da
  trilha; ajuste do `db/load-pg.mjs` e dos testes; roteiro para produção ANTES do merge.
