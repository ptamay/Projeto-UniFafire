import db from '@/lib/db';

// TASK-030 (REQ-005/REQ-014) — bypass explícito e auditável da imutabilidade do
// histórico. A flag em _maintenance_mode habilita os triggers a permitir
// UPDATE/DELETE e é criada e removida DENTRO da mesma transação: se a operação
// falhar, o rollback remove a flag junto — o bypass nunca persiste.
export function withMaintenanceMode<T>(fn: () => T): T {
    // Garante a tabela em ambientes ainda sem a migração (ex.: banco de teste)
    db.exec('CREATE TABLE IF NOT EXISTS _maintenance_mode (flag INTEGER PRIMARY KEY CHECK (flag = 1))');

    const run = db.transaction(() => {
        db.prepare('INSERT OR IGNORE INTO _maintenance_mode (flag) VALUES (1)').run();
        try {
            return fn();
        } finally {
            db.prepare('DELETE FROM _maintenance_mode').run();
        }
    });
    return run();
}
