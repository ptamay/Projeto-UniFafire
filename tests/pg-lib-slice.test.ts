import { describe, it, expect, beforeEach } from 'vitest';
import { query, queryOne, execute } from '@/lib/pg';
import { signSession, verifySession } from '@/lib/session';
import { checkRateLimit, recordLoginAttempt, clearLoginAttempts } from '@/lib/security-profile';
import { logAction } from '@/lib/logger';
import { computeBusinessMetrics } from '@/lib/business-metrics';

// TASK-069 fatia (a) (Sprint 21 · Etapa 4 do ADR-012) — os módulos de `src/lib/`
// passam a falar Postgres.
//
// Adicionar `await` nas chamadas NÃO produziria vermelho: `await` sobre valor
// síncrono simplesmente o resolve, e os testes existentes continuariam passando
// contra o SQLite. O contrato que de fato muda é ONDE O DADO VIVE — e é isso que
// este arquivo mede. Cada asserção abaixo falha enquanto o módulo escrever ou ler
// do SQLite, e só passa quando ele estiver no Postgres do container.
//
// Escopo da fatia (a), corrigido durante a execução em relação à tabela do D4:
//
//   session, security-profile, logger, business-metrics
//
// `history-query.ts` SAIU para a fatia (e): ele monta o SQL mas quem o executa é
// `history/page.tsx`. Trocar `?` por `$n` aqui quebraria o consumidor, que ainda
// está em SQLite — os dois são inseparáveis.
//
// `db-maintenance.ts` SAIU para a TASK-070: seus dois chamadores passam um
// callback que usa o `db` do SQLite por dentro. Convertê-lo obriga a converter
// `history/clear` e `clear-database` no mesmo passo, e ele é, por natureza, uma
// transação — que é exatamente o escopo daquela task.
//
// `backup.ts` SAIU para a TASK-078. Ele faz cópia de arquivo do `keys.db` sob
// `node-cron`; converter apenas suas duas leituras de `settings` o faria ler
// configuração de um banco enquanto copia outro, e forçaria `async` por um
// caminho de cron que não existe em serverless. Mesmo destino das rotas
// `backups/restore` e `backups/import` na TASK-068. As duas chamadas seguem em
// SQLite, e o que fazer com elas se decide na fatia (e), quando `src/lib/db.ts`
// precisar morrer — registrado ali como pendência, não esquecido aqui.
//
// A lição das três correções é a mesma: as fatias têm de seguir fronteiras de
// EXECUÇÃO, não de diretório. O plano as desenhou por pasta.

beforeEach(async () => {
    await execute('TRUNCATE login_attempts, rate_limit_hits, action_logs, key_transactions RESTART IDENTITY CASCADE');
});

describe('TASK-069(a) — security-profile grava no Postgres', () => {
    it('recordLoginAttempt grava a tentativa no Postgres, não no SQLite', async () => {
        await recordLoginAttempt('fulano', '10.0.0.9', false);

        const linha = await queryOne<{ username: string; ip: string; success: boolean }>(
            'SELECT username, ip, success FROM login_attempts WHERE username = $1', ['fulano'],
        );
        expect(linha, 'nada chegou ao Postgres').toBeDefined();
        expect(linha?.ip).toBe('10.0.0.9');
    });

    it('success é boolean de verdade no Postgres, não 0/1', async () => {
        await recordLoginAttempt('bem_sucedido', '10.0.0.10', true);
        await recordLoginAttempt('fracassado', '10.0.0.10', false);

        const ok = await queryOne<{ success: boolean }>(
            'SELECT success FROM login_attempts WHERE username = $1', ['bem_sucedido'],
        );
        const falha = await queryOne<{ success: boolean }>(
            'SELECT success FROM login_attempts WHERE username = $1', ['fracassado'],
        );
        expect(ok?.success).toBe(true);
        expect(falha?.success).toBe(false);
    });

    it('clearLoginAttempts apaga do Postgres', async () => {
        await recordLoginAttempt('some_daqui', '10.0.0.11', false);
        await clearLoginAttempts('some_daqui');

        const restantes = await query('SELECT 1 FROM login_attempts WHERE username = $1', ['some_daqui']);
        expect(restantes).toEqual([]);
    });

    it('o rate limit conta a partir da tabela do Postgres', async () => {
        const ip = '10.0.0.12';
        await checkRateLimit(ip);
        await checkRateLimit(ip);

        const total = await queryOne<{ c: string }>(
            'SELECT count(*) AS c FROM rate_limit_hits WHERE identifier = $1', [ip],
        );
        expect(Number(total?.c), 'os hits precisam viver no Postgres (TASK-054)').toBe(2);
    });
});

describe('TASK-069(a) — logger grava a trilha no Postgres', () => {
    it('logAction insere em action_logs do Postgres', async () => {
        await logAction(1, 'admin', 'ACAO_DE_TESTE', 'alvo/x', 'detalhe');

        const linha = await queryOne<{ action: string; target: string; username: string }>(
            'SELECT action, target, username FROM action_logs WHERE action = $1', ['ACAO_DE_TESTE'],
        );
        expect(linha, 'a trilha de auditoria não chegou ao Postgres').toBeDefined();
        expect(linha?.target).toBe('alvo/x');
        expect(linha?.username).toBe('admin');
    });
});

describe('TASK-069(a) — business-metrics lê do Postgres', () => {
    it('as métricas saem das transações gravadas no Postgres', async () => {
        // Semeado SÓ no Postgres: se o módulo ainda lesse SQLite, veria zero.
        await execute(
            `INSERT INTO users (id, username, role) OVERRIDING SYSTEM VALUE VALUES (901, 'metricas', 'ALUNO')
             ON CONFLICT (id) DO NOTHING`,
        );
        await execute(
            `INSERT INTO keys (id, name) OVERRIDING SYSTEM VALUE VALUES (901, 'Chave Métricas')
             ON CONFLICT (id) DO NOTHING`,
        );
        const agora = new Date();
        const umMinutoDepois = new Date(agora.getTime() + 60_000);
        await execute(
            `INSERT INTO key_transactions (key_id, user_id, action, status, initiated_at, user_confirmed_at)
             VALUES ($1, $2, 'withdraw', 'completed', $3, $4)`,
            [901, 901, agora.toISOString(), umMinutoDepois.toISOString()],
        );

        const m = await computeBusinessMetrics(30);
        expect(m.totalTransactions, 'não enxergou a transação do Postgres').toBe(1);
        expect(m.medianCounterMinutes).toBeCloseTo(1, 1);
    });
});

describe('TASK-069(a) — session valida contra o Postgres', () => {
    it('a sessão de um usuário que existe SÓ no Postgres é aceita', async () => {
        await execute(
            `INSERT INTO users (id, username, password_hash, role, active)
             OVERRIDING SYSTEM VALUE VALUES (902, 'so_no_postgres', 'hash-qualquer', 'ALUNO', true)
             ON CONFLICT (id) DO UPDATE SET active = true`,
        );

        const token = await signSession({ id: 902, username: 'so_no_postgres', role: 'ALUNO' });
        const sessao = await verifySession(token);

        expect(sessao, 'verifySession ainda está consultando o SQLite').not.toBeNull();
        expect(sessao?.username).toBe('so_no_postgres');
    });

    it('usuário inativo no Postgres tem a sessão recusada', async () => {
        await execute(
            `INSERT INTO users (id, username, password_hash, role, active)
             OVERRIDING SYSTEM VALUE VALUES (903, 'inativo_pg', 'hash-qualquer', 'ALUNO', false)
             ON CONFLICT (id) DO UPDATE SET active = false`,
        );

        const token = await signSession({ id: 903, username: 'inativo_pg', role: 'ALUNO' });
        await expect(verifySession(token)).resolves.toBeNull();
    });
});
