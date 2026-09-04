// TASK-034 — regras de negócio do spec §5, centralizadas (client-safe: sem imports
// de servidor). Alterar estes valores exige Change Request no spec.md.

/** Chave em atraso: retirada há mais de N horas sem devolução (spec §5). */
export const OVERDUE_HOURS = 12;

/** Dupla confirmação saudável: portador confirma em até N minutos (spec §5, alvo ≥95%). */
export const DOUBLE_CONFIRMATION_TARGET_MINUTES = 10;

/** Chave com data de retirada — o mínimo que a regra de atraso precisa saber. */
export interface OverdueCandidate {
    status: string;
    in_use_since?: string | null;
}

/**
 * TASK-058 — chaves em atraso no instante `now` (epoch ms).
 *
 * O instante entra como argumento em vez de ser lido do relógio dentro da função.
 * Antes, o cálculo acontecia durante o render do Dashboard: o servidor decidia
 * com o seu relógio e o cliente decidia de novo com o dele na hidratação, e os
 * dois podiam discordar sobre exibir ou não o aviso de atraso — mismatch que faz
 * o React descartar a árvore renderizada. Como parâmetro explícito, a regra vira
 * pura e testável com um instante fixo.
 */
export function findDelayedKeys<T extends OverdueCandidate>(
    keys: T[],
    now: number
): (T & { diffHours: number })[] {
    return keys
        .filter(k => {
            if (k.status !== 'in_use' || !k.in_use_since) return false;
            // Compara a fração exata, não o valor arredondado: 12,5h continua
            // sendo atraso, como no comportamento original.
            return (now - new Date(k.in_use_since).getTime()) / 3_600_000 > OVERDUE_HOURS;
        })
        .map(k => ({
            ...k,
            diffHours: Math.floor((now - new Date(k.in_use_since as string).getTime()) / 3_600_000),
        }));
}
