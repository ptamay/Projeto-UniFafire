import { beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';

// Importa a instância global inicializada do banco (já que setamos DB_PATH)
import { execute, closePool } from '@/lib/pg';

// Um hash SO: bcrypt sorteia salt novo a cada chamada, entao semear SQLite e
// Postgres com hashSync separados produziria hashes DIFERENTES para a mesma
// senha. O `pwd_hash` do token e o sufixo do hash — com dois valores distintos,
// toda sessao criada a partir do seed SQLite seria recusada pelo verifySession,
// que le do Postgres. Falha que parece bug de sessao e e de fixture.
export const TEST_PASSWORD = 'test_password_123';
export const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);

// TASK-069 fatia (a) — o mesmo seed, no Postgres do container.
//
// O duplo dialeto previsto na decisão D4 acabou aqui: o schema SQLite saiu do
// setup na TASK-070, junto com src/lib/db.ts. Restam só as tabelas do Postgres.
beforeAll(async () => {
    await execute(
        'TRUNCATE users, keys, key_transactions, history, action_logs, audit_logs, login_attempts, settings, rate_limit_hits RESTART IDENTITY CASCADE',
    );

    const hash = TEST_PASSWORD_HASH;
    const papeis = ['ADMIN', 'GESTOR', 'PORTEIRO', 'FUNCIONARIO', 'ALUNO', 'ALUNO'];
    const nomes = ['test_admin', 'test_gestor', 'test_porteiro', 'test_funcionario', 'test_aluno', 'test_aluno2'];

    for (let i = 0; i < nomes.length; i++) {
        // id explícito: os testes referenciam ids fixos (test_aluno é 5), e eles
        // têm de bater com a ordem de inserção do seed SQLite acima.
        await execute(
            `INSERT INTO users (id, username, password_hash, role, requires_password_change)
             OVERRIDING SYSTEM VALUE VALUES ($1, $2, $3, $4, false)`,
            [i + 1, nomes[i], hash, papeis[i]],
        );
    }
    await execute(
        `INSERT INTO keys (id, name, room, status) OVERRIDING SYSTEM VALUE VALUES (1, $1, $2, 'available')`,
        ['Chave Teste', 'Sala 101'],
    );

    // As sequências ficam à frente dos ids semeados, senão o primeiro INSERT sem
    // id explícito colidiria com o seed.
    await execute(`SELECT setval(pg_get_serial_sequence('users','id'), (SELECT MAX(id) FROM users))`);
    await execute(`SELECT setval(pg_get_serial_sequence('keys','id'), (SELECT MAX(id) FROM keys))`);
});

afterAll(async () => {
    await closePool();
});
