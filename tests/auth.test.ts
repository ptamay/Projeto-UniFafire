import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/auth/login/route';
import db from '@/lib/db';

// Mock do next/headers
vi.mock('next/headers', () => {
    return {
        cookies: () => ({
            set: vi.fn(),
            get: vi.fn(),
            delete: vi.fn(),
        })
    };
});

// Utilitário para construir Request
function createLoginRequest(username: string, password: string, ip: string = '127.0.0.1') {
    return new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        headers: { 
            'Content-Type': 'application/json',
            'x-forwarded-for': ip
        }
    });
}

describe('Auth API (Login)', () => {
    
    beforeEach(() => {
        // Limpar login_attempts para não interferir entre os testes de lockout
        db.prepare('DELETE FROM login_attempts').run();
    });

    it('deve retornar 200 e setar o cookie JWT para credenciais corretas', async () => {
        const req = createLoginRequest('test_admin', 'test_password_123', '10.0.0.1');
        const res = await POST(req);
        
        expect(res.status).toBe(200);
        
        const data = await res.json();
        expect(data.success).toBe(true);
    });

    it('deve retornar 401 para credenciais inválidas (usuário errado)', async () => {
        const req = createLoginRequest('nao_existe', 'test_password_123', '10.0.0.2');
        const res = await POST(req);
        
        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error).toBe('Credenciais inválidas');
    });

    it('deve retornar 401 para credenciais inválidas (senha errada)', async () => {
        const req = createLoginRequest('test_admin', 'senha_errada', '10.0.0.3');
        const res = await POST(req);
        
        expect(res.status).toBe(401);
    });

    it('deve bloquear (423 Locked) após 5 tentativas falhas', async () => {
        const ip = '10.0.0.4';
        
        // Disparar 5 falhas
        for (let i = 0; i < 5; i++) {
            await POST(createLoginRequest('test_admin', 'senha_errada', ip));
        }

        // A 6ª tentativa deve retornar 423 mesmo com a senha certa
        const req6 = createLoginRequest('test_admin', 'test_password_123', ip);
        const res6 = await POST(req6);
        
        expect(res6.status).toBe(423);
        const data = await res6.json();
        expect(data.error).includes('Conta bloqueada temporariamente');
    });

    it('deve aplicar Rate Limit (429) após 30 requisições', async () => {
        const ip = '10.0.0.5';
        
        // 30 requisições (neste caso simularemos com 400 bad request vazios para não impactar lockout)
        for (let i = 0; i < 30; i++) {
            const req = new Request('http://localhost/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({}),
                headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }
            });
            await POST(req);
        }

        // 31ª requisição deve sofrer rate limit
        const req31 = new Request('http://localhost/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }
        });
        const res31 = await POST(req31);
        
        expect(res31.status).toBe(429);
        const data = await res31.json();
        expect(data.error).includes('Muitas tentativas');
    });
});
