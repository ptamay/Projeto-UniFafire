import { query } from '@/lib/pg';
import { comDatasEmIso } from '@/lib/linhas-json';

// TASK-131 (emenda do ADR-029) — as pendências de confirmação, numa consulta só.
//
// Chamada pela rota `GET /api/transactions/pending` e pela página `/confirm`, que agora entrega
// os dados já na abertura (antes a tela abria com cartões cinzas e buscava no navegador). Duas
// cópias da consulta divergiriam — e a divergência seria silenciosa.

/** Quem opera o balcão vê todas as pendências. Os demais, só as próprias. */
export const PAPEIS_QUE_VEEM_TODAS_AS_PENDENCIAS: readonly string[] = ['ADMIN', 'GESTOR', 'PORTEIRO'];

export interface Pendencia {
    id: number;
    key_id: number;
    user_id: number;
    action: 'withdraw' | 'return' | 'transfer';
    status: 'pending' | 'porteiro_confirmed';
    porteiro_id: number | null;
    porteiro_confirmed_at: string | null;
    user_confirmed_at: string | null;
    initiated_at: string;
    key_name: string | null;
    key_room: string | null;
    user_username: string | null;
    user_full_name: string | null;
    porteiro_username: string | null;
}

const SELECT = `
    SELECT kt.*,
           k.name as key_name, k.room as key_room,
           u.username as user_username, u.full_name as user_full_name,
           p.username as porteiro_username
    FROM key_transactions kt
    LEFT JOIN keys k ON kt.key_id = k.id
    LEFT JOIN users u ON kt.user_id = u.id
    LEFT JOIN users p ON kt.porteiro_id = p.id`;

/**
 * `restritoAoUsuarioId` é TETO imposto por quem chama, como o do Histórico (TASK-088): presente,
 * só as pendências em que a pessoa é a destinatária OU o porteiro que iniciou. Quem chama decide
 * pelo papel (`PAPEIS_QUE_VEEM_TODAS_AS_PENDENCIAS`) e passa o id da SESSÃO — nunca um valor vindo
 * da requisição.
 */
export async function listarPendencias({ restritoAoUsuarioId }: { restritoAoUsuarioId?: number }): Promise<Pendencia[]> {
    const linhas = restritoAoUsuarioId === undefined
        ? await query<Pendencia>(`${SELECT}
            WHERE kt.status IN ('pending', 'porteiro_confirmed')
            ORDER BY kt.initiated_at DESC`)
        : await query<Pendencia>(`${SELECT}
            WHERE (kt.user_id = $1 OR kt.porteiro_id = $1)
              AND kt.status IN ('pending', 'porteiro_confirmed')
            ORDER BY kt.initiated_at DESC`, [restritoAoUsuarioId]);
    return comDatasEmIso(linhas) as Pendencia[];
}
