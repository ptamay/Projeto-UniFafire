// TASK-115 (ADR-024, decisão 4) — restaurar um backup verificado, escolhido da lista.
//
// Roda no GitHub Actions (`.github/workflows/restaurar.yml`), nunca na função da Vercel:
// restaurar exige o dump inteiro, uma base descartável e minutos de trabalho.
//
// ## O que volta no tempo, e o que não volta
//
// Só as tabelas de NEGÓCIO. A trilha de auditoria não volta — a restauração fica
// registrada nela (§3.5, §7.1) —, nem o registro de migrations, nem o estado de segurança
// do momento (`login_attempts`, `rate_limit_hits`), nem a configuração (`settings`: voltar
// a retenção de um backup antigo poderia apagar backups no envio seguinte). Decisões do
// usuário em 2026-09-13.
//
// Toda tabela do schema está numa das duas listas; tabela nova sem lado reprova a suíte
// (`tests/restauracao-classificacao.test.ts`).
//
// ## Como
//
// O workflow restaura o dump escolhido numa base DESCARTÁVEL (`VERIFICACAO_URL`) — nunca
// por cima da produção. Daqui, o motor:
//
// 1. recusa se o registro de migrations do backup não for idêntico ao da produção (nome
//    E checksum) — antes de tocar em qualquer coisa;
// 2. numa transação da produção: `TRUNCATE` das tabelas de negócio (sem CASCADE — se algo
//    fora delas as referenciar, falha em vez de apagar junto), carga linha a linha a
//    partir da base descartável, sequências ajustadas SEM recuar, e a linha na trilha;
// 3. `COMMIT` — ou `ROLLBACK`, no ensaio.
//
// Uso (no workflow):
//   DATABASE_URL=<produção> VERIFICACAO_URL=<base com o dump> BACKUP_REPO=dono/repo \
//     node db/restaurar-backup.mjs validar   --arquivo <caminho no repositório privado>
//     node db/restaurar-backup.mjs restaurar --arquivo <...> --pedido-por <username> [--ensaio]
//     node db/restaurar-backup.mjs falhou    --arquivo <...> --pedido-por <username> --motivo <texto>

import path from 'path';
import { fileURLToPath } from 'url';
import { NOME_DE_BACKUP } from './enviar-backup.mjs';

/** Na ordem das FKs: quem é referenciado vem antes — a carga insere nesta ordem. */
export const TABELAS_DE_NEGOCIO = ['users', 'keys', 'key_transactions', 'history'];

export const TABELAS_PRESERVADAS = [
    'action_logs', 'audit_logs', 'app_logs', 'backup_runs', 'migracoes_aplicadas',
    'login_attempts', 'rate_limit_hits', 'settings',
];

export const ACOES = {
    restaurado: 'BACKUP_RESTAURADO',
    ensaiado: 'RESTAURACAO_ENSAIADA',
    recusada: 'RESTAURACAO_RECUSADA',
    falhou: 'RESTAURACAO_FALHOU',
};

/** Recusa esperada — pedido inválido ou backup incompatível. Nada foi tocado. */
export class RestauracaoRecusada extends Error {
    constructor(message) {
        super(message);
        this.name = 'RestauracaoRecusada';
    }
}

/**
 * §1.5 — o caminho vem de quem pediu, então só passa o formato EXATO de um dump do
 * sistema, dentro de `backups/`. Não há `..`, barra inicial nem caractere extra possível:
 * o padrão é ancorado nas duas pontas e só aceita dígitos, hífens, `T` e `Z`.
 */
export function validarArquivo(arquivo) {
    if (typeof arquivo !== 'string' || !NOME_DE_BACKUP.test(arquivo)) {
        throw new RestauracaoRecusada(`"${String(arquivo).slice(0, 80)}" não é o caminho de um backup do sistema`);
    }
    return arquivo;
}

/** Só se restaura o que `backup_runs` registra como VERIFICADO, com o destino exato. */
export async function exigirBackupVerificado(prod, { repo, arquivo }) {
    const r = await prod.query(
        'SELECT 1 FROM backup_runs WHERE succeeded AND destination = $1 LIMIT 1', [`${repo}:${arquivo}`]);
    if (r.rowCount === 0) {
        throw new RestauracaoRecusada(`${arquivo} não é um backup verificado registrado em backup_runs`);
    }
}

async function registroDeMigracoes(client) {
    try {
        const r = await client.query('SELECT nome, checksum FROM migracoes_aplicadas');
        return new Map(r.rows.map(l => [l.nome, l.checksum]));
    } catch (e) {
        if (e?.code === '42P01') return null;
        throw e;
    }
}

/** O que difere entre os registros de migrations; vazio = schema compatível. */
export async function diferencaDeSchema(prod, backup) {
    const noBackup = await registroDeMigracoes(backup);
    if (noBackup === null) {
        return ['o backup não tem registro de migrations — é anterior a 2026-09-10, e o schema dele não pode ser provado'];
    }
    const naProducao = await registroDeMigracoes(prod);
    const diferencas = [];
    for (const [nome, checksum] of naProducao) {
        if (!noBackup.has(nome)) diferencas.push(`falta no backup: ${nome}`);
        else if (noBackup.get(nome) !== checksum) diferencas.push(`checksum diferente: ${nome}`);
    }
    for (const nome of noBackup.keys()) {
        if (!naProducao.has(nome)) diferencas.push(`sobra no backup: ${nome}`);
    }
    return diferencas.sort();
}

async function contagens(client) {
    const r = {};
    // Os nomes vêm da constante acima, nunca de quem pediu — por isso podem ir no SQL.
    for (const t of TABELAS_DE_NEGOCIO) r[t] = (await client.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
    return r;
}

const descrever = (antes, depois) => TABELAS_DE_NEGOCIO.map(t => `${t} ${antes[t]}→${depois[t]}`).join(', ');

async function registrarNaTrilha(client, { acao, pedidoPor, detalhes }) {
    await client.query(
        `INSERT INTO action_logs (user_id, username, action, target, details, ip_address, timestamp)
         VALUES (NULL, $1, $2, 'backup', $3, 'GitHub Actions', now())`,
        [pedidoPor, acao, detalhes],
    );
}

/**
 * Troca as tabelas de negócio da produção pelas da base onde o backup foi restaurado.
 * Uma transação: ou tudo, ou nada. Com `ensaio`, faz tudo e desfaz no fim.
 */
export async function restaurar(prod, backup, { arquivo, pedidoPor, ensaio = false, execucao = null }) {
    validarArquivo(arquivo);
    const diferencas = await diferencaDeSchema(prod, backup);
    if (diferencas.length > 0) {
        throw new RestauracaoRecusada(`schema do backup incompatível com o de produção — ${diferencas.join('; ')}`);
    }

    const antes = await contagens(prod);
    let depois;
    await prod.query('BEGIN');
    try {
        // O `history` é imutável por gatilho de linha (UPDATE/DELETE); TRUNCATE não passa
        // por ele, mas a trava fica ligada para o caso de um gatilho novo. Local à
        // transação: o Postgres a descarta no COMMIT ou no ROLLBACK.
        await prod.query("SELECT set_config('app.maintenance_mode', 'on', true)");
        // Sem CASCADE, de propósito: se alguma tabela fora do negócio referenciar estas,
        // o TRUNCATE falha — e nada é apagado em cascata.
        await prod.query(`TRUNCATE ${TABELAS_DE_NEGOCIO.join(', ')}`);

        for (const t of TABELAS_DE_NEGOCIO) {
            const { rows } = await backup.query(`SELECT coalesce(json_agg(x), '[]'::json) AS linhas FROM ${t} x`);
            await prod.query(
                `INSERT INTO ${t} OVERRIDING SYSTEM VALUE SELECT * FROM json_populate_recordset(NULL::${t}, $1::json)`,
                [JSON.stringify(rows[0].linhas)],
            );
            // A sequência NUNCA recua: o id de quem sumiu não pode ir para outra pessoa —
            // a trilha dele continua lá, com aquele id.
            await prod.query(
                `SELECT setval(s, GREATEST(coalesce(pg_sequence_last_value(s::regclass), 0),
                                           coalesce((SELECT max(id) FROM ${t}), 0), 1))
                   FROM pg_get_serial_sequence($1, 'id') AS s`,
                [t],
            );
        }
        depois = await contagens(prod);

        if (ensaio) {
            await prod.query('ROLLBACK');
        } else {
            await registrarNaTrilha(prod, {
                acao: ACOES.restaurado, pedidoPor,
                detalhes: `${arquivo}; ${descrever(antes, depois)}${execucao ? `; execução ${execucao}` : ''}`,
            });
            await prod.query('COMMIT');
        }
    } catch (e) {
        await prod.query('ROLLBACK').catch(() => {});
        throw e;
    }

    if (ensaio) {
        // Fora da transação desfeita: a trilha registra que houve ensaio, e com que números.
        await registrarNaTrilha(prod, {
            acao: ACOES.ensaiado, pedidoPor,
            detalhes: `${arquivo}; desfeito — teria ficado: ${descrever(antes, depois)}${execucao ? `; execução ${execucao}` : ''}`,
        });
    }
    return { antes, depois, ensaio };
}

function argumento(nome) {
    const i = process.argv.indexOf(`--${nome}`);
    return i === -1 ? undefined : process.argv[i + 1];
}

/** `pedido_por` chega do disparo: vai só para a trilha, como texto, e curto. */
const higienizar = (s) => String(s ?? '').replace(/[^\p{L}\p{N}._@-]/gu, '').slice(0, 60) || 'desconhecido';
const semCredencial = (s) => String(s).replace(/postgres(ql)?:\/\/[^\s]+/g, '<conexão>');

const ESTE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === ESTE) {
    const { default: pg } = await import('pg');
    const comando = process.argv[2];
    const arquivo = argumento('arquivo');
    const pedidoPor = higienizar(argumento('pedido-por'));
    const prod = new pg.Client({ connectionString: process.env.DATABASE_URL });
    let codigo = 0;
    try {
        await prod.connect();
        if (comando === 'validar') {
            validarArquivo(arquivo);
            await exigirBackupVerificado(prod, { repo: process.env.BACKUP_REPO, arquivo });
            console.error(`[restaurar] pedido válido: ${arquivo}, por ${pedidoPor}`);
        } else if (comando === 'restaurar') {
            const backup = new pg.Client({ connectionString: process.env.VERIFICACAO_URL });
            await backup.connect();
            try {
                const r = await restaurar(prod, backup, {
                    arquivo, pedidoPor, ensaio: process.argv.includes('--ensaio'), execucao: process.env.GITHUB_RUN_ID ?? null,
                });
                console.error(`[restaurar] ${r.ensaio ? 'ENSAIO (desfeito)' : 'RESTAURADO'} — ${descrever(r.antes, r.depois)}`);
            } finally {
                await backup.end().catch(() => {});
            }
        } else if (comando === 'falhou') {
            const motivo = semCredencial(argumento('motivo') ?? 'falha no workflow').slice(0, 300);
            await registrarNaTrilha(prod, { acao: ACOES.falhou, pedidoPor, detalhes: `${String(arquivo).slice(0, 80)}; ${motivo}` });
        } else {
            throw new Error('uso: node db/restaurar-backup.mjs validar|restaurar|falhou --arquivo <...> --pedido-por <...>');
        }
    } catch (e) {
        codigo = 1;
        const msg = semCredencial(e?.message || e?.code || e);
        console.error(`[restaurar] ${e instanceof RestauracaoRecusada ? 'RECUSADA' : 'ERRO'}: ${msg}`);
        if (e instanceof RestauracaoRecusada) {
            await registrarNaTrilha(prod, { acao: ACOES.recusada, pedidoPor, detalhes: `${String(arquivo).slice(0, 80)}; ${msg}` })
                .catch(() => {});
            // Para o `$GITHUB_OUTPUT`: a recusa já está na trilha, e o passo de falha do
            // workflow não a registra de novo como RESTAURACAO_FALHOU.
            process.stdout.write('recusada=true\n');
        }
    } finally {
        await prod.end().catch(() => {});
    }
    process.exit(codigo);
}
