import { query } from '@/lib/pg';
import { DOUBLE_CONFIRMATION_TARGET_MINUTES } from '@/lib/business-rules';

// TASK-034 — métricas de negócio do spec §5, calculadas da tabela key_transactions.

export interface BusinessMetrics {
    windowDays: number;
    totalTransactions: number;
    /** % de transações criadas confirmadas pelo portador em ≤ 10 min (alvo ≥ 95%). */
    doubleConfirmationRate: number | null;
    /** Tempo mediano (min) entre criação da transação e confirmação (alvo ≤ 2 min). */
    medianCounterMinutes: number | null;
}

export async function computeBusinessMetrics(windowDays = 30): Promise<BusinessMetrics> {
    const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
    const rows = await query<{ initiated_at: Date; user_confirmed_at: Date | null }>(`
        SELECT initiated_at, user_confirmed_at
        FROM key_transactions
        WHERE initiated_at >= $1
    `, [cutoff]);

    const total = rows.length;
    if (total === 0) {
        return { windowDays, totalTransactions: 0, doubleConfirmationRate: null, medianCounterMinutes: null };
    }

    const confirmedMinutes = rows
        .filter(r => r.user_confirmed_at)
        .map(r => ((r.user_confirmed_at as Date).getTime() - r.initiated_at.getTime()) / 60000)
        .filter(m => m >= 0)
        .sort((a, b) => a - b);

    const withinTarget = confirmedMinutes.filter(m => m <= DOUBLE_CONFIRMATION_TARGET_MINUTES).length;
    const doubleConfirmationRate = Math.round((withinTarget / total) * 1000) / 10;

    let medianCounterMinutes: number | null = null;
    if (confirmedMinutes.length > 0) {
        const mid = Math.floor(confirmedMinutes.length / 2);
        const median = confirmedMinutes.length % 2 === 0
            ? (confirmedMinutes[mid - 1] + confirmedMinutes[mid]) / 2
            : confirmedMinutes[mid];
        medianCounterMinutes = Math.round(median * 10) / 10;
    }

    return { windowDays, totalTransactions: total, doubleConfirmationRate, medianCounterMinutes };
}
