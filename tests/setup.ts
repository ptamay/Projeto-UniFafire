import { beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';

// Importa a instância global inicializada do banco (já que setamos DB_PATH)
import db from '@/lib/db';

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
        
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT,
            active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            room TEXT,
            status TEXT DEFAULT 'available',
            employee_id INTEGER,
            active INTEGER DEFAULT 1,
            FOREIGN KEY(employee_id) REFERENCES employees(id)
        );

        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id INTEGER,
            key_id INTEGER,
            action TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(key_id) REFERENCES keys(id)
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. Semear o banco com usuários mock de todos os papéis (ADMIN, GESTOR, PORTEIRO, FUNCIONARIO, ALUNO)
    const testPassword = 'test_password_123';
    const hash = bcrypt.hashSync(testPassword, 10);

    const insertUser = db.prepare('INSERT INTO users (username, password_hash, role, requires_password_change) VALUES (?, ?, ?, 0)');
    
    insertUser.run('test_admin', hash, 'ADMIN');
    insertUser.run('test_gestor', hash, 'GESTOR');
    insertUser.run('test_porteiro', hash, 'PORTEIRO');
    insertUser.run('test_funcionario', hash, 'FUNCIONARIO');
    insertUser.run('test_aluno', hash, 'ALUNO');
});

afterAll(() => {
    // Para in-memory DB, fechar a conexão descarta tudo automaticamente.
    try {
        db.close();
    } catch(e) {}
});
