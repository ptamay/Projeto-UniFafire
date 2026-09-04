// TASK-078 (Sprint 23 · Etapa 7b do ADR-012) — registro de cada execução de
// backup. constitution §4.3.
//
// Chamado pelo workflow agendado, com `if: always()`, para que a execução que
// FALHOU também deixe linha. Registrar só o sucesso tornaria "100% de sucesso" e
// "nunca rodou" indistinguíveis — e a diferença entre as duas é exatamente o que
// a métrica da TASK-075 existe para mostrar.
//
// Uso (dentro do workflow):
//   node db/backup-run.mjs --ok --size 12345 --dest "repo-privado:backups/2026-09-04.sql.gz"
//   node db/backup-run.mjs --fail --error "mensagem"

import { pathToFileURL } from 'node:url';

/** Tabelas de dados esperadas no backup. Exportado para o teste conferir contra
 *  o schema real — lista escrita à mão envelhece em silêncio. */
export const TABELAS_ESPERADAS = [
    'action_logs', 'app_logs', 'audit_logs', 'backup_runs', 'history',
    'key_transactions', 'keys', 'login_attempts', 'rate_limit_hits', 'settings', 'users',
];

/**
 * Remove credencial de mensagem de erro.
 *
 * `pg_dump` e `psql` ecoam a string de conexão INTEIRA quando falham, senha
 * inclusive. Essa mensagem vai para `backup_runs`, que é lida pela tela de
 * configurações — gravá-la crua violaria §6.1 por um caminho que ninguém
 * inspeciona, porque só aparece quando algo já deu errado.
 */
export function higienizarErro(mensagem) {
    if (!mensagem) return null;
    return String(mensagem)
        // postgresql://usuario:senha@host  →  postgresql://***:***@host
        .replace(/(postgres(?:ql)?:\/\/)[^:@\s/]+:[^@\s]*@/gi, '$1***:***@')
        // password=algo  →  password=***
        .replace(/(password\s*=\s*)\S+/gi, '$1***')
        .slice(0, 2000);
}

/**
 * Grava uma execução de backup.
 *
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<unknown> }} executor
 * @param {{ succeeded: boolean, sizeBytes?: number|null, error?: string|null, destination?: string|null }} resultado
 */
export async function registrarExecucao(executor, resultado) {
    const { succeeded, sizeBytes = null, error = null, destination = null } = resultado;

    if (typeof succeeded !== 'boolean') {
        throw new Error('registrarExecucao: `succeeded` é obrigatório e booleano — sem ele o registro não diz nada.');
    }

    await executor.query(
        `INSERT INTO backup_runs (succeeded, size_bytes, error, destination)
         VALUES ($1, $2, $3, $4)`,
        [succeeded, sizeBytes, higienizarErro(error), destination],
    );
}

// --- Execução direta ---------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const valor = (flag) => {
        const i = args.indexOf(flag);
        return i >= 0 ? args[i + 1] : undefined;
    };

    const ok = args.includes('--ok');
    const falhou = args.includes('--fail');
    if (ok === falhou) {
        console.error('uso: node db/backup-run.mjs (--ok | --fail) [--size N] [--dest TEXTO] [--error TEXTO]');
        process.exit(2);
    }

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL ausente no ambiente.');
        process.exit(2);
    }

    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
        connectionString,
        ssl: connectionString.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
    });

    try {
        const tamanho = valor('--size');
        await registrarExecucao(pool, {
            succeeded: ok,
            sizeBytes: tamanho ? Number(tamanho) : null,
            error: valor('--error') ?? null,
            destination: valor('--dest') ?? null,
        });
        console.log(`Execução de backup registrada: ${ok ? 'sucesso' : 'FALHA'}.`);
    } finally {
        await pool.end();
    }
}
