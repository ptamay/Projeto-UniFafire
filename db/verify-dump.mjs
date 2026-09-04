// TASK-078 (Sprint 23 · Etapa 7b do ADR-012) — verificação do dump por
// restauração. constitution §4.3.
//
// ## Por que isto não vive no YAML do workflow
//
// A parte que decide se um backup presta é a que compara o que saiu com o que
// voltou. YAML não tem teste. Um erro de reconciliação escrito lá dentro só
// apareceria no dia em que o backup fosse necessário — o pior dia disponível
// para descobrir que a verificação nunca verificou nada.
//
// O workflow orquestra: dumpa, restaura, chama isto. A decisão de aprovar ou
// reprovar é código com teste.
//
// ## Por que contar linhas, e não conferir que o arquivo existe
//
// Um dump truncado — disco cheio, conexão cortada no meio, `pg_dump` morto por
// timeout — restaura SEM ERRO NENHUM. O `psql` termina com sucesso e a base fica
// com menos linhas. "O arquivo existe e tem tamanho > 0" aprovaria esse backup,
// e ele é tão inútil quanto nenhum, com a agravante de parecer útil.

/** Erro de reconciliação. Separado para que quem chama distinga "o backup está
 *  errado" de "a verificação quebrou" — só o primeiro significa dado em risco. */
export class DivergenciaDeContagem extends Error {
    constructor(divergencias) {
        super(
            'Verificação do backup REPROVOU — contagens não batem entre origem e restauração:\n' +
            divergencias.map(d => `  ${d.tabela}: origem ${d.origem} != restaurado ${d.destino}`).join('\n') +
            '\nUm dump truncado restaura sem erro; a diferença só aparece aqui.',
        );
        this.name = 'DivergenciaDeContagem';
        this.divergencias = divergencias;
    }
}

/**
 * Compara contagens por tabela. Lança `DivergenciaDeContagem` na primeira
 * execução que não bater — relatando TODAS as divergências, não só a primeira,
 * porque saber que três tabelas falharam muda o diagnóstico em relação a uma.
 *
 * Tabela ausente no destino conta como divergência, e não como zero: ausência e
 * vazio são estados diferentes, e tratá-los igual esconderia um dump que perdeu
 * a tabela inteira.
 *
 * @param {Record<string, number>} origem
 * @param {Record<string, number>} destino
 */
export function reconciliarContagens(origem, destino) {
    const divergencias = [];

    for (const tabela of Object.keys(origem)) {
        const o = origem[tabela];
        const d = Object.prototype.hasOwnProperty.call(destino, tabela) ? destino[tabela] : '(tabela ausente)';
        if (o !== d) divergencias.push({ tabela, origem: o, destino: d });
    }

    // Tabela que existe no destino e não na origem também é divergência: indica
    // que a base de verificação não estava limpa, e então a reconciliação inteira
    // perde valor — pode estar comparando com resíduo de uma execução anterior.
    for (const tabela of Object.keys(destino)) {
        if (!Object.prototype.hasOwnProperty.call(origem, tabela)) {
            divergencias.push({ tabela, origem: '(ausente na origem)', destino: destino[tabela] });
        }
    }

    if (divergencias.length > 0) throw new DivergenciaDeContagem(divergencias);
}

/**
 * Conta linhas de cada tabela informada, numa conexão qualquer.
 *
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} executor
 * @param {string[]} tabelas
 * @returns {Promise<Record<string, number>>}
 */
export async function contarLinhas(executor, tabelas) {
    const contagens = {};
    for (const t of tabelas) {
        // Identificador vindo de constante do próprio código, nunca de input —
        // a única interpolação que a constitution §1.3 admite, e por isso ela
        // está comentada aqui.
        const r = await executor.query(`SELECT count(*)::int AS c FROM "${t}"`);
        contagens[t] = r.rows[0].c;
    }
    return contagens;
}

/** Tabelas de dados do schema, lidas do próprio banco. Uma lista escrita à mão
 *  envelheceria: tabela nova entraria no schema e sairia da verificação sem
 *  ninguém notar, e o backup passaria a cobrir menos do que declara. */
export async function tabelasDoBanco(executor) {
    const r = await executor.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name`,
    );
    return r.rows.map(l => l.table_name);
}

// --- Verificação de esquema --------------------------------------------------
//
// ## Por que contar linhas não bastava
//
// Descoberto no ensaio real do ciclo, com o backup já "verificado" e verde:
// truncar o FIM de um dump não perde linha nenhuma, porque as instruções finais
// não são dados — são esquema. No ensaio, o dump truncado perdeu exatamente
// `ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;`. O `psql` restaurou sem
// erro, as contagens bateram, e a reconciliação por linhas APROVOU.
//
// Medido: origem com 11 tabelas sob RLS, restauração com 10.
//
// Um backup que volta com um controle de segurança a menos é indistinguível de
// um bom, se a única pergunta for "quantas linhas?". Restaurar esse backup num
// incidente devolveria o sistema com `users` exposta pela API de dados do
// Supabase — e ninguém procuraria por isso no meio de uma recuperação.

const DIMENSOES = [
    ['tabelas', 'tabela'],
    ['indices', 'índice'],
    ['triggers', 'trigger'],
    ['tabelasComRls', 'RLS'],
    ['funcoes', 'função'],
];

export class DivergenciaDeEsquema extends Error {
    constructor(divergencias) {
        super(
            'Verificação do backup REPROVOU — o esquema restaurado difere da origem:\n' +
            divergencias.map(d => `  ${d.dimensao}: ${d.lado} "${d.objeto}"`).join('\n') +
            '\nContagem de linhas não pega isto: um dump truncado no fim perde esquema, não dados.',
        );
        this.name = 'DivergenciaDeEsquema';
        this.divergencias = divergencias;
    }
}

/**
 * Compara os objetos de esquema entre origem e restauração.
 *
 * Objeto A MAIS no destino também reprova: indica base de verificação suja, e
 * com resíduo de execução anterior a reconciliação inteira perde valor — pode
 * estar aprovando por comparar com o que sobrou, não com o que voltou.
 *
 * @param {Record<string, string[]>} origem
 * @param {Record<string, string[]>} destino
 */
export function compararEsquema(origem, destino) {
    const divergencias = [];

    for (const [chave, rotulo] of DIMENSOES) {
        const a = new Set(origem[chave] ?? []);
        const b = new Set(destino[chave] ?? []);

        for (const o of a) if (!b.has(o)) divergencias.push({ dimensao: rotulo, lado: 'ausente na restauração', objeto: o });
        for (const o of b) if (!a.has(o)) divergencias.push({ dimensao: rotulo, lado: 'sobrando na restauração', objeto: o });
    }

    if (divergencias.length > 0) throw new DivergenciaDeEsquema(divergencias);
}

/** Fotografa o esquema de um banco nas dimensões que a restauração precisa devolver. */
export async function lerEsquema(executor) {
    const uma = async (sql) => (await executor.query(sql)).rows.map(r => Object.values(r)[0]);

    return {
        tabelas: await uma(
            `SELECT table_name FROM information_schema.tables
              WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`),
        indices: await uma(
            `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`),
        triggers: await uma(
            `SELECT tg.tgname FROM pg_trigger tg
               JOIN pg_class c ON c.oid = tg.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND NOT tg.tgisinternal ORDER BY 1`),
        // A dimensão que o ensaio provou faltar. `relrowsecurity` é o estado
        // real da tabela, não a intenção declarada na migration.
        tabelasComRls: await uma(
            `SELECT c.relname FROM pg_class c
               JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity ORDER BY 1`),
        funcoes: await uma(
            `SELECT p.proname FROM pg_proc p
               JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' ORDER BY 1`),
    };
}
