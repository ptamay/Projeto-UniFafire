import { withTransaction, type Tx } from '@/lib/pg';

// TASK-030 (REQ-005/REQ-014) · convertido na TASK-070 (Sprint 21).
//
// Bypass explícito e auditável da imutabilidade do histórico. Os triggers da
// TASK-065 bloqueiam UPDATE e DELETE em `history`; este é o único caminho
// autorizado a passar por eles, e existe para o fluxo ADMIN do REQ-014.
//
// ## O que mudou do SQLite para o Postgres
//
// Antes, a permissão era uma LINHA numa tabela-flag (`_maintenance_mode`),
// inserida e removida dentro da mesma transação. Funcionava, mas a garantia de
// escopo dependia da disciplina de quem chamava: nada no banco impedia que a
// flag fosse inserida fora de uma transação e ficasse gravada — e, enquanto
// estivesse lá, TODO UPDATE ou DELETE em `history` passaria, de qualquer lugar
// do sistema.
//
// Agora a permissão é `set_config(..., is_local = true)`: um ajuste de sessão
// que o próprio Postgres descarta no COMMIT ou no ROLLBACK. Não há estado a
// limpar — logo, não há estado que possa vazar. O `finally` que removia a flag
// deixa de ser necessário, e a diferença não é de estilo: o bypass passa a ser
// impossível de deixar ligado por engano.
//
// A função recebe o `tx` da transação porque as operações protegidas PRECISAM
// rodar no mesmo client. Executá-las pelo pool solto sairia por outra conexão,
// onde o ajuste não vale — e o trigger barraria, o que ao menos falha alto.

export async function withMaintenanceMode<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return withTransaction(async (tx) => {
        await tx.execute("SELECT set_config('app.maintenance_mode', 'on', true)");
        return fn(tx);
    });
}
