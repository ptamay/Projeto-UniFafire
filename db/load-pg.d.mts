// Tipos do loader de carga SQLite -> Postgres (db/load-pg.mjs) — TASK-067.

export type TableName =
    | 'users' | 'keys' | 'key_transactions' | 'history'
    | 'action_logs' | 'audit_logs' | 'login_attempts' | 'settings' | 'rate_limit_hits';

export const TABLE_COLUMNS: Record<TableName, string[]>;
export const LOAD_ORDER: TableName[];

export interface LoadPlan {
    counts: Record<TableName, number>;
    statements: string[];
}

export function pgLiteral(value: string | number | bigint | boolean | null): string;
export function buildInsert(table: TableName, rows: Record<string, unknown>[]): string;
export function buildSequenceResets(): string;
export function buildLoadPlan(dbPath: string, opts?: { truncate?: boolean }): LoadPlan;
export function reconcile(
    sourceCounts: Record<string, number>,
    destCounts: Record<string, number>,
): void;
