// TASK-112 (ADR-024) — o portão do workflow de backup.
//
// O `.github/workflows/backup.yml` roda de hora em hora; este script decide se há
// backup a fazer, lendo a agenda que o ADMIN configurou na tela e o último backup
// bem-sucedido em `backup_runs`. Imprime no formato do `$GITHUB_OUTPUT`:
//
//   executar=true|false
//   motivo=<texto>
//
// Uso: DATABASE_URL=... EVENTO=<github.event_name> node db/agenda-backup.mjs >> "$GITHUB_OUTPUT"
//
// A política é a de `src/lib/agenda-backup.mjs` — a MESMA que a tela e a rota usam.

import path from 'path';
import { fileURLToPath } from 'url';
import { lerAgenda, deveExecutar, CHAVES, descreverHorarios } from '../src/lib/agenda-backup.mjs';

/**
 * @param client um `pg.Client` conectado
 * @param {{ agora: Date, evento: string }} opcoes
 */
export async function decidir(client, { agora, evento }) {
    // Execução manual é alguém pedindo — a agenda decide o automático, não o pedido.
    if (evento === 'workflow_dispatch') {
        return { executar: true, motivo: 'execução manual' };
    }
    const linhas = await client.query(
        'SELECT key, value FROM settings WHERE key = ANY($1)', [Object.values(CHAVES)],
    );
    const agenda = lerAgenda(Object.fromEntries(linhas.rows.map(l => [l.key, l.value])));
    const ultimo = await client.query('SELECT max(ran_at) AS t FROM backup_runs WHERE succeeded');
    const ultimoSucesso = ultimo.rows[0].t ? new Date(ultimo.rows[0].t) : null;

    const { executar, horario } = deveExecutar({ agora, agenda, ultimoSucesso });
    const quando = `agenda ${descreverHorarios(agenda)} (Recife); horário vencido ${horario.toISOString()}`;
    return {
        executar,
        motivo: executar
            ? `${quando}; sem backup bem-sucedido depois dele`
            : `${quando}; já cumprido em ${ultimoSucesso.toISOString()}`,
    };
}

const ESTE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === ESTE) {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
        await client.connect();
        const r = await decidir(client, { agora: new Date(), evento: process.env.EVENTO ?? 'schedule' });
        process.stdout.write(`executar=${r.executar}\nmotivo=${r.motivo}\n`);
        console.error(`[agenda] ${r.executar ? 'EXECUTAR' : 'pular'} — ${r.motivo}`);
    } catch (e) {
        // Na dúvida, EXECUTA. Um portão que falha fechado deixa de fazer backup em
        // silêncio — o pior modo de falha para um backup. Fazer um a mais é barato.
        // `||` e não `??`: conexão recusada chega como AggregateError de mensagem VAZIA,
        // só com `code` — e o log de uma falha tem de dizer por que falhou.
        const msg = String(e?.message || e?.code || e).replace(/postgres(ql)?:\/\/[^\s]+/g, '<conexão>');
        process.stdout.write(`executar=true\nmotivo=agenda ilegível (${msg}) — executa por segurança\n`);
        console.error(`[agenda] erro lendo a agenda, executando por segurança: ${msg}`);
    } finally {
        await client.end().catch(() => {});
    }
}
