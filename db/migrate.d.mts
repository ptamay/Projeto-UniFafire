// Tipos do runner de migrações (db/migrate.mjs) — TASK-029.

export interface MigrationFile {
    name: string;
    upPath: string;
    downPath: string;
}

export interface AppliedMigration {
    name: string;
    applied_at: string;
}

export function listMigrations(dir?: string): MigrationFile[];
export function getApplied(dbPath: string): AppliedMigration[];
export function applyMigrations(dbPath: string, dir?: string): { applied: string[]; skipped: number };
export function rollback(dbPath: string, dir?: string, steps?: number): { reverted: string[] };
