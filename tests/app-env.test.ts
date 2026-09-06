import { describe, it, expect, afterEach } from 'vitest';
import { appEnv, checkRateLimit, checkLockout, recordLoginAttempt, RATE_LIMIT_MAX } from '@/lib/security-profile';

// TASK-060 (Sprint 19) — constitution §8 determina um perfil de ambiente único,
// dirigido por APP_ENV e lido de src/lib/security-profile.ts: "todo controle lê
// daqui, nunca checa ambiente por conta própria".
//
// A cláusula descrevia um mecanismo que nunca existiu: não havia uma única
// ocorrência de APP_ENV no projeto, e os controles usavam constantes fixas.
// É justamente §8 que deveria impedir relaxamento de segurança em produção —
// ir para a internet com ela inerte seria o pior momento.

afterEach(() => { delete process.env.APP_ENV; });

describe('TASK-060 — perfil de ambiente (§8)', () => {
    it('sem APP_ENV, assume production — ausência de config nunca relaxa controle', async () => {
        delete process.env.APP_ENV;
        expect(appEnv()).toBe('production');
    });

    it('APP_ENV=dev seleciona o perfil de desenvolvimento', async () => {
        process.env.APP_ENV = 'dev';
        expect(appEnv()).toBe('dev');
    });

    it('valor não reconhecido cai em production (fail-safe)', async () => {
        for (const lixo of ['DEV', 'development', 'producao', 'staging', '', 'true']) {
            process.env.APP_ENV = lixo;
            expect(appEnv(), `"${lixo}" não pode virar dev`).toBe('production');
        }
    });
});

describe('TASK-060 — o que §8 permite relaxar em dev', () => {
    it('rate limit desligado em dev', async () => {
        process.env.APP_ENV = 'dev';
        const ip = '10.60.0.1';
        for (let i = 0; i < RATE_LIMIT_MAX + 20; i++) {
            expect(await checkRateLimit(ip), `req ${i + 1} não deveria ser bloqueada em dev`).toBe(true);
        }
    });

    it('lockout desligado em dev', async () => {
        process.env.APP_ENV = 'dev';
        const user = 'dev_user';
        for (let i = 0; i < 10; i++) await recordLoginAttempt(user, '10.60.0.2', false);
        expect(await checkLockout(user, '10.60.0.2')).toBe(false);
    });
});

describe('TASK-060 — o que §8 NUNCA permite relaxar', () => {
    it('em production os dois controles continuam valendo', async () => {
        delete process.env.APP_ENV;

        const ip = '10.60.0.3';
        for (let i = 0; i < RATE_LIMIT_MAX; i++) expect(await checkRateLimit(ip)).toBe(true);
        expect(await checkRateLimit(ip), 'rate limit tem de bloquear em production').toBe(false);

        const user = 'prod_user';
        for (let i = 0; i < 5; i++) await recordLoginAttempt(user, '10.60.0.4', false);
        expect(await checkLockout(user, '10.60.0.4'), 'lockout tem de valer em production').toBe(true);
    });

    it('trocar para dev não desfaz o bloqueio já registrado em production', async () => {
        // O relaxamento vale para a decisão do momento, não apaga trilha.
        delete process.env.APP_ENV;
        const user = 'trilha_user';
        for (let i = 0; i < 5; i++) await recordLoginAttempt(user, '10.60.0.5', false);
        expect(await checkLockout(user, '10.60.0.5')).toBe(true);

        process.env.APP_ENV = 'dev';
        expect(await checkLockout(user, '10.60.0.5'), 'em dev o controle é ignorado').toBe(false);

        delete process.env.APP_ENV;
        expect(await checkLockout(user, '10.60.0.5'), 'voltando a production, o registro continua lá').toBe(true);
    });
});
