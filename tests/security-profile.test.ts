import { describe, it, expect } from 'vitest';
import { checkRateLimit, checkLockout, recordLoginAttempt, clearLoginAttempts, IP_LOCKOUT_MAX_ATTEMPTS } from '@/lib/security-profile';

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
