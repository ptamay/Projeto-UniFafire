import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import db from './db';

const dbPath = path.resolve(process.cwd(), 'keys.db');
const backupsDir = path.resolve(process.cwd(), 'backups');

let lastBackupDay = ''; // YYYY-MM-DD to prevent duplicates

// Certifique-se de que a pasta de backups existe
if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
}

export function createBackup() {
    try {
        if (!fs.existsSync(dbPath)) {
            console.error('Database file not found. Skipping backup.');
            return false;
        }

        const date = new Date();
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const timestamp = `${yyyy}-${mm}-${dd}`; 

        // Prevent duplicate run on same day
        if (lastBackupDay === timestamp) return true;

        const backupFilename = `keys_backup_${timestamp}.db`;
        const destPath = path.resolve(backupsDir, backupFilename);

        fs.copyFileSync(dbPath, destPath);
        lastBackupDay = timestamp;
        console.log(`[Backup Automático] Banco de dados salvo com sucesso em: ${backupFilename}`);

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
        return false;
    }
}

export function getAvailableBackups() {
    try {
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
        const filePath = path.resolve(backupsDir, filename);
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
