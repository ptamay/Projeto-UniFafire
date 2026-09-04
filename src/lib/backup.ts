import fs from 'fs';
import path from 'path';
import { logStructured } from './structured-logger';

// Path dos backups resolvido em tempo de chamada (TASK-032) — honra BACKUPS_DIR.

function getBackupsDir() {
    return path.resolve(process.cwd(), process.env.BACKUPS_DIR || 'backups');
}



export function getBackupReliability(days = 30): {
    totalDays: number;
    successDays: number;
    percent: number | null;
    lastRun: Record<string, unknown> | null;
} {
    try {
        const file = path.join(getBackupsDir(), 'backup-history.jsonl');
        if (!fs.existsSync(file)) return { totalDays: 0, successDays: 0, percent: null, lastRun: null };
        const cutoff = Date.now() - days * 86400000;
        const entries = fs.readFileSync(file, 'utf-8')
            .split('\n').filter(Boolean)
            .map(l => JSON.parse(l) as { ts: string; status: string })
            .filter(e => new Date(e.ts).getTime() >= cutoff);

        const byDay = new Map<string, boolean>();
        for (const e of entries) {
            const day = e.ts.slice(0, 10);
            byDay.set(day, byDay.get(day) === true || e.status === 'success');
        }
        const totalDays = byDay.size;
        const successDays = [...byDay.values()].filter(Boolean).length;
        return {
            totalDays,
            successDays,
            percent: totalDays === 0 ? null : Math.round((successDays / totalDays) * 1000) / 10,
            lastRun: entries.length ? (entries[entries.length - 1] as Record<string, unknown>) : null,
        };
    } catch (e) {
        console.error('[Backup] Falha ao calcular confiabilidade:', e);
        return { totalDays: 0, successDays: 0, percent: null, lastRun: null };
    }
}

/**
 * DESATIVADO na TASK-070 (Sprint 21 · Etapa 4 do ADR-012).
 *
 * A implementação anterior copiava o arquivo `keys.db` para `backups/` e
 * verificava a cópia com `PRAGMA quick_check`. Nenhuma das duas coisas existe na
 * stack nova: não há arquivo de banco para copiar, e o disco da hospedagem é
 * efêmero — a cópia sumiria com a instância.
 *
 * O ADR-012 §4.3 já registra a substituta: backup gerenciado pelo provedor do
 * banco, verificado por job agendado da hospedagem. RPO 24h / RTO 4h continuam
 * valendo; o meio é que muda. O desenho é a **TASK-078**, na Etapa 7.
 *
 * Recusa explícita em vez de sucesso mentiroso: quem clicar em "gerar backup"
 * precisa saber que não gerou. Mesmo tratamento das rotas `backups/restore` e
 * `backups/import` na TASK-068.
 *
 * ⚠️ Isto NÃO deixa a produção sem backup hoje. O servidor PM2 roda a `main`,
 * onde esta função continua copiando o arquivo; esta branch só chega ao usuário
 * no go-live, quando o backup gerenciado já estará no lugar.
 */
export async function createBackup(): Promise<{ success: false; error: string }> {
    const error =
        'Backup por cópia de arquivo foi desativado na migração para Postgres. ' +
        'O backup passa a ser gerenciado pelo provedor do banco; a verificação ' +
        'agendada é a TASK-078 (Etapa 7 do ADR-012). Nenhum arquivo foi gerado.';
    await logStructured('warn', 'backup_indisponivel', { motivo: 'TASK-070', substituta: 'TASK-078' });
    return { success: false, error };
}

export function getAvailableBackups() {
    try {
        const backupsDir = getBackupsDir();
        if (!fs.existsSync(backupsDir)) return [];
        const files = fs.readdirSync(backupsDir);
        return files
            .filter(f => f.startsWith('keys_backup_') && f.endsWith('.db'))
            .map(f => {
                const stat = fs.statSync(path.join(backupsDir, f));
                return {
                    filename: f,
                    createdAt: stat.mtime,
                    size: stat.size
                };
            })
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (e) {
        console.error('[Backup Read Error]', e);
        return [];
    }
}

export function deleteBackup(filename: string) {
    try {
        if (typeof filename !== 'string') return false;

        const backupFilenamePattern = /^keys_backup_[A-Za-z0-9._-]+\.db$/;
        if (!backupFilenamePattern.test(filename) || path.basename(filename) !== filename) return false;

        const backupsDir = getBackupsDir();
        const filePath = path.resolve(backupsDir, filename);
        const relativePath = path.relative(backupsDir, filePath);

        // Impedir Path Traversal
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return false;

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    } catch (e) {
        console.error('[Backup Delete Error]', e);
        return false;
    }
}

/**
 * DESATIVADO na TASK-070. `node-cron` precisa de um processo de longa duração,
 * que não existe em execução serverless: o agendamento nunca dispararia.
 *
 * Agendar e nunca rodar seria pior do que não agendar — daria a impressão de que
 * há backup automático. O agendamento passa a ser da hospedagem (TASK-078).
 */
export async function startCronJobs(): Promise<void> {
    await logStructured('info', 'cron_desativado', {
        motivo: 'node-cron exige processo de longa duração (TASK-070)',
        substituta: 'TASK-078',
    });
}
