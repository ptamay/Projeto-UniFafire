import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import {
    pgLiteral,
    buildInsert,
    buildLoadPlan,
    buildSequenceResets,
    reconcile,
    TABLE_COLUMNS,
    LOAD_ORDER,
} from '../db/load-pg.mjs';

// TASK-067 (Sprint 20 · Etapa 3 do ADR-012) — carga de dados para o Postgres,
// com reconciliação de contagens.
//
// Cópia, NÃO movimentação: a origem é aberta somente-leitura e o keys.db
// permanece a fonte vigente até a Etapa 7 (plano de reversão do ADR-012). O
// objetivo desta task é provar o loader e a reconciliação — não fazer a virada,
// que acontece de novo na Etapa 7 sobre os dados de produção do momento.
//
// Sob a decisão D3, a fonte desta sprint é SINTÉTICA: mesma forma e volume do
// backup (19 usuários, 5 chaves, 92 transações, 30 de histórico, 99 logs de
// ação, 4 settings), sem nenhum dado pessoal real. A PII real só cruza para o
// provedor na Etapa 7, junto da ciência formal da direção.
//
// O loader não usa driver Postgres (a conexão é a TASK-068): lê o SQLite e emite
// SQL, aplicado via MCP do Supabase. Como o SQL é GERADO e não parametrizado, o
// escape de literais é isolado aqui e tem teste próprio — a fonte é arquivo local
// confiável, não input externo (fora do alcance de §1.3), mas a qualidade do
// escape precisa ser provada mesmo assim.

let tmpDir: string;
let fonte: string;

/** Cria uma fonte SQLite sintética com a forma do schema legado (inclui as
 *  colunas órfãs employee_id, que existem no keys.db até a Etapa 7) e o volume
 *  do backup de produção. Sem dado pessoal real. */
function criarFonteSintetica(dbPath: string) {
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role TEXT DEFAULT 'USER', active INTEGER DEFAULT 1, full_name TEXT, matricula TEXT, phone TEXT, requires_password_change INTEGER DEFAULT 1);
        CREATE TABLE keys (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, room TEXT, status TEXT DEFAULT 'available', employee_id INTEGER, active INTEGER DEFAULT 1, user_id INTEGER);
        CREATE TABLE key_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, key_id INTEGER, user_id INTEGER, action TEXT, porteiro_id INTEGER, porteiro_confirmed_at TEXT, user_confirmed_at TEXT, status TEXT, initiated_at TEXT, completed_at TEXT, justification TEXT);
        CREATE TABLE history (id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER, key_id INTEGER, action TEXT, timestamp TEXT, user_id INTEGER, username TEXT, transaction_id INTEGER);
        CREATE TABLE action_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, username TEXT, action TEXT, target TEXT, details TEXT, timestamp TEXT, ip_address TEXT);
        CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER, target_user_id INTEGER, action TEXT, details TEXT, timestamp TEXT);
        CREATE TABLE login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, ip TEXT, success INTEGER, timestamp TEXT);
        CREATE TABLE settings (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, value TEXT);
        CREATE TABLE rate_limit_hits (id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT, identifier TEXT, hit_at INTEGER);
    `);

    const insUser = db.prepare('INSERT INTO users (username, password_hash, role, active, full_name, matricula, phone, requires_password_change) VALUES (?,?,?,?,?,?,?,?)');
    for (let i = 1; i <= 19; i++) {
        insUser.run(`user${i}`, '$2b$10$sinteticohashsinteticohashsinteti', 'ALUNO', 1, `Sintético ${i}`, `MAT${1000 + i}`, `8100000${i}`, i % 2);
    }
    // Um nome com caractere que exige escape, para a carga exercitar o literal.
    insUser.run("o'brien", '$2b$10$x', 'ADMIN', 1, "O'Brien \\ da Silva", 'MAT9999', '81999', 0);

    const insKey = db.prepare('INSERT INTO keys (name, room, status, employee_id, active, user_id) VALUES (?,?,?,?,?,?)');
    for (let i = 1; i <= 5; i++) insKey.run(`Chave ${i}`, `Sala ${i}`, 'available', null, 1, null);

    const insTx = db.prepare('INSERT INTO key_transactions (key_id, user_id, action, porteiro_id, status, initiated_at, justification) VALUES (?,?,?,?,?,?,?)');
    for (let i = 1; i <= 92; i++) insTx.run((i % 5) + 1, (i % 19) + 1, 'withdraw', 1, 'completed', '2026-08-01T12:00:00.000Z', null);

    const insHist = db.prepare('INSERT INTO history (employee_id, key_id, action, timestamp, user_id, username, transaction_id) VALUES (?,?,?,?,?,?,?)');
    for (let i = 1; i <= 30; i++) insHist.run(null, (i % 5) + 1, 'withdraw', '2026-08-15T09:30:00.000Z', (i % 19) + 1, `user${(i % 19) + 1}`, i);

    const insLog = db.prepare('INSERT INTO action_logs (user_id, username, action, target, details, timestamp, ip_address) VALUES (?,?,?,?,?,?,?)');
    for (let i = 1; i <= 99; i++) insLog.run(1, 'user1', 'login', null, null, '2026-08-20T08:00:00.000Z', '10.0.0.1');

    const insSet = db.prepare('INSERT INTO settings (key, value) VALUES (?,?)');
    for (const [k, v] of [['auto_logout_time', '30'], ['backup_time', '02:00'], ['backup_retention_count', '7'], ['default_reset_password', 'trocar123']]) insSet.run(k, v);

    db.close();
}

beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-load-'));
    fonte = path.join(tmpDir, 'sintetico.db');
    criarFonteSintetica(fonte);
});

afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('TASK-067 — escape de literais SQL', () => {
    it('BDD 1: valores comuns sobrevivem, com as aspas escapadas', () => {
        expect(pgLiteral("O'Brien")).toBe("'O''Brien'");
        expect(pgLiteral('texto simples')).toBe("'texto simples'");
        expect(pgLiteral(42)).toBe('42');
        expect(pgLiteral(0)).toBe('0');
        expect(pgLiteral(BigInt('9007199254740993'))).toBe('9007199254740993');
        expect(pgLiteral(null)).toBe('NULL');
    });

    it('BDD 1: booleano vira o literal booleano do Postgres, não 0/1', () => {
        expect(pgLiteral(true)).toBe('true');
        expect(pgLiteral(false)).toBe('false');
    });

    it('BDD 1: barra invertida e quebra de linha ficam literais (standard_conforming_strings)', () => {
        expect(pgLiteral('a\\b')).toBe("'a\\b'");
        expect(pgLiteral('linha1\nlinha2')).toBe("'linha1\nlinha2'");
    });

    it('BDD 1: tipo que o gerador não sabe tratar faz lançar, nunca emitir SQL adivinhado', () => {
        expect(() => pgLiteral(undefined as never)).toThrow();
        expect(() => pgLiteral({} as never)).toThrow();
        expect(() => pgLiteral(NaN)).toThrow();
        expect(() => pgLiteral(Infinity)).toThrow();
    });
});

describe('TASK-067 — geração do INSERT', () => {
    it('BDD 2: o INSERT usa OVERRIDING SYSTEM VALUE para preservar o id do IDENTITY', () => {
        const sql = buildInsert('users', [
            { id: 1, username: 'a', password_hash: 'h', role: 'ALUNO', active: 1, full_name: 'A', matricula: 'M1', phone: '81', requires_password_change: 1 },
        ]);
        expect(sql).toMatch(/INSERT\s+INTO\s+users\s*\([^)]*\bid\b[^)]*\)\s+OVERRIDING\s+SYSTEM\s+VALUE/i);
    });

    it('BDD 2: o INSERT não carrega o legado employee_id, mesmo presente na origem', () => {
        const sql = buildInsert('keys', [
            { id: 1, name: 'Chave 1', room: 'Sala 1', status: 'available', employee_id: null, active: 1, user_id: null },
        ]);
        expect(sql).not.toMatch(/employee_id/);
    });

    it('BDD 2: colunas 0/1 do SQLite viram booleano no INSERT', () => {
        const sql = buildInsert('users', [
            { id: 2, username: 'b', password_hash: 'h', role: 'ALUNO', active: 1, full_name: 'B', matricula: 'M2', phone: '81', requires_password_change: 0 },
        ]);
        // active=1 -> true, requires_password_change=0 -> false; nenhum 0/1 solto
        expect(sql).toMatch(/\btrue\b/);
        expect(sql).toMatch(/\bfalse\b/);
    });

    it('as colunas declaradas batem com a ordem de carga e não incluem o legado', () => {
        expect(Object.keys(TABLE_COLUMNS).sort()).toEqual([...LOAD_ORDER].sort());
        for (const cols of Object.values(TABLE_COLUMNS)) {
            expect(cols).not.toContain('employee_id');
        }
    });
});

describe('TASK-067 — plano de carga e reconciliação', () => {
    it('BDD 2: o plano conta cada tabela e emite SQL para as que têm linhas', () => {
        const plano = buildLoadPlan(fonte);
        expect(plano.counts.users).toBe(20); // 19 + o do escape
        expect(plano.counts.keys).toBe(5);
        expect(plano.counts.key_transactions).toBe(92);
        expect(plano.counts.history).toBe(30);
        expect(plano.counts.action_logs).toBe(99);
        expect(plano.counts.settings).toBe(4);
        expect(plano.counts.audit_logs).toBe(0);
        // tabelas vazias não geram INSERT
        expect(plano.statements.some(s => /INSERT INTO audit_logs/i.test(s))).toBe(false);
        expect(plano.statements.some(s => /INSERT INTO users/i.test(s))).toBe(true);
    });

    it('BDD 2: o plano respeita a ordem de dependência (users antes de keys antes de history)', () => {
        const plano = buildLoadPlan(fonte);
        const idx = (t: string) => plano.statements.findIndex(s => new RegExp(`INSERT INTO ${t}\\b`, 'i').test(s));
        expect(idx('users')).toBeLessThan(idx('keys'));
        expect(idx('keys')).toBeLessThan(idx('key_transactions'));
        expect(idx('key_transactions')).toBeLessThan(idx('history'));
    });

    it('BDD 2: a origem é aberta somente-leitura — a carga não a altera', () => {
        const antes = fs.statSync(fonte).mtimeMs;
        buildLoadPlan(fonte);
        const db = new Database(fonte, { readonly: true });
        const integridade = (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
        db.close();
        expect(integridade).toBe('ok');
        expect(fs.statSync(fonte).mtimeMs).toBe(antes);
    });

    it('BDD 2: reconciliação passa quando as contagens batem', () => {
        const source = { users: 20, keys: 5 };
        expect(() => reconcile(source, { users: 20, keys: 5 })).not.toThrow();
    });

    it('BDD 2: divergência em qualquer tabela aborta, com relatório por tabela', () => {
        const source = { users: 20, keys: 5, history: 30 };
        let erro: Error | null = null;
        try {
            reconcile(source, { users: 20, keys: 4, history: 30 });
        } catch (e) {
            erro = e as Error;
        }
        expect(erro, 'divergência tem de lançar').not.toBeNull();
        expect(erro!.message).toMatch(/keys/);
        expect(erro!.message).toMatch(/5/);
        expect(erro!.message).toMatch(/4/);
        expect(erro!.message, 'a tabela que bate não precisa aparecer como erro').not.toMatch(/users:/);
    });

    it('BDD 3: os resets de sequência deixam o IDENTITY à frente do maior id carregado', () => {
        const resets = buildSequenceResets();
        expect(resets).toMatch(/setval\(\s*pg_get_serial_sequence\(\s*'users'/i);
        expect(resets).toMatch(/setval\(\s*pg_get_serial_sequence\(\s*'history'/i);
        // is_called derivado de haver linhas: tabela vazia não pode marcar 1 como usado
        expect(resets).toMatch(/max\(id\)/i);
    });

    it('BDD 7: repetir a carga não duplica em silêncio — ou trunca sob flag, ou falha', () => {
        const semTruncate = buildLoadPlan(fonte);
        expect(semTruncate.statements.some(s => /TRUNCATE/i.test(s)), 'sem a flag, nada de TRUNCATE').toBe(false);

        const comTruncate = buildLoadPlan(fonte, { truncate: true });
        expect(comTruncate.statements.some(s => /TRUNCATE[\s\S]*RESTART IDENTITY/i.test(s)), 'com a flag, TRUNCATE ... RESTART IDENTITY antes dos INSERT').toBe(true);
        const idxTrunc = comTruncate.statements.findIndex(s => /TRUNCATE/i.test(s));
        const idxIns = comTruncate.statements.findIndex(s => /INSERT INTO/i.test(s));
        expect(idxTrunc).toBeLessThan(idxIns);
    });
});
