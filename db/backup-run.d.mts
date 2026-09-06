// Tipos do registro de execucao de backup (db/backup-run.mjs) — TASK-078.

export interface ExecutorBackup {
    query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface ResultadoBackup {
    succeeded: boolean;
    sizeBytes?: number | null;
    error?: string | null;
    destination?: string | null;
}

export const TABELAS_ESPERADAS: string[];
export function higienizarErro(mensagem: string | null | undefined): string | null;
export function registrarExecucao(executor: ExecutorBackup, resultado: ResultadoBackup): Promise<void>;
