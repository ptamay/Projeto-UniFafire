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

/** sha256 da forma CANÔNICA do arquivo: fim de linha LF, que é como o git o guarda.
 *  Com `core.autocrlf=true` o Windows o põe em disco com CRLF; o hash dos bytes crus
 *  variava com a máquina, e os checksums gravados neste Windows seriam acusados como
 *  "alterados" por um `conferir` em Linux, Mac ou no Actions (achado em 2026-09-10). */
function hash(conteudo) {
    return crypto.createHash('sha256').update(conteudo.replace(/\r\n/g, '\n')).digest('hex');
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

// ── Retrato do schema (TASK-106) ────────────────────────────────────────────
//
// O schema `public` como linhas comparáveis: colunas, restrições, índices,
// triggers, funções, RLS, políticas e privilégios. É o que um DOWN tem de
// restaurar. Aqui, e não no teste, porque a ida e volta da suíte e o ensaio sobre
// a cópia de produção (TASK-107) comparam a MESMA coisa — duas definições
// divergiriam, e uma delas passaria a aceitar o que a outra recusa.

/** Privilégio entra ORDENADO item a item: `{a,b}` e `{b,a}` são o mesmo acesso, e a
 *  ordem do array muda com a sequência de GRANT/REVOKE. */
const aclOrdenada = (col) =>
    `coalesce((SELECT string_agg(x::text, ',' ORDER BY x::text) FROM unnest(${col}) x), 'padrao')`;

export async function retratoDoSchema(client) {
    const r = await client.query(`
        SELECT 'coluna ' || table_name || '.' || column_name || ' ' || data_type
               || ' null=' || is_nullable || ' default=' || coalesce(column_default, '') AS linha
          FROM information_schema.columns WHERE table_schema = 'public'
        UNION ALL
        SELECT 'restricao ' || conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
          FROM pg_constraint WHERE connamespace = 'public'::regnamespace
        UNION ALL
        SELECT 'indice ' || indexdef FROM pg_indexes WHERE schemaname = 'public'
        UNION ALL
        SELECT 'trigger ' || pg_get_triggerdef(g.oid)
          FROM pg_trigger g JOIN pg_class k ON k.oid = g.tgrelid
         WHERE NOT g.tgisinternal AND k.relnamespace = 'public'::regnamespace
        UNION ALL
        SELECT 'funcao ' || p.oid::regprocedure || ' ' || md5(pg_get_functiondef(p.oid)) || ' acl=' || ${aclOrdenada('p.proacl')}
          FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        UNION ALL
        SELECT 'relacao ' || relname || ' ' || relkind::text || ' rls=' || relrowsecurity
               || ' force=' || relforcerowsecurity || ' acl=' || ${aclOrdenada('relacl')}
          FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'S', 'v', 'm', 'p')
        UNION ALL
        SELECT 'politica ' || tablename || ' ' || policyname || ' ' || cmd || ' ' || coalesce(qual, '')
          FROM pg_policies WHERE schemaname = 'public'
    `);
    return r.rows.map(l => l.linha).sort();
}

/** O que sumiu (−) e o que apareceu (+) entre dois retratos. Vazio = idênticos. */
export function diferencaDeRetratos(antes, depois) {
    const a = new Set(antes), d = new Set(depois);
    return [
        ...antes.filter(l => !d.has(l)).map(l => `  − ${l}`),
        ...depois.filter(l => !a.has(l)).map(l => `  + ${l}`),
    ];
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

// ── Ensaio sobre cópia de produção (TASK-107) ───────────────────────────────
//
// A base da suíte nasce VAZIA: prova a sequência e a ida e volta do schema, e não o
// que depende de dado — `SET NOT NULL` sobre linhas nulas, `UNIQUE` sobre
// duplicatas, um `UPDATE` que pega mais linhas do que se pensava. Migration assim
// é ensaiada sobre o dump mais recente, restaurado numa base descartável, antes de
// produção (ADR-022, decisão 3). Só ela: o ensaio traz a PII de produção para a
// máquina de quem publica, e nas aditivas não prova nada a mais.

/**
 * Por que a migration exige ensaio — lista vazia = não toca dados.
 *
 * Conta: DML (`INSERT`, `UPDATE … SET`, `DELETE FROM`, `TRUNCATE`) e, em `ALTER
 * TABLE`, restrição que dado existente pode violar (`NOT NULL`, `UNIQUE`, `CHECK`,
 * chave estrangeira ou primária, troca de tipo), além de `CREATE UNIQUE INDEX`.
 *
 * Não conta: `CREATE TABLE` (tabela nova nasce vazia), evento de trigger (`BEFORE
 * UPDATE OR DELETE ON`), privilégio (`REVOKE UPDATE, DELETE`), corpo de função (roda
 * quando a função é chamada) e comentário. Conservador de propósito no resto: um
 * `ADD COLUMN … NOT NULL DEFAULT` é acusado mesmo que o default o torne seguro — o
 * ensaio custa segundos, e acertar à mão qual default é seguro é o tipo de juízo que
 * este critério existe para não pedir.
 */
export function tocaDados(sql) {
    const motivos = [];
    for (const bruto of limparSql(sql).split(';')) {
        const st = bruto.replace(/\s+/g, ' ').trim();
        if (!st) continue;
        const trecho = st.slice(0, 70);
        if (/\bINSERT\s+INTO\b/i.test(st)
            || /\bDELETE\s+FROM\b/i.test(st)
            || /\bUPDATE\s+(?:ONLY\s+)?[\w."]+\s+SET\b/i.test(st)
            || /^TRUNCATE\b/i.test(st)
            || /^CREATE\s+UNIQUE\s+INDEX\b/i.test(st)) {
            motivos.push(trecho);
        } else if (/^ALTER\s+TABLE\b/i.test(st)
            && (/(?<!\bDROP\s+)\bNOT\s+NULL\b/i.test(st)
                || /\b(UNIQUE|CHECK|REFERENCES)\b/i.test(st)
                || /\b(FOREIGN|PRIMARY)\s+KEY\b/i.test(st)
                || /\bALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i.test(st))) {
            motivos.push(trecho);
        }
    }
    return motivos;
}

/** Ensaio é SEMPRE numa cópia. Reconhece os endereços do Supabase para recusar
 *  antes de conectar — a recusa não pode depender de a conexão falhar. */
export function pareceProducao(url) {
    let host = '';
    try { host = new URL(url).hostname; } catch { return false; }
    return /(^|\.)supabase\.(co|com)$/i.test(host);
}

async function contagensPorTabela(client) {
    const t = await client.query(`SELECT table_name FROM information_schema.tables
                                   WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`);
    const out = {};
    for (const { table_name: nome } of t.rows) {
        // Identificador vindo do CATÁLOGO, nunca de input — a exceção da §1.3.
        const r = await client.query(`SELECT count(*)::int AS n FROM public."${nome.replace(/"/g, '""')}"`);
        out[nome] = r.rows[0].n;
    }
    return out;
}

const COMANDOS_DE_DADOS = new Set(['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'MERGE']);

/**
 * Ensaia `nome` sobre a cópia a que `client` está ligado: UP, linhas por comando,
 * contagens, e a ida e volta SOBRE OS DADOS (DOWN → schema idêntico ao de antes → UP
 * de novo). Tudo numa transação: se qualquer passo falhar, a cópia volta a como
 * estava e o ensaio pode ser refeito. No sucesso, a migration fica registrada NA
 * CÓPIA, como produção a terá.
 */
export async function ensaiar(client, dir = DIR_PADRAO, nome, { origem } = {}) {
    const todas = listarMigracoes(dir);
    const i = todas.findIndex(m => m.nome === nome);
    if (i === -1) throw new Error(`migration não encontrada: ${nome}`);
    const m = todas[i];

    if (!(await registroExiste(client))) {
        throw new Error('a cópia não tem registro de migrations: use um backup posterior à adoção, ou adote nela antes (runbook §4.0)');
    }
    const feitas = await registradas(client);
    if (feitas.has(nome)) throw new Error(`${nome} já está aplicada nesta cópia — o ensaio precisa de um backup ANTERIOR a ela`);
    // Ensaiar B com A pendente mediria B sobre um banco que produção não terá.
    const antes = todas.slice(0, i).filter(x => !feitas.has(x.nome)).map(x => x.nome);
    if (antes.length) throw new Error(`a cópia não está no ponto de ${nome}: pendentes antes dela — ${antes.join(', ')}`);

    const down = fs.readFileSync(path.join(dir, `${nome}.down.sql`), 'utf-8');
    const retratoAntes = await retratoDoSchema(client);
    const contagensAntes = await contagensPorTabela(client);

    let comandos, contagensDepois;
    await client.query('BEGIN');
    try {
        const res = await client.query(m.conteudo);
        comandos = (Array.isArray(res) ? res : [res])
            .filter(r => COMANDOS_DE_DADOS.has(r.command))
            .map(r => ({ comando: r.command, linhas: r.rowCount ?? 0 }));
        contagensDepois = await contagensPorTabela(client);

        await client.query(down);
        const dif = diferencaDeRetratos(retratoAntes, await retratoDoSchema(client));
        if (dif.length) throw new Error(`o DOWN não restaura o schema anterior:\n${dif.join('\n')}`);
        await client.query(m.conteudo);

        await client.query(
            `INSERT INTO ${TABELA_REGISTRO} (nome, checksum, modo) VALUES ($1, $2, 'aplicada')`,
            [m.nome, m.checksum],
        );
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`ensaio de ${nome} falhou: ${e.message}`);
    }

    return {
        nome, checksum: m.checksum, origem: origem ?? '(não informada)',
        em: new Date().toISOString().slice(0, 10),
        motivos: tocaDados(m.conteudo), comandos,
        contagens: { antes: contagensAntes, depois: contagensDepois },
        idaEVolta: 'ok',
    };
}

/** O `<nome>.ensaio.md`. Só números e nomes de tabela — nenhum dado de pessoa. */
export function registroDoEnsaio(r) {
    const mudaram = Object.keys(r.contagens.antes)
        .filter(t => r.contagens.antes[t] !== r.contagens.depois[t]);
    return [
        `# Ensaio — ${r.nome}`,
        '',
        '> Gerado por `node db/runner-migracoes.mjs ensaiar` (TASK-107 · ADR-022). **Não editar à',
        '> mão:** a guarda confere o checksum, e o ensaio de outra versão do UP não vale.',
        '',
        `- up (sha256): ${r.checksum}`,
        `- ensaiado em: ${r.em}`,
        `- sobre: ${r.origem} (cópia restaurada em base descartável)`,
        `- por que exige ensaio: ${r.motivos.map(x => `\`${x}\``).join(' · ') || '(não toca dados)'}`,
        `- resultado: ${r.idaEVolta}`,
        '',
        '## Linhas por comando',
        '',
        '| comando | linhas |',
        '|---|---|',
        ...(r.comandos.length ? r.comandos.map(c => `| ${c.comando} | ${c.linhas} |`) : ['| (nenhum comando de dados) | — |']),
        '',
        '## Tabelas cuja contagem mudou',
        '',
        ...(mudaram.length
            ? ['| tabela | antes | depois |', '|---|---|---|', ...mudaram.map(t => `| ${t} | ${r.contagens.antes[t]} | ${r.contagens.depois[t]} |`)]
            : ['Nenhuma.']),
        '',
        '## Ida e volta sobre os dados',
        '',
        `UP → DOWN → schema idêntico ao de antes → UP de novo: **${r.idaEVolta}**.`,
        '',
    ].join('\n');
}

// ── Linha de comando ────────────────────────────────────────────────────────
//
//   DATABASE_URL=... node db/runner-migracoes.mjs conferir
//   DATABASE_URL=... node db/runner-migracoes.mjs aplicar
//   DATABASE_URL=... node db/runner-migracoes.mjs adotar <ultima-migration-no-banco>
//   DATABASE_URL=<cópia> node db/runner-migracoes.mjs ensaiar <migration> <dump>
//
// `conferir` sai com código 1 se houver qualquer coisa pendente, alterada ou
// órfã — é o que a TASK-103 e um passo de CI usam para decidir.

const ehEntrada = process.argv[1] && path.resolve(process.argv[1]) === ESTE_ARQUIVO;

if (ehEntrada) {
    const { default: pg } = await import('pg');
    const comando = process.argv[2];
    const url = process.env.DATABASE_URL;
    if (!url || !['conferir', 'aplicar', 'adotar', 'ensaiar'].includes(comando)) {
        console.error('uso: DATABASE_URL=... node db/runner-migracoes.mjs conferir|aplicar|adotar <ate>|ensaiar <migration> <dump>');
        process.exit(2);
    }
    // Antes de conectar: a recusa não pode depender de a conexão falhar.
    if (comando === 'ensaiar' && pareceProducao(url)) {
        console.error('recusado: DATABASE_URL aponta para o Supabase — o ensaio é SEMPRE numa cópia restaurada, nunca em produção (runbook §4).');
        process.exit(2);
    }
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
        if (comando === 'aplicar') {
            const { aplicadas } = await aplicar(client);
            console.log(aplicadas.length ? `aplicadas: ${aplicadas.join(', ')}` : 'nada pendente');
        } else if (comando === 'ensaiar') {
            const [nome, origem] = [process.argv[3], process.argv[4]];
            if (!nome || !origem) throw new Error('ensaiar exige <migration> e <dump de origem>');
            const r = await ensaiar(client, DIR_PADRAO, nome, { origem });
            const arq = path.join(DIR_PADRAO, `${nome}.ensaio.md`);
            fs.writeFileSync(arq, registroDoEnsaio(r));
            console.log(`ensaio ok: ${r.comandos.map(c => `${c.comando} ${c.linhas}`).join(', ') || 'nenhum comando de dados'} · ida e volta ok`);
            console.log(`registro: ${path.relative(process.cwd(), arq)} — versione junto com a migration`);
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
