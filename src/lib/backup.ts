import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import Database from 'better-sqlite3';
import db from './db';
import { logStructured } from './structured-logger';

// Paths resolvidos em tempo de chamada (TASK-032) — honram DB_PATH/BACKUPS_DIR do ambiente
function getDbPath() {
    if (process.env.DB_PATH) return path.resolve(process.cwd(), process.env.DB_PATH);
    return process.env.MOCK_DB_IN_MEMORY === 'true'
        ? ':memory:'
        : path.resolve(process.cwd(), 'keys.db');
}

function getBackupsDir() {
    return path.resolve(process.cwd(), process.env.BACKUPS_DIR || 'backups');
}

let lastBackupDay = ''; // YYYY-MM-DD to prevent duplicates

// TASK-032 (REQ-009): valida que o backup existe, tem conteúdo e abre como SQLite íntegro
function verifyBackupFile(filePath: string): { ok: boolean; error?: string } {
    try {
        if (!fs.existsSync(filePath)) return { ok: false, error: 'arquivo não existe' };
        if (fs.statSync(filePath).size === 0) return { ok: false, error: 'arquivo vazio' };
        const check = new Database(filePath, { readonly: true });
        try {
            const result = check.prepare('PRAGMA quick_check').get() as { quick_check: string };
            if (result.quick_check !== 'ok') return { ok: false, error: `quick_check: ${result.quick_check}` };
        } finally {
            check.close();
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

// TASK-032: registro estruturado e persistente de cada run (fonte da métrica
// "confiabilidade do backup" — spec §5, alvo 100%)
function recordBackupRun(entry: {
    filename: string | null;
    status: 'success' | 'failed';
    verified: boolean;
    size: number;
    duration_ms: number;
    error?: string;
}) {
    const record = { ts: new Date().toISOString(), ...entry };
    try {
        fs.mkdirSync(getBackupsDir(), { recursive: true });
        fs.appendFileSync(path.join(getBackupsDir(), 'backup-history.jsonl'), JSON.stringify(record) + '\n', 'utf-8');
    } catch (e) {
        console.error('[Backup] Falha ao registrar run:', e);
    }
    logStructured(entry.status === 'success' ? 'info' : 'error', 'backup_run', record);
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

export function createBackup(options: { force?: boolean } = {}) {
    const startedAt = performance.now();
    const dbPath = getDbPath();
    const backupsDir = getBackupsDir();
    let backupFilename: string | null = null;
    try {
        if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
        if (!fs.existsSync(dbPath)) {
            console.error('Database file not found. Skipping backup.');
            recordBackupRun({ filename: null, status: 'failed', verified: false, size: 0, duration_ms: Math.round(performance.now() - startedAt), error: 'banco de origem não encontrado' });
            return false;
        }

        const date = new Date();
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const timestamp = `${yyyy}-${mm}-${dd}`;

        // Prevent duplicate run on same day
        if (!options.force && lastBackupDay === timestamp) return true;

        backupFilename = `keys_backup_${timestamp}.db`;
        const destPath = path.resolve(backupsDir, backupFilename);

        fs.copyFileSync(dbPath, destPath);
        lastBackupDay = timestamp;

        // TASK-032: verificação automática do arquivo gerado
        const verification = verifyBackupFile(destPath);
        const size = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
        if (!verification.ok) {
            recordBackupRun({ filename: backupFilename, status: 'failed', verified: false, size, duration_ms: Math.round(performance.now() - startedAt), error: verification.error });
            console.error(`[Backup Automático] Backup gerado mas REPROVADO na verificação: ${verification.error}`);
            return false;
        }
        recordBackupRun({ filename: backupFilename, status: 'success', verified: true, size, duration_ms: Math.round(performance.now() - startedAt) });
        console.log(`[Backup Automático] Banco de dados salvo e verificado com sucesso em: ${backupFilename}`);

        // Rotação de Backups Dinâmica (Lê do Banco)
        let retentionCount = 3;
        try {
            const row = db.prepare("SELECT value FROM settings WHERE key = 'backup_retention_count'").get() as { value: string };
            if (row) retentionCount = parseInt(row.value, 10);
        } catch (e) {
            console.error('[Backup] Erro ao ler retention_count, usando padrão 3');
        }

        const currentBackups = getAvailableBackups();
        if (currentBackups.length > retentionCount) {
            const filesToDelete = currentBackups.slice(retentionCount);
            filesToDelete.forEach(bkp => {
                try {
                    fs.unlinkSync(path.resolve(backupsDir, bkp.filename));
                    console.log(`[Backup Automático] Backup antigo removido (Limite: ${retentionCount}): ${bkp.filename}`);
                } catch (err) {
                    console.error(`[Backup Automático] Erro ao remover ${bkp.filename}`, err);
                }
            });
        }

        return true;
    } catch (e) {
        console.error('[Backup Error]', e);
        recordBackupRun({ filename: backupFilename, status: 'failed', verified: false, size: 0, duration_ms: Math.round(performance.now() - startedAt), error: e instanceof Error ? e.message : String(e) });
        return false;
    }
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

// Inicializa a Rotina de Backup ("Checagem por minuto")
let isCronStarted = false;

export function startCronJobs() {
    if (isCronStarted) return;
    
    // Agendador Dinâmico: Roda a cada minuto
    cron.schedule('* * * * *', () => {
        const now = new Date();
        const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        try {
            // Busca o horário agendado no banco
            const row = db.prepare("SELECT value FROM settings WHERE key = 'backup_time'").get() as { value: string };
            const scheduledTime = row?.value || '03:00';

            if (currentHHMM === scheduledTime) {
                console.log(`[Backup] Horário atingido (${currentHHMM}). Iniciando...`);
                createBackup();
            }
        } catch (err) {
            console.error('[Cron] Erro ao verificar horário de backup no banco', err);
        }
    });

    isCronStarted = true;
    console.log('CronJob de backup dinâmico inicializado.');
}
