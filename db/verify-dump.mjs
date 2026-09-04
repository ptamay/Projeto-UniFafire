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
