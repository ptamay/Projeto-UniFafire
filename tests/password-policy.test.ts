import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { UserSchema, ChangePasswordSchema } from '@/lib/schemas';

// TASK-035 — reativação (ex src/lib/schemas.test.old): política de senha 8+ (REQ-012).

describe('TASK-035 — política de senha (REQ-012)', () => {
    // TASK-093 (ADR-017) — a política de 8+ NÃO deixou de valer na criação de
    // usuário: deixou de haver senha na criação. A conta nasce com um código de
    // uso único e a pessoa define a própria senha no primeiro acesso, que é onde
    // o mínimo passa a ser cobrado.
    //
    // A §2.4 diz que a política se aplica "em criação de usuário, troca e reset de
    // senha". Os três momentos continuam cobertos — o primeiro mudou de lugar, do
    // formulário do ADMIN para o primeiro acesso do dono.
    it('criar usuário não aceita mais senha nenhuma', () => {
        const result = UserSchema.safeParse({ username: 'testuser', password: '12345678' });
        expect(result.success, 'o schema ainda parseia senha').toBe(true);
        expect(
            (result.success ? result.data : {}) as Record<string, unknown>,
            'a senha sobreviveu ao parse — a rota vai aceitar e ignorar, que é pior que recusar',
        ).not.toHaveProperty('password');
    });

    it('o mínimo de 8 é cobrado no primeiro acesso, que é onde a senha nasce', () => {
        // Guarda de verdade: se alguém tirar esta validação do login, a política
        // some do caminho de criação inteiro sem nenhum outro teste reclamar.
        const login = fs.readFileSync(path.resolve(process.cwd(), 'src/app/api/auth/login/route.ts'), 'utf-8');
        expect(login, 'o login deixou de exigir o mínimo na senha nova').toMatch(
            /newPassword\.length\s*<\s*8/,
        );
    });

    it('ChangePasswordSchema rejeita senha nova com menos de 8 caracteres', () => {
        const result = ChangePasswordSchema.safeParse({ userId: 1, currentPassword: '123', newPassword: '1234567' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain('8');
        }
    });

    it('ChangePasswordSchema aceita senha nova com 8 caracteres', () => {
        const result = ChangePasswordSchema.safeParse({ userId: 1, currentPassword: '123', newPassword: '12345678' });
        expect(result.success).toBe(true);
    });
});
