// Tipos do bootstrap do primeiro ADMIN (db/bootstrap-admin.mjs) — TASK-080.

/** Mínimo que o bootstrap exige de um executor de consultas: `pg.Pool`,
 *  `pg.Client` ou o pool de `src/lib/pg`. Recebê-lo em vez de criá-lo é o que
 *  mantém `db/` sem dependência de `src/`. */
export interface Executor {
    query(
        sql: string,
        params?: unknown[],
    ): Promise<{ rows: Record<string, never>[] | { id: number }[]; rowCount: number | null }>;
}

export const CUSTO_BCRYPT: number;
export const USERNAME_PADRAO: string;

export class BootstrapRecusado extends Error {
    constructor(message: string);
}

export function gerarSenha(): string;

export function bootstrapAdmin(
    executor: Executor,
    opts?: { username?: string; senha?: string },
): Promise<{ id: number; username: string; senha: string }>;
