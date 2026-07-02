import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import bcrypt from 'bcrypt';
import { logAction } from '@/lib/logger';
import { signSession } from '@/lib/session';
import { checkRateLimit, checkLockout, recordLoginAttempt, clearLoginAttempts } from '@/lib/security-profile';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        
        // Pega IP do client. Em ambiente local pode vir do cabeçalho ou fallback genérico.
        // O header 'x-forwarded-for' é o padrão se houver reverse proxy (Nginx).
        const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
        
        if (!checkRateLimit(ip)) {
            logAction(0, body.username || 'unknown', 'RATE_LIMIT_EXCEEDED', 'System', `IP ${ip} limit exceeded`);
            return NextResponse.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, { status: 429 });
        }

        if (checkLockout(body.username, ip)) {
            logAction(0, body.username || 'unknown', 'ACCOUNT_LOCKOUT', 'System', `Account locked out for IP ${ip}`);
            return NextResponse.json({ error: 'Conta bloqueada temporariamente. Tente em 15 minutos.' }, { status: 423 });
        }

        if (!body.username || !body.password) {
            recordLoginAttempt(body.username || 'empty', ip, false);
            return NextResponse.json({ error: 'Usuário e senha são obrigatórios' }, { status: 400 });
        }

        const stmt = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1');
        const user = stmt.get(body.username) as any;

        if (!user) {
            recordLoginAttempt(body.username, ip, false);
            // Prevenindo enumeração
            return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
        }

        const match = await bcrypt.compare(body.password, user.password_hash);

        if (!match) {
            recordLoginAttempt(user.username, ip, false);
            logAction(user.id, user.username, 'LOGIN_FAILED', 'System', 'Invalid password');
            return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
        }

        // --- Fluxo de sucesso ---
        clearLoginAttempts(user.username, ip); // Reseta as falhas

        let currentHash = user.password_hash;
        // Se o usuário precisa trocar a senha inicial e enviou uma nova
        if (user.requires_password_change) {
            if (!body.newPassword) {
                return NextResponse.json({ error: 'REQUIRE_PASSWORD_CHANGE' }, { status: 403 });
            }
            if (body.newPassword.length < 8) {
                return NextResponse.json({ error: 'A nova senha deve ter no mínimo 8 caracteres' }, { status: 400 });
            }
            const hashedNew = await bcrypt.hash(body.newPassword, 10);
            db.prepare('UPDATE users SET password_hash = ?, requires_password_change = 0 WHERE id = ?').run(hashedNew, user.id);
            logAction(user.id, user.username, 'CHANGE_PASSWORD', 'System', 'User changed default password on first login');
            currentHash = hashedNew;
        }

        // Set secure cookie with user info (include pwd_hash for strict session check)
        const pwd_hash = typeof currentHash === 'string' ? currentHash.slice(-10) : '';
        const payloadParams = { id: user.id, username: user.username, role: user.role, pwd_hash };
        const sessionToken = await signSession(payloadParams);

        (await cookies()).set('session', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 // 24 hours idle expiration
        });

        logAction(user.id, user.username, 'LOGIN_SUCCESS', 'System', 'User logged in');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
