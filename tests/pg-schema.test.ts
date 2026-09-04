import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { listMigrations } from '../db/migrate.mjs';

// TASK-063 (Sprint 20 · Etapa 3 do ADR-012) — schema Postgres equivalente.
//
// Estes testes validam os ARQUIVOS de migration, não um banco: o driver Postgres
// só entra na TASK-068 (Sprint 21) e o banco de teste é decisão do início daquela
// sprint (decisão D2 registrada em tasks.md). A prova empírica — aplicar o UP no
// projeto Supabase e ler o catálogo de volta — é feita via MCP e registrada no
// Report do Step 9. Quando a Sprint 21 fechar o banco de teste, estes testes
// viram comportamentais.
//
// As migrations Postgres vivem em diretório PRÓPRIO (decisão D1): db/migrate.mjs
// é better-sqlite3 e aplicaria SQL Postgres contra o keys.db se elas dividissem
// db/migrations/ com as do SQLite.

const PG_DIR = path.resolve(process.cwd(), 'db', 'migrations-pg');
const SQLITE_DIR = path.resolve(process.cwd(), 'db', 'migrations');
const CHECKER = path.resolve(process.cwd(), 'scripts/check-migrations.mjs');
const MAPA = path.resolve(process.cwd(), 'docs', 'migracao-dialeto-sql.md');

const TABELAS = [
    'users', 'keys', 'key_transactions', 'history',
    'action_logs', 'audit_logs', 'login_attempts', 'settings', 'rate_limit_hits',
] as const;

/** Colunas que guardam um instante no tempo. `rate_limit_hits.hit_at` fica de fora
 *  de propósito: a TASK-054 a definiu como epoch em ms justamente para ser
 *  comparável nos dois dialetos, e essa escolha não muda aqui. */
const COLUNAS_DE_INSTANTE: Record<string, string[]> = {
    key_transactions: ['porteiro_confirmed_at', 'user_confirmed_at', 'initiated_at', 'completed_at'],
    history: ['timestamp'],
    action_logs: ['timestamp'],
    audit_logs: ['timestamp'],
    login_attempts: ['timestamp'],
};

/** Colunas que o SQLite guardava como 0/1 e que no Postgres passam a ser boolean. */
const COLUNAS_BOOLEANAS: Record<string, string[]> = {
    users: ['active', 'requires_password_change'],
    keys: ['active'],
    login_attempts: ['success'],
};

function lerUp(): string {
    const migrations = listMigrations(PG_DIR);
    const baseline = migrations.find(m => /baseline/.test(m.name));
    if (!baseline) throw new Error('migration de baseline Postgres não encontrada');
    return fs.readFileSync(baseline.upPath, 'utf-8');
}

function lerDown(): string {
    const migrations = listMigrations(PG_DIR);
    const baseline = migrations.find(m => /baseline/.test(m.name));
    if (!baseline) throw new Error('migration de baseline Postgres não encontrada');
    return fs.readFileSync(baseline.downPath, 'utf-8');
}

/** SQL sem os comentários `--`. As asserções de resíduo de dialeto olham o que o
 *  banco executa, não a prosa: o cabeçalho da migration cita AUTOINCREMENT e
 *  IF NOT EXISTS de propósito, para documentar o que cada conversão substituiu. */
function semComentarios(sql: string): string {
    return sql.replace(/--.*$/gm, '');
}

/** Corpo do CREATE TABLE de uma tabela: tudo entre o parêntese de abertura e o
 *  de fechamento correspondente. Contagem de parênteses, não regex guloso. */
function corpoDaTabela(sql: string, tabela: string): string {
    const inicio = sql.search(new RegExp(`CREATE\\s+TABLE\\s+(?:public\\.)?${tabela}\\s*\\(`, 'i'));
    if (inicio < 0) throw new Error(`CREATE TABLE ${tabela} não encontrado`);
    const i = sql.indexOf('(', inicio);
    let profundidade = 0;
    for (let j = i; j < sql.length; j++) {
        if (sql[j] === '(') profundidade++;
        else if (sql[j] === ')') {
            profundidade--;
            if (profundidade === 0) return sql.slice(i + 1, j);
        }
    }
    throw new Error(`CREATE TABLE ${tabela} sem parêntese de fechamento`);
}

/** Definição de uma coluna dentro do corpo de um CREATE TABLE. */
function definicaoDaColuna(sql: string, tabela: string, coluna: string): string {
    const corpo = corpoDaTabela(sql, tabela);
    const linha = corpo
        .split('\n')
        .map(l => l.trim())
        .find(l => new RegExp(`^${coluna}\\s`, 'i').test(l));
    if (!linha) throw new Error(`coluna ${tabela}.${coluna} não encontrada`);
    return linha;
}

describe('TASK-063 — migrations Postgres pareadas e cobertas pelo Gate 2', () => {
    it('BDD 1: o diretório de migrations Postgres existe e é separado do SQLite', () => {
        expect(fs.existsSync(PG_DIR), 'db/migrations-pg/ ausente').toBe(true);
        expect(PG_DIR).not.toBe(SQLITE_DIR);
    });

    it('BDD 1: todo UP Postgres tem DOWN pareado — o verificador do Gate 2 aprova', () => {
        const r = execFileSync('node', [CHECKER, PG_DIR], { encoding: 'utf-8' });
        expect(r).toMatch(/pareados/);
        expect(listMigrations(PG_DIR).length).toBeGreaterThan(0);
    });

    it('BDD 1: o Gate 2 do ci-gates.sh cobre os DOIS diretórios', () => {
        const sh = fs.readFileSync(path.resolve(process.cwd(), 'scripts/ci-gates.sh'), 'utf-8');
        const gate2 = sh.slice(sh.indexOf('Gate 2'), sh.indexOf('Gate 3'));

        expect(gate2, 'Gate 2 deve verificar db/migrations').toMatch(/db\/migrations\b/);
        expect(gate2, 'Gate 2 deve verificar db/migrations-pg').toMatch(/db\/migrations-pg\b/);
    });

    it('BDD 1: as migrations SQLite continuam íntegras e intocadas', () => {
        expect(listMigrations(SQLITE_DIR).length).toBe(5);
    });
});

describe('TASK-063 — nenhum resíduo de dialeto SQLite no UP', () => {
    it('BDD 2: não usa AUTOINCREMENT, DATETIME, INTEGER PRIMARY KEY nem RAISE(ABORT', () => {
        const up = semComentarios(lerUp());
        expect(up, 'AUTOINCREMENT é SQLite — use GENERATED ALWAYS AS IDENTITY').not.toMatch(/AUTOINCREMENT/i);
        expect(up, 'DATETIME é SQLite — use timestamptz').not.toMatch(/\bDATETIME\b/i);
        expect(up, 'INTEGER PRIMARY KEY é o rowid do SQLite').not.toMatch(/\bINTEGER\s+PRIMARY\s+KEY\b/i);
        expect(up, 'RAISE(ABORT) é SQLite — no Postgres é RAISE EXCEPTION em PL/pgSQL').not.toMatch(/RAISE\s*\(\s*ABORT/i);
    });

    it('BDD 2: a baseline não usa IF NOT EXISTS', () => {
        // A baseline SQLite precisava de IF NOT EXISTS porque rodava sobre um banco
        // legado já existente. O schema Postgres nasce vazio: aqui IF NOT EXISTS só
        // esconderia um UP aplicado duas vezes por engano.
        expect(semComentarios(lerUp())).not.toMatch(/IF\s+NOT\s+EXISTS/i);
    });

    it('BDD 2: toda chave primária é GENERATED ALWAYS AS IDENTITY', () => {
        const up = lerUp();
        for (const tabela of TABELAS) {
            expect(
                definicaoDaColuna(up, tabela, 'id'),
                `${tabela}.id deve ser identity`,
            ).toMatch(/GENERATED\s+ALWAYS\s+AS\s+IDENTITY/i);
        }
    });

    it('BDD 2: toda coluna de instante é timestamptz', () => {
        const up = lerUp();
        for (const [tabela, colunas] of Object.entries(COLUNAS_DE_INSTANTE)) {
            for (const coluna of colunas) {
                expect(
                    definicaoDaColuna(up, tabela, coluna),
                    `${tabela}.${coluna} deve ser timestamptz`,
                ).toMatch(/\btimestamptz\b/i);
            }
        }
    });

    it('BDD 2: o default de instante é now(), não CURRENT_TIMESTAMP do SQLite', () => {
        const up = lerUp();
        expect(definicaoDaColuna(up, 'key_transactions', 'initiated_at')).toMatch(/DEFAULT\s+now\(\)/i);
        expect(definicaoDaColuna(up, 'history', 'timestamp')).toMatch(/DEFAULT\s+now\(\)/i);
        expect(definicaoDaColuna(up, 'action_logs', 'timestamp')).toMatch(/DEFAULT\s+now\(\)/i);
    });

    it('BDD 2: rate_limit_hits.hit_at continua inteiro de 64 bits (TASK-054)', () => {
        // Escolha deliberada da TASK-054: epoch em ms é comparável por faixa nos
        // dois dialetos, sem depender de função de data. Não vira timestamptz.
        const def = definicaoDaColuna(lerUp(), 'rate_limit_hits', 'hit_at');
        expect(def).toMatch(/\bbigint\b/i);
        expect(def).toMatch(/NOT\s+NULL/i);
    });
});

describe('TASK-063 — colunas booleanas deixam de ser inteiros', () => {
    it('BDD 3: as quatro colunas 0/1 do SQLite são boolean no Postgres', () => {
        const up = lerUp();
        for (const [tabela, colunas] of Object.entries(COLUNAS_BOOLEANAS)) {
            for (const coluna of colunas) {
                const def = definicaoDaColuna(up, tabela, coluna);
                expect(def, `${tabela}.${coluna} deve ser boolean`).toMatch(/\bboolean\b/i);
                expect(def, `${tabela}.${coluna} não pode ter default numérico`).not.toMatch(/DEFAULT\s+[01]\b/i);
            }
        }
    });

    it('BDD 3: onde o SQLite tinha DEFAULT 1, o Postgres tem DEFAULT true', () => {
        const up = lerUp();
        expect(definicaoDaColuna(up, 'users', 'active')).toMatch(/DEFAULT\s+true/i);
        expect(definicaoDaColuna(up, 'users', 'requires_password_change')).toMatch(/DEFAULT\s+true/i);
        expect(definicaoDaColuna(up, 'keys', 'active')).toMatch(/DEFAULT\s+true/i);
    });
});

describe('TASK-063 — cobertura de tabelas e chaves estrangeiras', () => {
    it('BDD 4: as 9 tabelas de negócio são criadas', () => {
        const up = lerUp();
        for (const tabela of TABELAS) {
            expect(up, `CREATE TABLE ${tabela} ausente`).toMatch(
                new RegExp(`CREATE\\s+TABLE\\s+(?:public\\.)?${tabela}\\s*\\(`, 'i'),
            );
        }
    });

    it('BDD 4: as chaves estrangeiras equivalentes às do keys.db estão declaradas', () => {
        const up = lerUp();
        const esperadas: [string, string, string][] = [
            ['keys', 'user_id', 'users'],
            ['key_transactions', 'key_id', 'keys'],
            ['key_transactions', 'user_id', 'users'],
            ['key_transactions', 'porteiro_id', 'users'],
            ['history', 'key_id', 'keys'],
            ['history', 'user_id', 'users'],
            ['history', 'transaction_id', 'key_transactions'],
            ['action_logs', 'user_id', 'users'],
            ['audit_logs', 'actor_id', 'users'],
            ['audit_logs', 'target_user_id', 'users'],
        ];
        for (const [tabela, coluna, alvo] of esperadas) {
            expect(
                definicaoDaColuna(up, tabela, coluna),
                `${tabela}.${coluna} deve referenciar ${alvo}`,
            ).toMatch(new RegExp(`REFERENCES\\s+(?:public\\.)?${alvo}\\s*\\(`, 'i'));
        }
    });
});

describe('TASK-063 — o DOWN devolve o schema ao estado anterior', () => {
    it('BDD 5: o DOWN derruba todas as tabelas que o UP cria', () => {
        const down = lerDown();
        for (const tabela of TABELAS) {
            expect(down, `DROP TABLE ${tabela} ausente no DOWN`).toMatch(
                new RegExp(`DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${tabela}\\b`, 'i'),
            );
        }
    });

    it('BDD 5: o DOWN não cria nada', () => {
        expect(lerDown()).not.toMatch(/CREATE\s+TABLE/i);
    });
});

describe('TASK-063 — mapeamento de dialeto registrado para a Sprint 21', () => {
    it('BDD 6: docs/migracao-dialeto-sql.md cobre as conversões de consulta', () => {
        expect(fs.existsSync(MAPA), 'docs/migracao-dialeto-sql.md ausente').toBe(true);
        const doc = fs.readFileSync(MAPA, 'utf-8');

        // Conversões de CONSULTA (não de schema): são o oráculo da Sprint 21.
        expect(doc).toMatch(/lastInsertRowid/);
        expect(doc).toMatch(/RETURNING\s+id/i);
        expect(doc).toMatch(/json_build_object/);
        expect(doc).toMatch(/ON\s+CONFLICT\s+DO\s+NOTHING/i);
        expect(doc).toMatch(/INSERT\s+OR\s+IGNORE/i);
    });

    it('BDD 6: cada conversão aponta o ponto do código que atinge', () => {
        const doc = fs.readFileSync(MAPA, 'utf-8');
        expect(doc, 'o mapa precisa citar arquivos de src/ para ser acionável').toMatch(/src\/\S+\.ts/);
    });
});

// ---------------------------------------------------------------------------
// TASK-064 — índices. O schema não declarava nenhum fora do
// idx_rate_limit_hits_lookup (TASK-054): com 5 chaves e ~130 linhas na mesma
// máquina isso não aparecia, mas sob rede cada varredura completa vira latência.
//
// O critério de EXPLAIN ("o plano usa o índice, não Seq Scan") não cabe aqui pelo
// mesmo motivo da decisão D2 — não há conexão em banco nesta sprint. Ele é
// verificado via MCP contra o Supabase e registrado no Report do Step 9.

const INDICES_ESPERADOS: { nome: string; tabela: string; colunas: string }[] = [
    { nome: 'idx_history_timestamp', tabela: 'history', colunas: 'timestamp DESC' },
    { nome: 'idx_history_key_id', tabela: 'history', colunas: 'key_id' },
    { nome: 'idx_history_user_id', tabela: 'history', colunas: 'user_id' },
    { nome: 'idx_action_logs_timestamp', tabela: 'action_logs', colunas: 'timestamp DESC' },
    { nome: 'idx_key_transactions_key_id_status', tabela: 'key_transactions', colunas: 'key_id, status' },
    { nome: 'idx_key_transactions_user_id', tabela: 'key_transactions', colunas: 'user_id' },
    { nome: 'idx_rate_limit_hits_lookup', tabela: 'rate_limit_hits', colunas: 'scope, identifier, hit_at' },
];

function migrationDeIndices() {
    const m = listMigrations(PG_DIR).find(x => /indices/.test(x.name));
    if (!m) throw new Error('migration de índices Postgres não encontrada');
    return {
        up: fs.readFileSync(m.upPath, 'utf-8'),
        down: fs.readFileSync(m.downPath, 'utf-8'),
    };
}

describe('TASK-064 — índices mínimos do ADR-012', () => {
    it('BDD 1: os 7 índices são criados, com as colunas e a ordem certas', () => {
        const up = semComentarios(migrationDeIndices().up);
        for (const idx of INDICES_ESPERADOS) {
            const colunas = idx.colunas
                .split(',')
                .map(c => c.trim().replace(/\s+/g, '\\s+'))
                .join('\\s*,\\s*');
            const criacao = new RegExp(
                `CREATE\\s+INDEX\\s+${idx.nome}\\s+ON\\s+(?:public\\.)?${idx.tabela}\\s*\\(\\s*${colunas}\\s*\\)`,
                'i',
            );
            expect(up, `índice ${idx.nome} ausente ou com colunas diferentes`).toMatch(criacao);
        }
    });

    it('BDD 1: o índice de data do histórico é DESC', () => {
        // A tela lista do mais recente para o mais antigo. Um índice ASC serve
        // para a faixa, mas obriga a ordenação a ser refeita a cada página.
        const up = semComentarios(migrationDeIndices().up);
        expect(up).toMatch(/idx_history_timestamp[\s\S]*?timestamp\s+DESC/i);
        expect(up).toMatch(/idx_action_logs_timestamp[\s\S]*?timestamp\s+DESC/i);
    });

    it('BDD 1: idx_rate_limit_hits_lookup é preservado da TASK-054', () => {
        const up = semComentarios(migrationDeIndices().up);
        expect(up, 'o índice que já existia no SQLite não pode se perder na virada')
            .toMatch(/idx_rate_limit_hits_lookup/);
    });

    it('BDD 3: o DOWN remove exatamente os índices que o UP cria — e nada além', () => {
        const { up, down } = migrationDeIndices();
        const criados = [...semComentarios(up).matchAll(/CREATE\s+INDEX\s+(\w+)/gi)].map(m => m[1]);
        const removidos = [...semComentarios(down).matchAll(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(\w+)/gi)].map(m => m[1]);

        expect(criados.length).toBe(INDICES_ESPERADOS.length);
        expect(removidos.sort()).toEqual(criados.sort());
    });

    it('BDD 3: o DOWN não derruba tabela nem índice de constraint', () => {
        const down = semComentarios(migrationDeIndices().down);
        expect(down, 'DOWN de índices não mexe em tabela').not.toMatch(/DROP\s+TABLE/i);
        expect(down, 'índice de PK/UNIQUE pertence à constraint, não a esta migration')
            .not.toMatch(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?\w*_pkey/i);
    });
});
