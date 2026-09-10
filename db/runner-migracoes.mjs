// TASK-101 (CR Tipo D · ADR-021) — o runner de migrations. constitution §4.1.
//
// ## O que ele garante, e é tudo
//
// 1. Aplica em ORDEM DE PREFIXO — a ordem do nome, não a do disco.
// 2. É IDEMPOTENTE — rodar de novo não reaplica nada.
// 3. Cada migration e o seu registro são UM commit. Se a migration falha, nada
//    fica: nem a metade dela, nem a linha no registro.
// 4. Para na PRIMEIRA falha. As seguintes pressupõem a que falhou.
// 5. `conferir` compara ARQUIVOS × REGISTRO, e diz o que o ledger do Supabase
//    nunca disse: o que falta, o que mudou depois de aplicado, e o que está no
//    banco sem arquivo.
//
// O ADR-021 pedia "arquivos × registro × schema". A terceira perna NÃO está aqui,
// e é deliberado: a completude do schema já é verificada pelo job de backup
// (`compararEsquema`, contra uma restauração real) e pelas consultas do runbook
// §4.1. Repeti-la aqui acoplaria o runner ao `backup-run.mjs` — e ele precisa rodar
// sozinho, na máquina de quem publica.
//
// ## O que ele NÃO faz
//
// Não é chamado no boot da aplicação. Várias instâncias serverless subindo juntas
// correriam o mesmo DDL em paralelo, e um `ALTER TABLE` que falha pela metade em
// produção é pior que a janela que se quer fechar. A aplicação só VERIFICA e avisa
// (TASK-103); aplicar é um ato deliberado de quem publica.
//
// ## Sem dependência do código da aplicação
//
// Importa só `pg`, `fs`, `path` e `crypto`. Roda na máquina de quem publica e no
// GitHub Actions, onde `src/` não existe no mesmo formato, e não pode depender de
// nada que o `next build` transforme.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

export const TABELA_REGISTRO = 'migracoes_aplicadas';
export const MIGRACAO_DO_REGISTRO = '202609101100_registro_de_migracoes';

// `fileURLToPath` e não `new URL(...).pathname`: o segundo devolve o caminho
// CODIFICADO, e o espaço de "Projeto UniFafire" vira `%20` — o arquivo deixa de ser
// encontrado só nesta máquina, e em nenhuma sem espaço no caminho.
const ESTE_ARQUIVO = fileURLToPath(import.meta.url);
const DIR_PADRAO = path.resolve(path.dirname(ESTE_ARQUIVO), 'migrations-pg');

/** O arquivo UP que cria a tabela de registro. Lido do diretório REAL, e não do
 *  que foi passado: a definição do registro é uma só, e o teste com migrations
 *  sintéticas precisa da mesma tabela que produção. */
function sqlDoRegistro() {
    return fs.readFileSync(path.join(DIR_PADRAO, `${MIGRACAO_DO_REGISTRO}.up.sql`), 'utf-8');
}

function hash(conteudo) {
    return crypto.createHash('sha256').update(conteudo).digest('hex');
}

/** Migrations do diretório, em ordem de NOME. Só os UP: o DOWN é para reverter à
 *  mão, e o Gate 2 já garante que ele existe. */
export function listarMigracoes(dir = DIR_PADRAO) {
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.up.sql'))
        .sort()
        .map(f => {
            const conteudo = fs.readFileSync(path.join(dir, f), 'utf-8');
            return { nome: f.replace(/\.up\.sql$/, ''), conteudo, checksum: hash(conteudo) };
        });
}

async function registroExiste(client) {
    const r = await client.query(`SELECT to_regclass('public.${TABELA_REGISTRO}') AS t`);
    return r.rows[0].t !== null;
}

/**
 * Garante que a tabela de registro existe, aplicando a migration dela PRIMEIRO se
 * preciso — fora da ordem do prefixo.
 *
 * É o ovo e a galinha: a primeira migration precisa de uma tabela para ser
 * registrada, e a tabela é criada por uma migration. Como a do registro não depende
 * de nada, ela pode vir antes de todas, e se registra a si mesma na mesma transação.
 */
async function garantirRegistro(client) {
    if (await registroExiste(client)) return false;
    const sql = sqlDoRegistro();
    await client.query('BEGIN');
    try {
        await client.query(sql);
        await client.query(
            `INSERT INTO ${TABELA_REGISTRO} (nome, checksum, modo) VALUES ($1, $2, 'aplicada')`,
            [MIGRACAO_DO_REGISTRO, hash(sql)],
        );
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    }
    return true;
}

async function registradas(client) {
    const r = await client.query(`SELECT nome, checksum, modo FROM ${TABELA_REGISTRO}`);
    return new Map(r.rows.map(l => [l.nome, l]));
}

/**
 * Aplica o que está pendente, em ordem, cada uma numa transação com o seu registro.
 * Para na primeira falha e LANÇA, com o nome da migration na mensagem.
 */
export async function aplicar(client, dir = DIR_PADRAO) {
    await garantirRegistro(client);
    const feitas = await registradas(client);
    const aplicadas = [];

    for (const m of listarMigracoes(dir)) {
        if (feitas.has(m.nome)) continue;

        await client.query('BEGIN');
        try {
            await client.query(m.conteudo);
            await client.query(
                `INSERT INTO ${TABELA_REGISTRO} (nome, checksum, modo) VALUES ($1, $2, 'aplicada')`,
                [m.nome, m.checksum],
            );
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            // O nome vai na mensagem porque é a primeira coisa que quem está
            // publicando precisa saber — e o erro cru do Postgres não diz qual
            // arquivo o provocou.
            throw new Error(`falha aplicando ${m.nome}: ${e.message}`);
        }
        aplicadas.push(m.nome);
    }
    return { aplicadas };
}

/**
 * Arquivos × registro. Não altera nada.
 *
 * - `pendentes` — há arquivo e não há registro: falta aplicar.
 * - `alteradas` — há os dois, mas o arquivo mudou depois de aplicado.
 * - `orfas`     — há registro e não há arquivo: está no banco e ninguém que recriar
 *                 a base a partir do repositório vai tê-la.
 */
export async function conferir(client, dir = DIR_PADRAO) {
    if (!(await registroExiste(client))) {
        return {
            registro: false,
            pendentes: listarMigracoes(dir).map(m => m.nome),
            alteradas: [],
            orfas: [],
        };
    }
    const feitas = await registradas(client);
    const arquivos = listarMigracoes(dir);
    const nomes = new Set(arquivos.map(m => m.nome));

    const pendentes = arquivos.filter(m => !feitas.has(m.nome)).map(m => m.nome);
    const alteradas = arquivos
        .filter(m => feitas.has(m.nome) && feitas.get(m.nome).checksum !== m.checksum)
        .map(m => m.nome);
    // A do registro nunca é órfã: ela é aplicada fora de ordem e pode estar ausente
    // de um diretório sintético de teste sem que isso signifique nada.
    const orfas = [...feitas.keys()]
        .filter(n => !nomes.has(n) && n !== MIGRACAO_DO_REGISTRO)
        .sort();

    return { registro: true, pendentes, alteradas, orfas };
}

// ── Linha de comando ────────────────────────────────────────────────────────
//
//   DATABASE_URL=... node db/runner-migracoes.mjs conferir
//   DATABASE_URL=... node db/runner-migracoes.mjs aplicar
//
// `conferir` sai com código 1 se houver qualquer coisa pendente, alterada ou
// órfã — é o que a TASK-103 e um passo de CI usam para decidir.

const ehEntrada = process.argv[1] && path.resolve(process.argv[1]) === ESTE_ARQUIVO;

if (ehEntrada) {
    const { default: pg } = await import('pg');
    const comando = process.argv[2];
    const url = process.env.DATABASE_URL;
    if (!url || !['conferir', 'aplicar'].includes(comando)) {
        console.error('uso: DATABASE_URL=... node db/runner-migracoes.mjs conferir|aplicar');
        process.exit(2);
    }
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
        if (comando === 'aplicar') {
            const { aplicadas } = await aplicar(client);
            console.log(aplicadas.length ? `aplicadas: ${aplicadas.join(', ')}` : 'nada pendente');
        } else {
            const r = await conferir(client);
            console.log(JSON.stringify(r, null, 2));
            if (!r.registro || r.pendentes.length || r.alteradas.length || r.orfas.length) process.exitCode = 1;
        }
    } catch (e) {
        // A mensagem do `pg` pode ecoar a string de conexão; só a nossa sai.
        console.error(String(e.message).replace(/postgres(ql)?:\/\/[^\s]+/g, '<conexão>'));
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}
