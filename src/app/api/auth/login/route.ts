import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { queryOne, execute } from '@/lib/pg';
import bcrypt from 'bcryptjs';
import { logAction } from '@/lib/logger';
import { codigoExpirou } from '@/lib/reset-code';
import { signSession } from '@/lib/session';
import {
    checkRateLimit, checkLockout, recordLoginAttempt, clearLoginAttempts,
    RATE_LIMIT_WINDOW_MS, LOCKOUT_WINDOW_MINUTES,
} from '@/lib/security-profile';
import { logTiming } from '@/lib/structured-logger';
import { opcoesCookieSessao } from '@/lib/session-cookie';

interface LoginUserRow {
    id: number;
    username: string;
    // Anulável desde a TASK-093: o reset MATA a senha em vez de trocá-la por uma
    // conhecida, então entre o reset e o primeiro acesso a conta não tem senha
    // nenhuma. O tipo diz isso para que ninguém volte a passá-la a `bcrypt`
    // sem olhar.
    password_hash: string | null;
    role: string;
    requires_password_change: number;
    reset_code_hash: string | null;
    reset_code_expires_at: Date | string | null;
}

export async function POST(request: Request) {
    const started = performance.now();
    try {
        const body = await request.json();
        
        // Pega IP do client. Em ambiente local pode vir do cabeçalho ou fallback genérico.
        // O header 'x-forwarded-for' é o padrão se houver reverse proxy (Nginx).
        const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
        
        if (!(await checkRateLimit(ip))) {
            await logAction(0, body.username || 'unknown', 'RATE_LIMIT_EXCEEDED', 'System', `IP ${ip} limit exceeded`);
            // TASK-061 (constitution §2.6): 429 tem de dizer quando voltar; sem o
            // header o cliente só pode adivinhar e tende a insistir em vão.
            return NextResponse.json(
                { error: 'Muitas tentativas. Tente novamente mais tarde.' },
                { status: 429, headers: { 'Retry-After': String(RATE_LIMIT_WINDOW_MS / 1000) } }
            );
        }

        if (await checkLockout(body.username, ip)) {
            await logAction(0, body.username || 'unknown', 'ACCOUNT_LOCKOUT', 'System', `Account locked out for IP ${ip}`);
            return NextResponse.json(
                { error: 'Conta bloqueada temporariamente. Tente em 15 minutos.' },
                { status: 423, headers: { 'Retry-After': String(LOCKOUT_WINDOW_MINUTES * 60) } }
            );
        }

        if (!body.username || !body.password) {
            await recordLoginAttempt(body.username || 'empty', ip, false);
            return NextResponse.json({ error: 'Usuário e senha são obrigatórios' }, { status: 400 });
        }

        // `active` sem comparacao: boolean de verdade no Postgres (TASK-063).
        const user = await queryOne<LoginUserRow>(
            'SELECT * FROM users WHERE username = $1 AND active', [body.username],
        );

        if (!user) {
            await recordLoginAttempt(body.username, ip, false);
            // Prevenindo enumeração
            return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
        }

        // TASK-093 (ADR-017) — dois caminhos de entrada, e a ordem importa.
        //
        // `password_hash` passa a poder ser NULL: o reset MATA a senha antiga em
        // vez de trocá-la por uma conhecida. `bcrypt.compare(x, null)` LANÇA, e
        // sem esta guarda uma conta em reset viraria 500 no login — que é
        // indistinguível de indisponibilidade para quem está tentando entrar.
        const senhaConfere = user.password_hash
            ? await bcrypt.compare(body.password, user.password_hash)
            : false;

        // O código só é considerado se a senha não serviu. Caminho comum primeiro:
        // quem não está em reset nem chega a pagar esta comparação.
        const codigoConfere = !senhaConfere
            && !!user.reset_code_hash
            && !codigoExpirou(user.reset_code_expires_at)
            && await bcrypt.compare(body.password, user.reset_code_hash);

        const match = senhaConfere || codigoConfere;

        if (!match) {
            await recordLoginAttempt(user.username, ip, false);
            await logAction(user.id, user.username, 'LOGIN_FAILED', 'System', 'Invalid password');
            return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
        }

        // --- Fluxo de sucesso ---
        await clearLoginAttempts(user.username); // Reseta as falhas da conta (TASK-053: nunca por IP)

        let currentHash = user.password_hash;
        // Se o usuário precisa trocar a senha inicial e enviou uma nova
        if (user.requires_password_change || codigoConfere) {
            if (!body.newPassword) {
                return NextResponse.json({ error: 'REQUIRE_PASSWORD_CHANGE' }, { status: 403 });
            }
            if (body.newPassword.length < 8) {
                return NextResponse.json({ error: 'A nova senha deve ter no mínimo 8 caracteres' }, { status: 400 });
            }
            const hashedNew = await bcrypt.hash(body.newPassword, 10);
            // O código é CONSUMIDO aqui, na mesma instrução que grava a senha.
            // Código reutilizável seria a senha compartilhada de novo, só que com
            // outro nome — e limpá-lo numa segunda instrução abriria uma janela
            // entre as duas em que ele ainda valeria.
            await execute(
                `UPDATE users SET password_hash = $1, requires_password_change = false,
                 reset_code_hash = NULL, reset_code_expires_at = NULL WHERE id = $2`,
                [hashedNew, user.id],
            );
            await logAction(user.id, user.username, 'CHANGE_PASSWORD', 'System', 'User changed default password on first login');
            currentHash = hashedNew;
        }

        // Set secure cookie with user info (include pwd_hash for strict session check)
        const pwd_hash = typeof currentHash === 'string' ? currentHash.slice(-10) : '';
        const payloadParams = { id: user.id, username: user.username, role: user.role, pwd_hash };
        const sessionToken = await signSession(payloadParams);

        (await cookies()).set(opcoesCookieSessao(sessionToken));

        await logAction(user.id, user.username, 'LOGIN_SUCCESS', 'System', 'User logged in');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    } finally {
        await logTiming('POST /api/auth/login', performance.now() - started);
    }
}
