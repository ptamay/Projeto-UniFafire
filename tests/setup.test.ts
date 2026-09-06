import { expect, test } from 'vitest';
import { queryOne } from '@/lib/pg';

interface TestUserRow {
    id: number;
    username: string;
    role: string;
}

test('Banco de testes e seeds foram injetados corretamente', async () => {
    const admin = await queryOne<TestUserRow>('SELECT * FROM users WHERE username = $1', ['test_admin']);
    expect(admin).toBeDefined();
    expect(admin!.role).toBe('ADMIN');

    const aluno = await queryOne<TestUserRow>('SELECT * FROM users WHERE username = $1', ['test_aluno']);
    expect(aluno).toBeDefined();
    expect(aluno!.role).toBe('ALUNO');
});
