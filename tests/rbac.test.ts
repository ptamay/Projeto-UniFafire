import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as UsersGET, POST as UsersPOST, DELETE as UsersDELETE } from '@/app/api/users/route';
import { POST as KeysPOST } from '@/app/api/keys/route';
import db from '@/lib/db';

// Mock cookies and session
vi.mock('next/headers', () => {
    return {
        cookies: () => ({
            get: vi.fn().mockReturnValue({ value: 'mocked_token' }),
        })
    };
});

interface MockSession {
    id: number;
    role: string;
    username: string;
}

let currentSession: MockSession = { id: 5, role: 'ALUNO', username: 'test_aluno' };

vi.mock('@/lib/session', () => {
    return {
        verifySession: vi.fn().mockImplementation(() => Promise.resolve(currentSession)),
    };
});

describe('RBAC - Controle de Acesso', () => {
    
    beforeEach(() => {
        // Reset DB if needed, mas esses testes são puramente de status
        // exceto delete/create, onde podemos usar transactions
        db.prepare("DELETE FROM users WHERE username = 'temp_user_rbac'").run();
        db.prepare("DELETE FROM keys WHERE name = 'Chave RBAC'").run();
    });

    describe('Alunos / Usuários Comuns (Role: ALUNO, FUNCIONARIO)', () => {
        beforeEach(() => {
            currentSession = { id: 5, role: 'ALUNO', username: 'test_aluno' };
        });

        it('NÃO deve listar usuários (GET /api/users)', async () => {
            const res = await UsersGET();
            expect(res.status).toBe(403);
        });

        it('NÃO deve criar chave (POST /api/keys)', async () => {
            const req = new Request('http://localhost/api/keys', {
                method: 'POST',
                body: JSON.stringify({ name: 'Chave RBAC', room: 'Sala' }),
            });
            const res = await KeysPOST(req);
            expect(res.status).toBe(403);
        });
        
        it('NÃO deve criar usuário (POST /api/users)', async () => {
            const req = new Request('http://localhost/api/users', {
                method: 'POST',
                body: JSON.stringify({ username: 'temp_user_rbac', password: '12345678', role: 'ALUNO' }),
            });
            const res = await UsersPOST(req);
            expect(res.status).toBe(403);
        });
    });

    describe('Porteiros (Role: PORTEIRO)', () => {
        beforeEach(() => {
            currentSession = { id: 3, role: 'PORTEIRO', username: 'test_porteiro' };
        });

        it('DEVE listar usuários (GET /api/users)', async () => {
            const res = await UsersGET();
            expect(res.status).toBe(200);
        });

        it('DEVE criar chave (POST /api/keys)', async () => {
            const req = new Request('http://localhost/api/keys', {
                method: 'POST',
                body: JSON.stringify({ name: 'Chave RBAC', room: 'Sala' }),
            });
            const res = await KeysPOST(req);
            expect(res.status).toBe(200);
        });

        it('NÃO deve criar usuário (POST /api/users)', async () => {
            const req = new Request('http://localhost/api/users', {
                method: 'POST',
                body: JSON.stringify({ username: 'temp_user_rbac', password: '12345678', role: 'ALUNO' }),
            });
            const res = await UsersPOST(req);
            expect(res.status).toBe(403);
        });
    });

    describe('Gestores e Admins (Role: GESTOR, ADMIN)', () => {
        beforeEach(() => {
            currentSession = { id: 1, role: 'ADMIN', username: 'test_admin' };
        });

        it('DEVE criar usuário (POST /api/users)', async () => {
            const req = new Request('http://localhost/api/users', {
                method: 'POST',
                body: JSON.stringify({ username: 'temp_user_rbac', password: '12345678', role: 'ALUNO' }),
            });
            const res = await UsersPOST(req);
            expect(res.status).toBe(200);
        });

        it('NÃO pode excluir a si mesmo (DELETE /api/users)', async () => {
            const req = new Request('http://localhost/api/users', {
                method: 'DELETE',
                body: JSON.stringify({ id: 1 }), // Tentando excluir ID 1 (ele mesmo)
            });
            const res = await UsersDELETE(req);
            expect(res.status).toBe(403);
            const data = await res.json();
            expect(data.error).toBe('Você não pode excluir a si mesmo.');
        });
    });
});
