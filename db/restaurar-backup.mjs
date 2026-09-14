// TASK-115 (ADR-024, decisão 4) — restaurar um backup verificado, escolhido da lista.
//
// Roda no GitHub Actions (`.github/workflows/restaurar.yml`), nunca na função da Vercel:
// restaurar exige o dump inteiro, uma base descartável e minutos de trabalho.
//
// ## O que volta no tempo, e o que não volta
//
// Só as tabelas de NEGÓCIO. A trilha de auditoria não volta — a restauração fica
// registrada nela (§3.5, §7.1) —, nem o registro de migrations, nem o estado de segurança
// do momento (`login_attempts`, `rate_limit_hits`), nem a configuração (`settings`: voltar
// a retenção de um backup antigo poderia apagar backups no envio seguinte). Decisões do
// usuário em 2026-09-13.
//
// Toda tabela do schema está numa das duas listas; tabela nova sem lado reprova a suíte
// (`tests/restauracao-classificacao.test.ts`).

/** Na ordem das FKs: quem é referenciado vem antes — a carga insere nesta ordem. */
export const TABELAS_DE_NEGOCIO = ['users', 'keys', 'key_transactions', 'history'];

export const TABELAS_PRESERVADAS = [
    'action_logs', 'audit_logs', 'app_logs', 'backup_runs', 'migracoes_aplicadas',
    'login_attempts', 'rate_limit_hits', 'settings',
];
