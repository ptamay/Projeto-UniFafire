// TASK-067 (Sprint 20 · Etapa 3 do ADR-012) — carga de dados do SQLite para o
// Postgres, por CÓPIA. A origem é aberta somente-leitura; o keys.db permanece a
// fonte vigente até a Etapa 7 (plano de reversão do ADR-012).
//
// O loader não usa driver Postgres — a conexão é a TASK-068 (Sprint 21). Ele lê o
// SQLite e emite SQL, aplicado ao Supabase via MCP. Como o SQL é GERADO, e não
// parametrizado, o escape de literais mora aqui e tem teste próprio: a origem é
// arquivo local confiável, fora do alcance de §1.3, mas a correção do escape
// precisa ser provada mesmo assim.
//
// Uso (a carga real da Etapa 7 terá um runner sobre a DATABASE_URL):
//   node db/load-pg.mjs <origem.db>            imprime o SQL de carga no stdout
//   node db/load-pg.mjs <origem.db> --truncate TRUNCATE ... RESTART IDENTITY antes

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

// Colunas por tabela, na forma do schema Postgres (db/migrations-pg): SEM o legado
// employee_id, descartado na TASK-066. A ordem é a de carga, respeitando as chaves
// estrangeiras — users antes de keys antes de key_transactions antes de history.
export const TABLE_COLUMNS = {
    users: ['id', 'username', 'password_hash', 'role', 'active', 'full_name', 'matricula', 'phone', 'requires_password_change'],
    keys: ['id', 'name', 'room', 'status', 'active', 'user_id'],
    key_transactions: ['id', 'key_id', 'user_id', 'action', 'porteiro_id', 'porteiro_confirmed_at', 'user_confirmed_at', 'status', 'initiated_at', 'completed_at', 'justification'],
    history: ['id', 'key_id', 'action', 'timestamp', 'user_id', 'username', 'transaction_id'],
    action_logs: ['id', 'user_id', 'username', 'action', 'target', 'details', 'timestamp', 'ip_address'],
    audit_logs: ['id', 'actor_id', 'target_user_id', 'action', 'details', 'timestamp'],
    login_attempts: ['id', 'username', 'ip', 'success', 'timestamp'],
    settings: ['id', 'key', 'value'],
    rate_limit_hits: ['id', 'scope', 'identifier', 'hit_at'],
};

export const LOAD_ORDER = [
    'users', 'keys', 'key_transactions', 'history',
    'action_logs', 'audit_logs', 'login_attempts', 'settings', 'rate_limit_hits',
];

// Colunas que o SQLite guarda como 0/1 e que no Postgres são boolean (TASK-063).
const BOOLEAN_COLUMNS = {
    users: new Set(['active', 'requires_password_change']),
    keys: new Set(['active']),
    login_attempts: new Set(['success']),
};

/**
 * Um valor JS para literal SQL Postgres. Depende de standard_conforming_strings
 * (padrão ligado no Postgres): a barra invertida é literal dentro de '...', então
 * basta dobrar a aspa simples. Recusa o que não sabe tratar em vez de adivinhar —
 * SQL adivinhado numa carga de dados é corrupção silenciosa.
 */
export function pgLiteral(value) {
    if (value === null) return 'NULL';
    switch (typeof value) {
        case 'boolean':
            return value ? 'true' : 'false';
        case 'bigint':
            return value.toString();
        case 'number':
            if (!Number.isFinite(value)) throw new Error(`pgLiteral: número não finito (${value})`);
            return String(value);
        case 'string':
            return `'${value.replace(/'/g, "''")}'`;
        default:
            throw new Error(`pgLiteral: tipo não suportado (${typeof value}) — a carga não adivinha literais`);
    }
}

/** Converte uma linha crua do SQLite nos valores que vão para o Postgres:
 *  0/1 das colunas booleanas viram boolean; o resto passa como está. */
function normalizarLinha(table, row) {
    const bools = BOOLEAN_COLUMNS[table];
    const out = {};
    for (const col of TABLE_COLUMNS[table]) {
        let v = row[col];
        if (bools && bools.has(col) && (v === 0 || v === 1)) v = v === 1;
        out[col] = v === undefined ? null : v;
    }
    return out;
}

/** INSERT multi-linha para uma tabela. Usa OVERRIDING SYSTEM VALUE porque `id` é
 *  GENERATED ALWAYS AS IDENTITY: sem isso, o Postgres recusa id explícito. */
export function buildInsert(table, rows) {
    const cols = TABLE_COLUMNS[table];
    if (!cols) throw new Error(`buildInsert: tabela desconhecida "${table}"`);
    if (rows.length === 0) return '';

    const tuplas = rows.map(raw => {
        const row = normalizarLinha(table, raw);
        return '(' + cols.map(c => pgLiteral(row[c])).join(', ') + ')';
    });

    return `INSERT INTO ${table} (${cols.join(', ')}) OVERRIDING SYSTEM VALUE VALUES\n` +
        tuplas.join(',\n') + ';';
}

/** setval por tabela: deixa a sequência do IDENTITY à frente do maior id
 *  carregado. is_called derivado de haver linhas — tabela vazia não pode marcar
 *  o 1 como já usado, senão o primeiro insert real pularia para 2. */
export function buildSequenceResets() {
    return LOAD_ORDER.map(t =>
        `SELECT setval(pg_get_serial_sequence('${t}', 'id'), ` +
        `(SELECT COALESCE(MAX(id), 1) FROM ${t}), ` +
        `(SELECT COUNT(*) > 0 FROM ${t}));`,
    ).join('\n');
}

/**
 * Lê a origem SQLite (somente-leitura) e monta o plano de carga: as contagens por
 * tabela e o SQL. Não toca a origem. Tabela vazia não gera INSERT.
 * @param {string} dbPath origem SQLite
 * @param {{truncate?: boolean}} [opts] truncate: limpa o destino antes (recarga)
 */
export function buildLoadPlan(dbPath, opts = {}) {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
        const counts = {};
        const statements = [];

        if (opts.truncate) {
            // RESTART IDENTITY zera as sequências; CASCADE porque as FKs encadeiam.
            statements.push(`TRUNCATE ${LOAD_ORDER.join(', ')} RESTART IDENTITY CASCADE;`);
        }

        for (const table of LOAD_ORDER) {
            const cols = TABLE_COLUMNS[table];
            const rows = db.prepare(`SELECT ${cols.join(', ')} FROM ${table} ORDER BY id`).all();
            counts[table] = rows.length;
            const insert = buildInsert(table, rows);
            if (insert) statements.push(insert);
        }

        statements.push(buildSequenceResets());
        return { counts, statements };
    } finally {
        db.close();
    }
}

/**
 * Compara contagens de origem e destino. Lança com relatório por tabela na
 * primeira divergência encontrada — só as tabelas que divergem aparecem.
 */
export function reconcile(sourceCounts, destCounts) {
    const divergencias = [];
    for (const table of Object.keys(sourceCounts)) {
        const src = sourceCounts[table];
        const dst = destCounts[table];
        if (src !== dst) divergencias.push(`  ${table}: origem ${src} != destino ${dst}`);
    }
    if (divergencias.length > 0) {
        throw new Error('Reconciliação de contagens falhou:\n' + divergencias.join('\n'));
    }
}

// Execução direta: imprime o SQL de carga. A aplicação é externa (MCP nesta
// sprint; runner sobre DATABASE_URL na Etapa 7).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const origem = process.argv[2];
    if (!origem) {
        console.error('uso: node db/load-pg.mjs <origem.db> [--truncate]');
        process.exit(1);
    }
    const plano = buildLoadPlan(path.resolve(origem), { truncate: process.argv.includes('--truncate') });
    console.error('Contagens por tabela:', JSON.stringify(plano.counts));
    console.log(plano.statements.join('\n\n'));
}
