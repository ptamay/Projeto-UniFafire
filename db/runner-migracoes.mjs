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

// ── Adoção (TASK-102) ───────────────────────────────────────────────────────
//
// Marcar como aplicado o que JÁ está no banco, sem reexecutar. Existe porque o
// registro nasce vazio e produção não: nove migrations aplicadas à mão.
//
// ## O risco não é quebrar. É MENTIR.
//
// Adotar é afirmar "isto já está no banco". Se for falso, o runner nunca aplica a
// migration — ela está registrada — e o banco fica sem ela, em silêncio. Por isso a
// adoção PROVA antes de marcar, e se faltar um único objeto, recusa TUDO.

/** Tira comentários e corpos entre `$$` antes de procurar objetos. As migrations
 *  deste projeto são quase metade comentário, e muitos mencionam `CREATE TABLE` para
 *  explicar uma decisão — sem isto a sonda procuraria tabelas que ninguém criou. */
function limparSql(sql) {
    return sql
        .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''")
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--[^\n]*/g, '');
}

function separar(nome) {
    const partes = nome.replace(/"/g, '').toLowerCase().split('.');
    return partes.length === 2 ? { schema: partes[0], nome: partes[1] } : { schema: 'public', nome: partes[0] };
}

/** Objetos que a migration DECLARA criar. É o que a adoção vai procurar. */
export function objetosDeclarados(sql) {
    const s = limparSql(sql);
    const achados = [];
    // `String.raw`, e não template literal comum: ali `\s` vira `s` e `\b` vira
    // BACKSPACE. A primeira versão desta sonda nasceu com todas as regex quebradas
    // por isso — e só não passou despercebida porque o teste reprovou em vez de dar
    // falso verde.
    const ident = String.raw`((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w$]*))?)`;
    const padroes = [
        ['tabela', new RegExp(String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?` + ident, 'gi')],
        ['indice', new RegExp(String.raw`\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?` + ident, 'gi')],
        ['funcao', new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+` + ident + String.raw`\s*\(`, 'gi')],
    ];
    for (const [tipo, re] of padroes) {
        for (const m of s.matchAll(re)) achados.push({ tipo, ...separar(m[1]) });
    }
    // Trigger leva a TABELA junto: o nome de trigger é único por tabela, não no
    // banco, e procurar só pelo nome aceitaria um homônimo pendurado em outra.
    const trigger = new RegExp(
        String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+` + ident + String.raw`[^;]*?\bON\s+` + ident,
        'gi',
    );
    for (const m of s.matchAll(trigger)) {
        const t = separar(m[2]);
        achados.push({ tipo: 'trigger', schema: t.schema, tabela: t.nome, nome: separar(m[1]).nome });
    }
    // `ALTER TABLE` é lido como COMANDO INTEIRO (até o `;`), e não como um casamento
    // só: `ADD COLUMN a, ADD COLUMN b` é um comando, e casar só o começo afirmaria
    // `b` sem tê-la procurado. Os corpos entre `$$` já foram tirados por `limparSql`,
    // então o `;` aqui é sempre fim de comando.
    const alter = new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?` + ident + String.raw`([^;]*)`, 'gi');
    // Vírgula dentro de `numeric(10, 2)` é seguida de número, não de `ADD` — por
    // isso ancorar em "início ou vírgula" basta, sem contar parênteses.
    const addColuna = new RegExp(
        String.raw`(?:^|,)\s*ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?`
            + String.raw`(?!(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)\b)` + ident,
        'gi',
    );
    const addRestricao = new RegExp(String.raw`\bADD\s+CONSTRAINT\s+` + ident, 'gi');
    for (const m of s.matchAll(alter)) {
        const t = separar(m[1]);
        const corpo = m[2];
        for (const c of corpo.matchAll(addColuna)) {
            achados.push({ tipo: 'coluna', schema: t.schema, tabela: t.nome, nome: separar(c[1]).nome });
        }
        for (const c of corpo.matchAll(addRestricao)) {
            achados.push({ tipo: 'restricao', schema: t.schema, tabela: t.nome, nome: separar(c[1]).nome });
        }
        // RLS é ESTADO da tabela, não objeto — e é o controle que mais importa aqui:
        // a chave anônima está no bundle do navegador, e RLS desligada entrega a
        // tabela a quem a abrir, sem sintoma na aplicação.
        if (/^\s*ENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(corpo)) {
            achados.push({ tipo: 'rls', schema: t.schema, nome: t.nome });
        }
    }
    return achados;
}

async function existe(client, o) {
    const q = {
        tabela:  ['SELECT to_regclass($1) IS NOT NULL AS ok', [`${o.schema}.${o.nome}`]],
        indice:  ['SELECT to_regclass($1) IS NOT NULL AS ok', [`${o.schema}.${o.nome}`]],
        trigger: [`SELECT EXISTS (SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = $1 AND c.relname = $2 AND g.tgname = $3 AND NOT g.tgisinternal) AS ok`,
                  [o.schema, o.tabela, o.nome]],
        funcao:  [`SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE p.proname = $1 AND n.nspname = $2) AS ok`, [o.nome, o.schema]],
        coluna:  [`SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = $1 AND table_name = $2 AND column_name = $3) AS ok`,
                  [o.schema, o.tabela, o.nome]],
        restricao: [`SELECT EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = $1 AND c.relname = $2 AND k.conname = $3) AS ok`,
                  [o.schema, o.tabela, o.nome]],
        rls:     [`SELECT COALESCE((SELECT c.relrowsecurity FROM pg_class c
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = $1 AND c.relname = $2), false) AS ok`, [o.schema, o.nome]],
    }[o.tipo];
    const r = await client.query(q[0], q[1]);
    return r.rows[0].ok;
}

/**
 * Marca como `adotada` cada migration até `ate` (inclusive) que ainda não esteja no
 * registro — SEM executar nenhuma.
 *
 * Confere TUDO antes de marcar QUALQUER UMA. Se faltar um objeto, lança e o registro
 * fica como estava: adoção parcial seria uma mentira pela metade, e a pior parte é
 * que a metade verdadeira daria confiança à falsa.
 */
export async function adotar(client, dir = DIR_PADRAO, { ate } = {}) {
    // `ate` obrigatório: adotar "tudo que tem arquivo" marcaria como aplicada uma
    // migration que acabou de chegar e nunca rodou em lugar nenhum.
    if (!ate) throw new Error('adotar exige `ate`: o nome da última migration que já está no banco');

    const todas = listarMigracoes(dir);
    const corte = todas.findIndex(m => m.nome === ate);
    if (corte === -1) throw new Error(`\`ate\` não corresponde a nenhuma migration: ${ate}`);

    await garantirRegistro(client);
    const feitas = await registradas(client);
    const candidatas = todas.slice(0, corte + 1).filter(m => !feitas.has(m.nome));

    const ausentes = [];
    const naoVerificaveis = [];
    for (const m of candidatas) {
        const objetos = objetosDeclarados(m.conteudo);
        if (objetos.length === 0) { naoVerificaveis.push(m.nome); continue; }
        for (const o of objetos) {
            if (!(await existe(client, o))) {
                const alvo = o.tabela ? `${o.tabela}.${o.nome}` : o.nome;
                ausentes.push(`${m.nome}: ${o.tipo} ${alvo}`);
            }
        }
    }
    if (ausentes.length) {
        throw new Error(`adoção recusada — o banco não tem o que estas migrations declaram:\n  ${ausentes.join('\n  ')}`);
    }

    await client.query('BEGIN');
    try {
        for (const m of candidatas) {
            await client.query(
                `INSERT INTO ${TABELA_REGISTRO} (nome, checksum, modo) VALUES ($1, $2, 'adotada')`,
                [m.nome, m.checksum],
            );
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    }
    return { adotadas: candidatas.map(m => m.nome), naoVerificaveis };
}

// ── Linha de comando ────────────────────────────────────────────────────────
//
//   DATABASE_URL=... node db/runner-migracoes.mjs conferir
//   DATABASE_URL=... node db/runner-migracoes.mjs aplicar
//   DATABASE_URL=... node db/runner-migracoes.mjs adotar <ultima-migration-no-banco>
//
// `conferir` sai com código 1 se houver qualquer coisa pendente, alterada ou
// órfã — é o que a TASK-103 e um passo de CI usam para decidir.

const ehEntrada = process.argv[1] && path.resolve(process.argv[1]) === ESTE_ARQUIVO;

if (ehEntrada) {
    const { default: pg } = await import('pg');
    const comando = process.argv[2];
    const url = process.env.DATABASE_URL;
    if (!url || !['conferir', 'aplicar', 'adotar'].includes(comando)) {
        console.error('uso: DATABASE_URL=... node db/runner-migracoes.mjs conferir|aplicar|adotar <ate>');
        process.exit(2);
    }
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
        if (comando === 'aplicar') {
            const { aplicadas } = await aplicar(client);
            console.log(aplicadas.length ? `aplicadas: ${aplicadas.join(', ')}` : 'nada pendente');
        } else if (comando === 'adotar') {
            const r = await adotar(client, DIR_PADRAO, { ate: process.argv[3] });
            console.log(`adotadas: ${r.adotadas.join(', ') || '(nenhuma)'}`);
            if (r.naoVerificaveis.length) {
                console.log(`⚠️ adotadas SEM conferência (só dados, nada no catálogo): ${r.naoVerificaveis.join(', ')}`);
            }
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
