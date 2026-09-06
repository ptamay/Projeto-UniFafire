import { Pool, type PoolClient } from 'pg';

// TASK-068 (Sprint 21 · Etapa 4 do ADR-012) — acesso a dados sobre Postgres.
//
// Substitui `src/lib/db.ts`, que guardava a conexão em `global.db` e oferecia
// `resetConnection()` para fechar o banco, trocar o arquivo em disco e reabrir.
// Os três pressupostos morrem em execução serverless: não há processo longo para
// guardar o global, não há arquivo para trocar, e a instância pode ser destruída
// entre duas requisições.
//
// ## Por que só três funções
//
// O código atual usa exatamente três formatos: `.get()`, `.all()` e `.run()`.
// A API abaixo é a tradução um-para-um deles. Não expor o client cru é
// deliberado: mantém o ponto de entrada único e auditável que a constitution
// §1.3 exige, em vez de espalhar `client.query` por 28 arquivos.
//
// ## Prepared statements nomeados: não
//
// O pooler do Supabase em transaction mode — o modo exigido por execução
// serverless, em que a conexão é devolvida a cada transação — não suporta
// statement nomeado. Por isso nenhuma função aqui aceita `name`. Isso NÃO
// afrouxa §1.3: a regra é *parâmetro vinculado*, e `$1, $2` são exatamente
// isso. Muda o marcador, não o mecanismo.
//
// ## Assinatura que empurra para o caminho certo
//
// `params` é um array separado do texto do SQL. Concatenar valor na string
// continua sendo possível — nenhuma API impede alguém determinado —, mas o
// caminho de menor esforço passa a ser o parametrizado, e um `${}` numa consulta
// vira anomalia visível na revisão em vez de o padrão da casa.

declare global {
    var __pgPool: Pool | undefined;
}

/** Valores que uma consulta aceita como parâmetro vinculado. */
export type Param = string | number | boolean | Date | null;

function criarPool(): Pool {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error(
            'DATABASE_URL ausente. Em desenvolvimento e teste, suba o Postgres com ' +
            '`npm run test:db:up` e confira o .env.local (ver db/migrations-pg/README.md).',
        );
    }

    return new Pool({
        connectionString,
        // O pooler já multiplexa do lado dele; um teto baixo por instância evita
        // que várias instâncias efêmeras somem mais conexões do que o plano aceita.
        max: Number(process.env.PG_POOL_MAX ?? 5),
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 10_000,
        // O Supabase serve TLS com cadeia própria; o pooler exige TLS mas o
        // certificado não valida contra as CAs do sistema. Local (container) não
        // usa TLS nenhum.
        ssl: connectionString.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
    });
}

// PREGUIÇOSO, e não no carregamento do módulo. A primeira versão criava o pool
// na importação, e `criarPool()` lança quando falta DATABASE_URL — o que quebrou
// o BUILD: o Next importa cada rota para coletar os dados da página, e ali não há
// variável de ambiente de banco. Nenhum teste pegaria isso, porque em teste a
// DATABASE_URL sempre existe; só o build de produção expõe.
//
// Reusar o pool entre invocações na mesma instância evita pagar handshake por
// requisição. É o único estado global aqui — e, ao contrário do `global.db`
// anterior, perdê-lo não corrompe nada: um pool novo simplesmente reconecta.
export function getPool(): Pool {
    return globalThis.__pgPool ?? (globalThis.__pgPool = criarPool());
}

/** Todas as linhas. Equivalente ao `.all()` do better-sqlite3. */
export async function query<T = Record<string, unknown>>(
    sql: string,
    params: Param[] = [],
): Promise<T[]> {
    const res = await getPool().query(sql, params);
    return res.rows as T[];
}

/** A primeira linha, ou `undefined`. Equivalente ao `.get()`. */
export async function queryOne<T = Record<string, unknown>>(
    sql: string,
    params: Param[] = [],
): Promise<T | undefined> {
    const res = await getPool().query(sql, params);
    return (res.rows[0] as T | undefined) ?? undefined;
}

/** Linhas afetadas. Equivalente ao `.run()` — mas devolve contagem, não `info`. */
export async function execute(sql: string, params: Param[] = []): Promise<number> {
    const res = await getPool().query(sql, params);
    return res.rowCount ?? 0;
}

/**
 * O mesmo trio, amarrado a um client dedicado — é o que uma transação recebe.
 * Sem isto cada consulta poderia sair por uma conexão diferente do pool, e o
 * BEGIN não valeria para as demais.
 */
export interface Tx {
    query<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T[]>;
    queryOne<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T | undefined>;
    execute(sql: string, params?: Param[]): Promise<number>;
}

function amarrar(client: PoolClient): Tx {
    return {
        async query<T>(sql: string, params: Param[] = []) {
            return (await client.query(sql, params)).rows as T[];
        },
        async queryOne<T>(sql: string, params: Param[] = []) {
            return ((await client.query(sql, params)).rows[0] as T | undefined) ?? undefined;
        },
        async execute(sql: string, params: Param[] = []) {
            return (await client.query(sql, params)).rowCount ?? 0;
        },
    };
}

/**
 * Transação com client dedicado. Commita ao final, reverte em qualquer erro, e
 * devolve o client ao pool nos dois casos — o `finally` é o que impede um erro
 * de virar conexão vazada e, algumas requisições depois, pool esgotado.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const resultado = await fn(amarrar(client));
        await client.query('COMMIT');
        return resultado;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {
            // ROLLBACK que falha (conexão já morta) não pode mascarar o erro real.
        });
        throw e;
    } finally {
        client.release();
    }
}

/** Encerra o pool. Para o fim da suíte de testes — não para uso em requisição. */
export async function closePool(): Promise<void> {
    if (globalThis.__pgPool) {
        await globalThis.__pgPool.end();
        globalThis.__pgPool = undefined;
    }
}
