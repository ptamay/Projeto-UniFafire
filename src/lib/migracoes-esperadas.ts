// TASK-103 (CR Tipo D · ADR-021) — as migrations de que ESTE código depende.
//
// Repete, de propósito, os nomes de `db/migrations-pg/*.up.sql`. Em produção esse
// diretório não existe: `db/` fica fora do upload para a Vercel (`.vercelignore`,
// TASK-100), então a aplicação não tem arquivo nenhum para listar.
//
// Repetição que diverge é pior que nenhuma — por isso
// `tests/migracoes-no-deploy.test.ts` reprova no instante em que esta lista e o
// diretório discordarem. Acrescentar a linha aqui é o autor da migration dizendo,
// no mesmo commit, "o código agora depende disto".

import { query } from '@/lib/pg';

export const MIGRACOES_ESPERADAS = [
    '202609031200_baseline_postgres',
    '202609031300_indices',
    '202609031400_imutabilidade_historico',
    '202609041500_app_logs',
    '202609041800_backup_runs',
    '202609061800_sinal_realtime',
    '202609081200_codigo_de_reset',
    '202609090900_sem_senha_compartilhada',
    '202609101000_tutorial_visto',
    '202609101100_registro_de_migracoes',
    '202609101600_api_de_dados_fechada',
] as const;

/**
 * As esperadas que o registro não tem. Lista vazia = o banco tem o schema que este
 * código espera.
 *
 * Só LÊ. Aplicar daqui seria várias instâncias serverless correndo o mesmo DDL ao
 * mesmo tempo — a alternativa que o ADR-021 rejeitou pelo nome. Quem aplica é o
 * runner, na mão de quem publica (runbook §4).
 *
 * Não compara checksum: sem os arquivos em produção não há com o que comparar. O
 * `conferir` do runner, que roda onde os arquivos estão, faz essa parte.
 */
export async function migracoesPendentes(): Promise<string[]> {
    let registradas: Set<string>;
    try {
        const linhas = await query<{ nome: string }>('SELECT nome FROM migracoes_aplicadas');
        registradas = new Set(linhas.map(l => l.nome));
    } catch (e) {
        // Sem a tabela é o estado de antes da adoção (TASK-102): NADA foi conferido,
        // e tratar isso como "tudo certo" seria afirmar o que ninguém verificou.
        // Qualquer outro erro sobe — é o banco com problema, não o schema.
        if ((e as { code?: string }).code === '42P01') return [...MIGRACOES_ESPERADAS];
        throw e;
    }
    return MIGRACOES_ESPERADAS.filter(n => !registradas.has(n));
}
