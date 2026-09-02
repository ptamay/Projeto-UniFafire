import { describe, it, expect, vi } from 'vitest';
import db from '@/lib/db';
import { checkRateLimit, checkLockout, recordLoginAttempt, clearLoginAttempts, IP_LOCKOUT_MAX_ATTEMPTS, RATE_LIMIT_MAX } from '@/lib/security-profile';

// TASK-035 — reativação (ex src/lib/security-profile.test.old): rate limit 30 req/min
// e lockout 5 falhas/15min (REQ-012).

describe('TASK-035 — rate limit e lockout (REQ-012)', () => {
    it('rate limit: 30 requisições/min permitidas; a 31ª é bloqueada', () => {
        const ip = '10.99.99.1';
        for (let i = 0; i < 30; i++) {
            expect(checkRateLimit(ip), `req ${i + 1} deveria passar`).toBe(true);
        }
        expect(checkRateLimit(ip), 'req 31 deveria ser bloqueada').toBe(false);
    });

    it('lockout: conta bloqueia após 5 falhas de login', () => {
        const user = 'lockout_test_user';
        const ip = '10.99.99.2';
        clearLoginAttempts(user);

        for (let i = 0; i < 5; i++) {
            expect(checkLockout(user, ip), `tentativa ${i + 1} não deveria estar bloqueada`).toBe(false);
            recordLoginAttempt(user, ip, false);
        }
        expect(checkLockout(user, ip), 'após 5 falhas deve bloquear').toBe(true);
    });

    it('lockout é liberado após limpeza das tentativas (login bem-sucedido)', () => {
        const user = 'lockout_clear_user';
        const ip = '10.99.99.3';
        for (let i = 0; i < 5; i++) recordLoginAttempt(user, ip, false);
        expect(checkLockout(user, ip)).toBe(true);

        clearLoginAttempts(user);
        expect(checkLockout(user, ip)).toBe(false);
    });
});

// TASK-053 (Sprint 16) — o lockout não pode transbordar entre contas que
// compartilham o mesmo IP. Em rede institucional (NAT do campus) todos os
// usuários saem por um único endereço: contar falhas por IP com o mesmo limiar
// do username tranca a portaria inteira quando uma pessoa erra a senha 5 vezes.
describe('TASK-053 — lockout em IP compartilhado (NAT do campus)', () => {
    it('5 falhas de um usuário NÃO bloqueiam outro usuário no mesmo IP', () => {
        const sharedIp = '200.150.10.1'; // IP público único do campus
        const vitima = 'porteiro_da_manha';
        const desastrado = 'usuario_que_errou_a_senha';

        for (let i = 0; i < 5; i++) recordLoginAttempt(desastrado, sharedIp, false);

        expect(checkLockout(desastrado, sharedIp), 'quem errou deve ser bloqueado').toBe(true);
        expect(checkLockout(vitima, sharedIp), 'terceiro no mesmo IP NÃO pode ser bloqueado').toBe(false);
    });

    it('ainda bloqueia força bruta distribuída a partir de um único IP', () => {
        const ip = '203.0.113.77';
        for (let i = 0; i < IP_LOCKOUT_MAX_ATTEMPTS; i++) {
            recordLoginAttempt(`alvo_${i}`, ip, false);
        }
        expect(checkLockout('mais_um_alvo', ip), 'volume anômalo no IP deve bloquear').toBe(true);
    });

    it('login bem-sucedido de um usuário não limpa o bloqueio de outro no mesmo IP', () => {
        const sharedIp = '200.150.10.2';
        for (let i = 0; i < 5; i++) recordLoginAttempt('conta_atacada', sharedIp, false);
        expect(checkLockout('conta_atacada', sharedIp)).toBe(true);

        // Outra pessoa do campus loga normalmente
        clearLoginAttempts('outra_conta_qualquer');

        expect(checkLockout('conta_atacada', sharedIp), 'bloqueio da conta atacada deve permanecer').toBe(true);
    });
});

// TASK-054 (Sprint 16) — o rate limit não pode viver na memória do processo.
// Em serverless cada instância tem o seu Map e ele zera a cada cold start: o
// limite efetivo vira "30 × número de lambdas", resetando de forma imprevisível.
describe('TASK-054 — rate limit persistente (serverless)', () => {
    it('o contador sobrevive a uma nova instância do módulo (cold start)', async () => {
        const ip = '198.51.100.9';
        for (let i = 0; i < RATE_LIMIT_MAX; i++) {
            expect(checkRateLimit(ip), `req ${i + 1} deveria passar`).toBe(true);
        }
        expect(checkRateLimit(ip)).toBe(false);

        // Simula outra instância da função: registro de módulos zerado, banco intacto.
        vi.resetModules();
        const fresh = await import('@/lib/security-profile');

        expect(fresh.checkRateLimit(ip), 'nova instância deve manter o bloqueio').toBe(false);
    });

    it('registra os hits no banco, não em memória', () => {
        const ip = '198.51.100.10';
        checkRateLimit(ip);
        checkRateLimit(ip);

        const row = db.prepare(
            "SELECT COUNT(*) as n FROM rate_limit_hits WHERE scope = 'login' AND identifier = ?"
        ).get(ip) as { n: number };
        expect(row.n).toBe(2);
    });

    it('libera novamente quando a janela expira', () => {
        const ip = '198.51.100.11';
        for (let i = 0; i < RATE_LIMIT_MAX; i++) checkRateLimit(ip);
        expect(checkRateLimit(ip)).toBe(false);

        // Envelhece os hits para fora da janela de 1 minuto
        db.prepare("UPDATE rate_limit_hits SET hit_at = hit_at - 120000 WHERE identifier = ?").run(ip);

        expect(checkRateLimit(ip), 'após a janela deve liberar').toBe(true);
    });
});
