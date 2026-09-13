import { queryOne } from './pg';

// TASK-114 (ADR-024, decisão 3) — o backup manual pela tela.
//
// A aplicação NÃO faz backup: ela pede ao GitHub que rode o `.github/workflows/backup.yml`
// agora (`workflow_dispatch`). É o mesmo workflow do agendamento, com a mesma verificação
// por restauração e a mesma retenção — e o portão da agenda (TASK-112) deixa execução
// manual sempre passar.
//
// ## A credencial
//
// Um token fine-grained, SÓ com `Actions: Read and write` no repositório do código,
// criado pelo usuário e guardado como secret na Vercel (`BACKUP_DISPARO_TOKEN`), mais o
// nome do repositório (`BACKUP_DISPARO_REPO`, "dono/repo"). Sem os dois, o recurso não
// existe — e a tela não mostra o botão (critério do ADR-013: controle que não funciona
// não aparece).
//
// O token não vai para resposta, log nem trilha. As mensagens de erro são montadas aqui,
// a partir do status HTTP — nunca repassando o que o GitHub devolveu.

export const RAMO = 'main';

/** Depois disso sem execução nova em `backup_runs`, a solicitação deixa de travar o
 *  botão: se o GitHub engoliu o disparo, o ADMIN não pode ficar sem botão para sempre. */
export const PENDENTE_POR_MINUTOS = 60;

export const ACOES = {
    solicitado: 'BACKUP_MANUAL_SOLICITADO',
    falhou: 'BACKUP_MANUAL_FALHOU',
} as const;

// Estrito de propósito: uma URL colada no lugar do nome montaria outro endereço de API,
// e o token iria junto para lá. Na dúvida, "não configurado".
const FORMATO_REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export type ConfiguracaoDoDisparo = { token: string; repo: string };

export function configuracaoDoDisparo(): ConfiguracaoDoDisparo | null {
    const token = (process.env.BACKUP_DISPARO_TOKEN ?? '').trim();
    const repo = (process.env.BACKUP_DISPARO_REPO ?? '').trim();
    if (!token || !FORMATO_REPO.test(repo) || repo.split('/').some(p => p === '.' || p === '..')) return null;
    return { token, repo };
}

/**
 * Há um backup pedido pela tela que ainda não terminou? Termina quando aparece em
 * `backup_runs` uma execução posterior ao pedido — com sucesso OU falha: as duas
 * aparecem em "Último backup", e a falha com a mensagem.
 */
export function estaPendente({ solicitadoEm, ultimoBackupEm, agora }: {
    solicitadoEm: Date | null; ultimoBackupEm: Date | null; agora: Date;
}): boolean {
    if (!solicitadoEm) return false;
    if (ultimoBackupEm && ultimoBackupEm.getTime() >= solicitadoEm.getTime()) return false;
    return agora.getTime() - solicitadoEm.getTime() < PENDENTE_POR_MINUTOS * 60_000;
}

export type EstadoDoBackupManual = {
    configurado: boolean;
    pendente: boolean;
    solicitacao: { em: string; por: string } | null;
};

export async function estadoDoBackupManual(agora = new Date()): Promise<EstadoDoBackupManual> {
    const pedido = await queryOne<{ timestamp: Date | string; username: string }>(
        `SELECT timestamp, username FROM action_logs WHERE action = $1 ORDER BY id DESC LIMIT 1`,
        [ACOES.solicitado],
    );
    const ultimo = await queryOne<{ t: Date | string | null }>('SELECT max(ran_at) AS t FROM backup_runs');
    const solicitadoEm = pedido ? new Date(pedido.timestamp) : null;
    return {
        configurado: configuracaoDoDisparo() !== null,
        pendente: estaPendente({ solicitadoEm, ultimoBackupEm: ultimo?.t ? new Date(ultimo.t) : null, agora }),
        solicitacao: pedido ? { em: solicitadoEm!.toISOString(), por: pedido.username } : null,
    };
}

export class DisparoRecusado extends Error {
    constructor(message: string, readonly status: number | null) {
        super(message);
        this.name = 'DisparoRecusado';
    }
}

/** O que o ADMIN tem de conferir, a partir do status — nunca o corpo do GitHub. */
function explicar(status: number): string {
    if (status === 401) return 'O GitHub recusou o token — ele pode ter expirado ou sido revogado. Gere outro e atualize BACKUP_DISPARO_TOKEN na Vercel.';
    if (status === 403 || status === 404) return 'O token não tem permissão de Actions neste repositório, ou BACKUP_DISPARO_REPO aponta para o repositório errado.';
    return `O GitHub não aceitou o disparo (HTTP ${status}). Tente de novo em alguns minutos.`;
}

/** Pede ao GitHub que rode o workflow de backup agora. 204 é o sucesso do `workflow_dispatch`. */
export async function dispararBackup({ token, repo }: ConfiguracaoDoDisparo): Promise<void> {
    let res: Response;
    try {
        // O nome do workflow é literal, e não constante: é o que a guarda de dois lados
        // (tests/backup-manual.test.ts, BDD 7) procura para aceitar o botão na tela.
        res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/backup.yml/dispatches`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ref: RAMO }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch {
        throw new DisparoRecusado('Não foi possível falar com o GitHub agora. Tente de novo em alguns minutos.', null);
    }
    if (res.status !== 204) throw new DisparoRecusado(explicar(res.status), res.status);
}
