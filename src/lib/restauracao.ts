import { query, queryOne } from './pg';
import { lerAgenda, CHAVES, OFFSET_RECIFE_HORAS } from './agenda-backup.mjs';

// TASK-115 (ADR-024, decisão 4) — o lado da APLICAÇÃO na restauração: a lista do que dá
// para restaurar e o estado do pedido. Quem restaura é o `.github/workflows/restaurar.yml`
// (motor em `db/restaurar-backup.mjs`), disparado por `dispararRestauracao`.
//
// `src/` não importa de `db/` (db/ nem sobe para a Vercel), então o padrão de nome e os
// nomes das ações são duplicados aqui — e uma guarda confere que são os mesmos
// (tests/restauracao-tela.test.ts, BDD 18). Divergir em silêncio seria a tela esperando
// um fim que o workflow registra com outro nome.

/** O mesmo de `db/enviar-backup.mjs`: `backups/AAAA/MM/AAAA-MM-DDTHHMMSSZ.sql.gz` ou o nome por dia. */
export const NOME_DE_BACKUP = /^backups\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?\.sql\.gz$/;

export const ACOES = {
    solicitada: 'RESTAURACAO_SOLICITADA',
    restaurado: 'BACKUP_RESTAURADO',
    ensaiada: 'RESTAURACAO_ENSAIADA',
    recusada: 'RESTAURACAO_RECUSADA',
    falhou: 'RESTAURACAO_FALHOU',
} as const;

/** O que o workflow (ou a rota, se o GitHub recusar o disparo) grava quando um pedido acaba. */
export const ACOES_DO_FIM: string[] = [ACOES.restaurado, ACOES.recusada, ACOES.falhou];

/** Sem nenhum fim registrado depois disso, o pedido deixa de travar a tela. */
export const PENDENTE_POR_MINUTOS = 60;

const DIA_MS = 86_400_000;
const diaEmRecife = (ms: number) => new Date(ms + OFFSET_RECIFE_HORAS * 3600_000).toISOString().slice(0, 10);

function diaDoArquivo(arquivo: string): string | null {
    const m = NOME_DE_BACKUP.exec(arquivo);
    if (!m) return null;
    const [, data, hh, mm, ss] = m;
    return hh === undefined ? data : diaEmRecife(Date.parse(`${data}T${hh}:${mm}:${ss}Z`));
}

export type Restauravel = { arquivo: string; em: string; tamanho: number | null };

/**
 * O que dá para restaurar: verificado em `backup_runs`, com nome de dump do sistema,
 * dentro da janela de retenção (mais velho que ela foi APAGADO — TASK-113) e feito depois
 * da última migration aplicada (antes dela o schema é outro, e o motor recusaria).
 *
 * `ocultosPorSchema` conta os que ainda existem e ficaram de fora só pelo schema — para a
 * tela dizer por que a lista é curta, em vez de parecer que o backup não rodou.
 */
export async function backupsRestauraveis(agora = new Date()): Promise<{ restauraveis: Restauravel[]; ocultosPorSchema: number }> {
    const linhas = await query<{ ran_at: Date | string; size_bytes: string | number | null; destination: string }>(
        `SELECT ran_at, size_bytes, destination FROM backup_runs
          WHERE succeeded AND destination IS NOT NULL ORDER BY ran_at DESC LIMIT 200`,
    );
    const configuracao = await query<{ key: string; value: string }>(
        'SELECT key, value FROM settings WHERE key = $1', [CHAVES.dias]);
    const { dias } = lerAgenda(Object.fromEntries(configuracao.map(l => [l.key, l.value])));
    const primeiroDia = diaEmRecife(agora.getTime() - (dias - 1) * DIA_MS);

    let ultimaMigracao: number | null;
    try {
        const r = await queryOne<{ t: Date | string | null }>('SELECT max(aplicada_em) AS t FROM migracoes_aplicadas');
        ultimaMigracao = r?.t ? new Date(r.t).getTime() : null;
    } catch (e) {
        // Sem o registro, nenhum backup tem schema que se prove — nada é restaurável.
        if ((e as { code?: string }).code === '42P01') return { restauraveis: [], ocultosPorSchema: 0 };
        throw e;
    }

    const restauraveis: Restauravel[] = [];
    const vistos = new Set<string>();
    let ocultosPorSchema = 0;
    for (const l of linhas) {
        const arquivo = l.destination.slice(l.destination.indexOf(':') + 1);
        const dia = diaDoArquivo(arquivo);
        if (dia === null || dia < primeiroDia || vistos.has(arquivo)) continue;
        vistos.add(arquivo);
        const em = new Date(l.ran_at);
        if (ultimaMigracao === null || em.getTime() <= ultimaMigracao) { ocultosPorSchema++; continue; }
        restauraveis.push({ arquivo, em: em.toISOString(), tamanho: l.size_bytes === null ? null : Number(l.size_bytes) });
    }
    return { restauraveis, ocultosPorSchema };
}

export type EstadoDaRestauracao = {
    pendente: boolean;
    ultima: { acao: string; em: string; por: string; detalhes: string | null } | null;
};

type LinhaDaTrilha = { id: string | number; action: string; timestamp: Date | string; username: string; details: string | null };

export async function estadoDaRestauracao(agora = new Date()): Promise<EstadoDaRestauracao> {
    // `IN ($1, $2, …)` e não `ANY($1)`: o `Param` de src/lib/pg.ts não aceita array.
    const ultimaDe = (acoes: string[]) => queryOne<LinhaDaTrilha>(
        `SELECT id, action, timestamp, username, details FROM action_logs
          WHERE action IN (${acoes.map((_, i) => `$${i + 1}`).join(', ')}) ORDER BY id DESC LIMIT 1`, acoes);
    const pedido = await ultimaDe([ACOES.solicitada]);
    const fim = await ultimaDe(ACOES_DO_FIM);
    const ultima = await ultimaDe([ACOES.solicitada, ACOES.ensaiada, ...ACOES_DO_FIM]);

    const pendente = !!pedido
        && (!fim || Number(fim.id) < Number(pedido.id))
        && agora.getTime() - new Date(pedido.timestamp).getTime() < PENDENTE_POR_MINUTOS * 60_000;
    return {
        pendente,
        ultima: ultima
            ? { acao: ultima.action, em: new Date(ultima.timestamp).toISOString(), por: ultima.username, detalhes: ultima.details }
            : null,
    };
}
