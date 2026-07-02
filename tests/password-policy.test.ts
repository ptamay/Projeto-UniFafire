import { describe, it, expect } from 'vitest';
import { UserSchema, ChangePasswordSchema } from '@/lib/schemas';

// TASK-035 — reativação (ex src/lib/schemas.test.old): política de senha 8+ (REQ-012).

describe('TASK-035 — política de senha (REQ-012)', () => {
    it('UserSchema rejeita senha com menos de 8 caracteres, mencionando o mínimo', () => {
        const result = UserSchema.safeParse({ username: 'testuser', password: '123' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain('8');
        }
    });

    it('UserSchema aceita senha com exatamente 8 caracteres', () => {
        const result = UserSchema.safeParse({ username: 'testuser', password: '12345678' });
        expect(result.success).toBe(true);
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
