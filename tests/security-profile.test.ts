import { describe, it, expect } from 'vitest';
import { checkRateLimit, checkLockout, recordLoginAttempt, clearLoginAttempts } from '@/lib/security-profile';

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
        clearLoginAttempts(user, ip);

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

        clearLoginAttempts(user, ip);
        expect(checkLockout(user, ip)).toBe(false);
    });
});
