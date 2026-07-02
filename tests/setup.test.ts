import { expect, test } from 'vitest';
import db from '@/lib/db';

test('Banco de testes e seeds foram injetados corretamente', () => {
    const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('test_admin') as any;
    expect(admin).toBeDefined();
    expect(admin.role).toBe('ADMIN');

    const aluno = db.prepare('SELECT * FROM users WHERE username = ?').get('test_aluno') as any;
    expect(aluno).toBeDefined();
    expect(aluno.role).toBe('ALUNO');
});
