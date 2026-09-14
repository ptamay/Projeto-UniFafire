// Tipos da restauração (db/restaurar-backup.mjs) — TASK-115.

export interface ClientePg {
    query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export type Contagens = Record<'users' | 'keys' | 'key_transactions' | 'history', number>;

export interface Relatorio {
    antes: Contagens;
    depois: Contagens;
    ensaio: boolean;
}

export const TABELAS_DE_NEGOCIO: string[];
export const TABELAS_PRESERVADAS: string[];
export const ACOES: { restaurado: string; ensaiado: string; recusada: string; falhou: string };

export class RestauracaoRecusada extends Error {}

export function validarArquivo(arquivo: unknown): string;
export function exigirBackupVerificado(prod: ClientePg, opcoes: { repo: string; arquivo: string }): Promise<void>;
export function diferencaDeSchema(prod: ClientePg, backup: ClientePg): Promise<string[]>;
export function restaurar(
    prod: ClientePg, backup: ClientePg,
    opcoes: { arquivo: string; pedidoPor: string; ensaio?: boolean; execucao?: string | null },
): Promise<Relatorio>;
