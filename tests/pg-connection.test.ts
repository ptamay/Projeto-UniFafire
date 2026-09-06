import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { query, queryOne, execute, withTransaction, getPool, closePool } from '@/lib/pg';

// TASK-068 (Sprint 21 · Etapa 4 do ADR-012) — conexão via pooler e o módulo de
// acesso a dados.
//
// `src/lib/db.ts` guarda a conexão em `global.db`, expõe um Proxy que redireciona
// toda propriedade para a instância corrente, e oferece `resetConnection()` para
// fechar o banco, trocar o arquivo em disco e reabrir. Os três pressupostos morrem
// em execução serverless: não há processo longo para guardar o global, não há
// arquivo para trocar, e a instância pode ser destruída entre duas requisições.
//
// Estes testes rodam contra Postgres REAL em container (decisão D1, aprovada pelo
// usuário) — não contra SQLite em memória. É o que permite exercitar os triggers
// PL/pgSQL e o bypass por set_config que a TASK-065 entregou, em vez de testar
// contra um dialeto que não é o de produção.

const MIGRATIONS_PG = path.resolve(process.cwd(), 'db', 'migrations-pg');

beforeEach(async () => {
    // Isolamento: cada teste começa do mesmo estado. TRUNCATE ... RESTART IDENTITY
    // em vez de DELETE, para que os ids também não vazem de um teste para o outro.
    await execute(
        'TRUNCATE users, keys, key_transactions, history, action_logs, audit_logs, login_attempts, settings, rate_limit_hits RESTART IDENTITY CASCADE',
    );
});

afterAll(async () => {
    await closePool();
});

describe('TASK-068 — o banco de teste é Postgres real com o schema da Etapa 3', () => {
    it('BDD 4: as 9 tabelas da baseline existem', async () => {
        const linhas = await query<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables
              WHERE table_schema = 'public' ORDER BY table_name`,
        );
        const nomes = linhas.map(l => l.table_name);
        for (const t of ['users', 'keys', 'key_transactions', 'history',
            'action_logs', 'audit_logs', 'login_attempts', 'settings', 'rate_limit_hits']) {
            expect(nomes, `tabela ${t} ausente no banco de teste`).toContain(t);
        }
    });

    it('BDD 4: é Postgres de verdade, não emulação', async () => {
        const v = await queryOne<{ versao: string }>('SELECT version() AS versao');
        expect(v?.versao).toMatch(/PostgreSQL/);
    });

    it('BDD 4: os índices da TASK-064 estão aplicados', async () => {
        const idx = await query<{ indexname: string }>(
            `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%'`,
        );
        expect(idx.map(i => i.indexname)).toContain('idx_history_timestamp');
    });

    it('BDD 4: os triggers de imutabilidade da TASK-065 estão ativos', async () => {
        await execute(`INSERT INTO history (action, username) VALUES ($1, $2)`, ['withdraw', 'alvo']);

        await expect(
            execute(`UPDATE history SET action = $1 WHERE username = $2`, ['adulterado', 'alvo']),
        ).rejects.toThrow(/REQ-005/);

        const sobrevivente = await queryOne<{ action: string }>(
            'SELECT action FROM history WHERE username = $1', ['alvo'],
        );
        expect(sobrevivente?.action).toBe('withdraw');
    });

    it('BDD 4: as migrations aplicadas no container vêm de db/migrations-pg/', () => {
        // O schema do teste não pode ser um schema paralelo escrito à mão: se
        // divergir das migrations, a suíte passa a validar contra um banco que
        // não existe em lugar nenhum.
        const ups = fs.readdirSync(MIGRATIONS_PG).filter(f => f.endsWith('.up.sql'));
        expect(ups.length).toBeGreaterThanOrEqual(3);
    });
});

describe('TASK-068 — a API cobre os três formatos de uso do código atual', () => {
    it('BDD 2: queryOne devolve uma linha, ou undefined quando não há', async () => {
        await execute('INSERT INTO keys (name, room) VALUES ($1, $2)', ['Chave A', 'Sala 1']);

        const achada = await queryOne<{ name: string }>('SELECT name FROM keys WHERE room = $1', ['Sala 1']);
        expect(achada?.name).toBe('Chave A');

        const ausente = await queryOne('SELECT name FROM keys WHERE room = $1', ['Sala Inexistente']);
        expect(ausente).toBeUndefined();
    });

    it('BDD 2: query devolve o array de linhas, e array vazio quando não há', async () => {
        await execute('INSERT INTO keys (name) VALUES ($1), ($2)', ['Chave A', 'Chave B']);

        const todas = await query<{ name: string }>('SELECT name FROM keys ORDER BY name');
        expect(todas.map(k => k.name)).toEqual(['Chave A', 'Chave B']);

        const nenhuma = await query('SELECT name FROM keys WHERE name = $1', ['não existe']);
        expect(nenhuma).toEqual([]);
    });

    it('BDD 2: execute devolve o número de linhas afetadas', async () => {
        await execute('INSERT INTO keys (name) VALUES ($1), ($2), ($3)', ['A', 'B', 'C']);

        const afetadas = await execute('UPDATE keys SET room = $1 WHERE name <> $2', ['Sala X', 'C']);
        expect(afetadas).toBe(2);

        const nenhuma = await execute('UPDATE keys SET room = $1 WHERE name = $2', ['Y', 'inexistente']);
        expect(nenhuma).toBe(0);
    });
});

describe('TASK-068 — parâmetro vinculado, sempre (constitution §1.3)', () => {
    it('BDD 3: valor com aspa simples chega como dado, não como SQL', async () => {
        const nome = "Chave d'Água";
        await execute('INSERT INTO keys (name) VALUES ($1)', [nome]);

        const lida = await queryOne<{ name: string }>('SELECT name FROM keys WHERE name = $1', [nome]);
        expect(lida?.name).toBe(nome);
    });

    it('BDD 3: tentativa clássica de injeção vira um nome de chave, não um comando', async () => {
        const malicioso = "'; DROP TABLE keys; --";
        await execute('INSERT INTO keys (name) VALUES ($1)', [malicioso]);

        // A tabela continua de pé e o payload virou dado.
        const lida = await queryOne<{ name: string }>('SELECT name FROM keys WHERE name = $1', [malicioso]);
        expect(lida?.name).toBe(malicioso);
        const total = await queryOne<{ c: string }>('SELECT count(*) AS c FROM keys');
        expect(Number(total?.c)).toBe(1);
    });

    it('BDD 1: nenhuma consulta usa prepared statement nomeado', () => {
        // Transaction mode do pooler não suporta statement nomeado. O módulo não
        // pode expor `name` — se expuser, alguém vai usar, e só quebra em produção.
        const fonte = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/pg.ts'), 'utf-8');
        expect(fonte.replace(/\/\/.*$/gm, '')).not.toMatch(/\bname\s*:/);
    });
});

describe('TASK-068 — o pool nasce preguiçoso', () => {
    it('importar o módulo NÃO abre conexão nem exige DATABASE_URL', () => {
        // A primeira versão criava o pool no carregamento do módulo, e criarPool()
        // lança quando falta DATABASE_URL. Isso quebrou o BUILD: o Next importa
        // cada rota para coletar os dados da página, e ali não há variável de banco.
        // Nenhum teste pegou — em teste a DATABASE_URL sempre existe. Este lê o
        // fonte, que é o único jeito de a suíte enxergar o problema.
        const fonte = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/pg.ts'), 'utf-8')
            .replace(/\/\/.*$/gm, '');
        expect(
            fonte,
            'criação de pool no topo do módulo volta a quebrar o build',
        ).not.toMatch(/^export const pool\s*[:=]/m);
        expect(fonte, 'o acesso ao pool precisa ser por função').toMatch(/export function getPool\(/);
    });
});

describe('TASK-068 — isolamento entre testes', () => {
    it('BDD 6: um teste grava…', async () => {
        await execute('INSERT INTO keys (name) VALUES ($1)', ['vazamento']);
        const total = await queryOne<{ c: string }>('SELECT count(*) AS c FROM keys');
        expect(Number(total?.c)).toBe(1);
    });

    it('BDD 6: …e o seguinte não enxerga', async () => {
        const total = await queryOne<{ c: string }>('SELECT count(*) AS c FROM keys');
        expect(Number(total?.c)).toBe(0);
    });

    it('BDD 6: o id também não vaza — RESTART IDENTITY, não DELETE', async () => {
        const linha = await queryOne<{ id: number }>(
            'INSERT INTO keys (name) VALUES ($1) RETURNING id', ['primeira'],
        );
        expect(linha?.id).toBe(1);
    });
});

describe('TASK-068 — o pool devolve o que pega', () => {
    it('BDD: consultas soltas não retêm client', async () => {
        await query('SELECT 1');
        await queryOne('SELECT 1');
        await execute('SELECT 1');
        expect(getPool().idleCount).toBeGreaterThan(0);
        expect(getPool().totalCount - getPool().idleCount).toBe(0);
    });

    it('BDD: transação devolve o client mesmo quando lança', async () => {
        const antes = getPool().totalCount - getPool().idleCount;
        await expect(
            withTransaction(async () => {
                throw new Error('falha proposital');
            }),
        ).rejects.toThrow('falha proposital');
        expect(getPool().totalCount - getPool().idleCount).toBe(antes);
    });
});
