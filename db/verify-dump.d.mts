// Tipos da verificacao do dump (db/verify-dump.mjs) — TASK-078.

export interface Divergencia {
    tabela: string;
    origem: number | string;
    destino: number | string;
}

export class DivergenciaDeContagem extends Error {
    constructor(divergencias: Divergencia[]);
    divergencias: Divergencia[];
}

export interface ExecutorContagem {
    query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, never>[] }>;
}

export function reconciliarContagens(
    origem: Record<string, number>,
    destino: Record<string, number>,
): void;
export function contarLinhas(executor: ExecutorContagem, tabelas: string[]): Promise<Record<string, number>>;
export function tabelasDoBanco(executor: ExecutorContagem): Promise<string[]>;

export interface Esquema {
    tabelas: string[];
    indices: string[];
    triggers: string[];
    tabelasComRls: string[];
    funcoes: string[];
}

export interface DivergenciaEsquema {
    dimensao: string;
    lado: string;
    objeto: string;
}

export class DivergenciaDeEsquema extends Error {
    constructor(divergencias: DivergenciaEsquema[]);
    divergencias: DivergenciaEsquema[];
}

export function compararEsquema(origem: Partial<Esquema>, destino: Partial<Esquema>): void;
export function lerEsquema(executor: ExecutorContagem): Promise<Esquema>;
