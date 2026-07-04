import { expect, test } from 'vitest';
import db from '@/lib/db';

interface TestUserRow {
    id: number;
    username: string;
    role: string;
}

test('Banco de testes e seeds foram injetados corretamente', () => {
    const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('test_admin') as TestUserRow | undefined;
    expect(admin).toBeDefined();
    expect(admin!.role).toBe('ADMIN');

    const aluno = db.prepare('SELECT * FROM users WHERE username = ?').get('test_aluno') as TestUserRow | undefined;
    expect(aluno).toBeDefined();
    expect(aluno!.role).toBe('ALUNO');
});
