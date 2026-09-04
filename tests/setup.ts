import { beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';

// Importa a instância global inicializada do banco (já que setamos DB_PATH)
import db from '@/lib/db';
import { execute, closePool } from '@/lib/pg';

// Um hash SO: bcrypt sorteia salt novo a cada chamada, entao semear SQLite e
// Postgres com hashSync separados produziria hashes DIFERENTES para a mesma
// senha. O `pwd_hash` do token e o sufixo do hash — com dois valores distintos,
// toda sessao criada a partir do seed SQLite seria recusada pelo verifySession,
// que le do Postgres. Falha que parece bug de sessao e e de fixture.
export const TEST_PASSWORD = 'test_password_123';
export const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);

beforeAll(() => {
    // 1. Criar Schema (cópia simplificada do init-db.js)
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            role TEXT DEFAULT 'USER',
            active INTEGER DEFAULT 1,
            full_name TEXT,
            matricula TEXT,
            phone TEXT,
            requires_password_change BOOLEAN DEFAULT 1
        );
        
        CREATE TABLE IF NOT EXISTS keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            room TEXT,
            status TEXT DEFAULT 'available',
            user_id INTEGER,
            active INTEGER DEFAULT 1,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            key_id INTEGER,
            action TEXT,
            transaction_id INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(key_id) REFERENCES keys(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS action_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            action TEXT NOT NULL,
            target TEXT,
            details TEXT,
            ip_address TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            ip TEXT,
            success INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS key_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            status TEXT NOT NULL,
            porteiro_id INTEGER,
            user_confirmed_at DATETIME,
            porteiro_confirmed_at DATETIME,
            cancelled_at DATETIME,
            completed_at DATETIME,
            initiated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            justification TEXT
        );
    `);

    // 2. Semear o banco com usuários mock de todos os papéis (ADMIN, GESTOR, PORTEIRO, FUNCIONARIO, ALUNO)
    const hash = TEST_PASSWORD_HASH;

    const insertUser = db.prepare('INSERT INTO users (username, password_hash, role, requires_password_change) VALUES (?, ?, ?, 0)');
    
    insertUser.run('test_admin', hash, 'ADMIN');
    insertUser.run('test_gestor', hash, 'GESTOR');
    insertUser.run('test_porteiro', hash, 'PORTEIRO');
    insertUser.run('test_funcionario', hash, 'FUNCIONARIO');
    insertUser.run('test_aluno', hash, 'ALUNO');
    insertUser.run('test_aluno2', hash, 'ALUNO');

    // 3. Semear uma chave disponível
    const insertKey = db.prepare("INSERT INTO keys (name, room, status) VALUES (?, ?, 'available')");
    insertKey.run('Chave Teste', 'Sala 101');
});

// TASK-069 fatia (a) — o mesmo seed, no Postgres do container.
//
// Custo transitório previsto na decisão D4: enquanto a conversão anda por fatias,
// os dois bancos convivem. Um teste de rota ainda em SQLite lê o usuário do
// SQLite; o `verifySession` dessa mesma rota, já convertido, lê do Postgres. Os
// dois precisam enxergar o MESMO usuário com o MESMO id, ou a divergência vira
// falha de teste que não tem nada a ver com o código sob teste.
//
// Isto sai junto com o SQLite, na fatia (e).
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
    // Para in-memory DB, fechar a conexão descarta tudo automaticamente.
    try {
        db.close();
    } catch { /* in-memory DB — nada a fazer se já fechado */ }
    await closePool();
});
