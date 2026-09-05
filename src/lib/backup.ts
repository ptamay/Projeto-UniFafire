import { query, queryOne } from './pg';
import { logStructured } from './structured-logger';
import { APP_TIMEZONE } from './time-filters';
import type { BackupReliability } from './backup-reliability';

// TASK-075 (Sprint 23 · Etapa 7b do ADR-012) — a métrica de confiabilidade lê o
// banco. REQ-009, spec §5.
//
// ## O que este arquivo deixou de fazer
//
// Até aqui ele lia `backups/backup-history.jsonl`, listava `keys_backup_*.db` de
// um diretório e apagava arquivo com `unlinkSync`. Nada disso sobrevive ao
// destino: o disco do Vercel é efêmero e somente-leitura, e o `.jsonl` deixou de
// ser escrito quando a TASK-070 neutralizou a geração por cópia, na Sprint 21.
// A métrica devolvia "sem dados" havia duas sprints — não porque não houvesse
// backup, mas porque estava perguntando ao lugar errado.
//
// Com isso `src/lib/backup.ts` sai da lista de exceção da guarda de filesystem
// da TASK-074, que fica vazia: nada em `src/` toca disco.
//
// ## Onde os backups estão agora
//
// Fora daqui, e de propósito. O `pg_dump` roda no GitHub Actions
// (`.github/workflows/backup.yml`, TASK-078), é verificado por restauração numa
// base descartável e vai para um repositório PRIVADO separado. O que a aplicação
// guarda é o REGISTRO de cada execução, em `backup_runs` — e é dele que esta
// métrica vive.

/**
 * Confiabilidade do backup na janela de `days` dias.
 *
 * ## Por dia, não por execução
 *
 * O denominador é "dias com execução", não "execuções". O caso que decide isso é
 * real: o job falha às 03h, alguém dispara de novo às 09h e funciona. O dia
 * terminou protegido. Contar execuções mostraria 50% num dia que está inteiro.
 *
 * ## `percent: null` não é zero
 *
 * Nulo significa "não houve execução na janela"; zero significa "houve, e todas
 * falharam". Colapsar os dois num número só foi o defeito que esta task veio
 * corrigir — e o pior lado do colapso é que "nunca rodou" apareceria como um
 * número, que é a forma mais fácil de não ser lido.
 *
 * ## `lastRun` ignora a janela
 *
 * De propósito. Sem isso, "rodou por seis meses e parou há 40 dias" fica idêntico
 * a "nunca rodou" — os dois com `percent: null` e nada mais na tela.
 *
 * Não engole erro: se o banco não responder, quem chama precisa saber disso em
 * vez de receber "nenhuma execução", que é exatamente a leitura errada e
 * tranquilizadora.
 */
export async function getBackupReliability(days = 30): Promise<BackupReliability> {
    const dias = await query<{ dia: string; ok: boolean }>(
        `SELECT (ran_at AT TIME ZONE $1)::date AS dia, bool_or(succeeded) AS ok
           FROM backup_runs
          WHERE ran_at >= now() - make_interval(days => $2::int)
          GROUP BY 1`,
        [APP_TIMEZONE, days],
    );

    const totalDays = dias.length;
    const successDays = dias.filter(d => d.ok).length;

    const ultima = await queryOne<{
        ran_at: Date | string;
        succeeded: boolean;
        size_bytes: string | number | null;
        error: string | null;
        destination: string | null;
    }>(
        `SELECT ran_at, succeeded, size_bytes, error, destination
           FROM backup_runs
          ORDER BY ran_at DESC
          LIMIT 1`,
    );

    return {
        totalDays,
        successDays,
        percent: totalDays === 0 ? null : Math.round((successDays / totalDays) * 1000) / 10,
        lastRun: ultima
            ? {
                // O driver entrega `timestamptz` como Date, e esta resposta
                // atravessa JSON até o navegador. Normalizar aqui evita a
                // travessia meia-boca que quebrou a página de histórico na
                // Sprint 21 (Date onde o formatador esperava string).
                ranAt: new Date(ultima.ran_at).toISOString(),
                succeeded: ultima.succeeded,
                // `bigint` chega como string no driver do Postgres — a coluna é
                // bigint porque dump comprimido passa de 2 GB sem drama.
                sizeBytes: ultima.size_bytes === null ? null : Number(ultima.size_bytes),
                error: ultima.error,
                destination: ultima.destination,
            }
            : null,
    };
}

/** As últimas execuções registradas, para a tela mostrar o que aconteceu — não
 *  só o percentual. Substitui a antiga listagem de arquivos `.db` em disco. */
export async function getBackupRuns(limit = 10) {
    const linhas = await query<{
        id: string | number;
        ran_at: Date | string;
        succeeded: boolean;
        size_bytes: string | number | null;
        error: string | null;
        destination: string | null;
    }>(
        `SELECT id, ran_at, succeeded, size_bytes, error, destination
           FROM backup_runs
          ORDER BY ran_at DESC
          LIMIT $1`,
        [limit],
    );

    return linhas.map(l => ({
        id: Number(l.id),
        ranAt: new Date(l.ran_at).toISOString(),
        succeeded: l.succeeded,
        sizeBytes: l.size_bytes === null ? null : Number(l.size_bytes),
        error: l.error,
        destination: l.destination,
    }));
}

/**
 * DESATIVADO na TASK-070 (Sprint 21 · Etapa 4 do ADR-012).
 *
 * A implementação anterior copiava o arquivo `keys.db` para `backups/` e
 * verificava a cópia com `PRAGMA quick_check`. Nenhuma das duas coisas existe na
 * stack nova: não há arquivo de banco para copiar, e o disco da hospedagem é
 * efêmero — a cópia sumiria com a instância.
 *
 * Recusa explícita em vez de sucesso mentiroso: quem clicar em "gerar backup"
 * precisa saber que não gerou.
 *
 * A mensagem foi corrigida na TASK-075. Ela dizia que o backup passaria a ser
 * "gerenciado pelo provedor do banco" — o CR Tipo D de 2026-09-04 apurou que o
 * plano gratuito do Supabase não tem backup gerenciado, e a §4.3 foi reescrita.
 * Apontar o usuário para um mecanismo inexistente é a mesma classe de erro que a
 * recusa existe para evitar.
 */
export async function createBackup(): Promise<{ success: false; error: string }> {
    const error =
        'A geração de backup não parte mais da aplicação. O backup é o job diário ' +
        '`.github/workflows/backup.yml` (TASK-078): ele faz o dump, verifica por ' +
        'restauração e envia para o repositório privado. Para rodar fora da hora, ' +
        'use "Run workflow" no GitHub Actions. Nenhum arquivo foi gerado aqui.';
    await logStructured('warn', 'backup_indisponivel', { motivo: 'TASK-070', substituta: 'TASK-078' });
    return { success: false, error };
}

/**
 * DESATIVADO na TASK-070. `node-cron` precisa de um processo de longa duração,
 * que não existe em execução serverless: o agendamento nunca dispararia.
 *
 * Agendar e nunca rodar seria pior do que não agendar — daria a impressão de que
 * há backup automático. O agendamento é do GitHub Actions (TASK-078).
 */
export async function startCronJobs(): Promise<void> {
    await logStructured('info', 'cron_desativado', {
        motivo: 'node-cron exige processo de longa duração (TASK-070)',
        substituta: 'TASK-078',
    });
}
