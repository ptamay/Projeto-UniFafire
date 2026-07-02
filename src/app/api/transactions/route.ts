import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { TransactionSchema } from '@/lib/schemas';
import { logAction } from '@/lib/logger';
import { logTiming } from '@/lib/structured-logger';

export async function POST(request: Request) {
    const started = performance.now();
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Permitir que qualquer usuário inicie uma transação
        const isPorteiroOrAdmin = ['ADMIN', 'GESTOR', 'PORTEIRO'].includes(session.role);

        const body = await request.json();
        const parseResult = TransactionSchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json({ error: parseResult.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 });
        }
        
        const { action, key_id: keyId, user_id: userId, employee_id: legacyEmployeeId } = parseResult.data;

        // Resolver o user_id: preferir user_id, fallback para employee_id (legado)
        const resolvedUserId = userId || legacyEmployeeId || null;

        const key = db.prepare('SELECT * FROM keys WHERE id = ?').get(keyId) as any;
        if (!key) return NextResponse.json({ error: 'Chave não encontrada.' }, { status: 404 });
        if (key.active === 0) return NextResponse.json({ error: 'Esta chave foi desativada.' }, { status: 400 });

        if (action === 'withdraw') {
            if (!resolvedUserId) return NextResponse.json({ error: 'Usuário obrigatório para retirada.' }, { status: 400 });
            if (key.status !== 'available') return NextResponse.json({ error: 'Esta chave já está em uso.' }, { status: 400 });

            if (!isPorteiroOrAdmin && resolvedUserId !== session.id) {
                return NextResponse.json({ error: 'Você só pode solicitar chaves para si mesmo.' }, { status: 403 });
            }

            // Verificar se usuário existe e está ativo
            const targetUser = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ? AND active = 1').get(resolvedUserId) as any;
            if (!targetUser) return NextResponse.json({ error: 'Usuário não encontrado ou inativo.' }, { status: 400 });

            // Verificar se já há transação pendente para esta chave
            const existingPending = db.prepare(
                "SELECT id FROM key_transactions WHERE key_id = ? AND status IN ('pending', 'porteiro_confirmed')"
            ).get(keyId);
            if (existingPending) {
                return NextResponse.json({ error: 'Já existe uma transação pendente para esta chave.' }, { status: 400 });
            }

            // Criar transação pendente — dupla confirmação necessária
            const now = new Date().toISOString();
            const porteiroId = isPorteiroOrAdmin ? session.id : null;
            const porteiroConfirmedAt = isPorteiroOrAdmin ? now : null;
            const userConfirmedAt = isPorteiroOrAdmin ? null : now;

            const txResult = db.prepare(`
                INSERT INTO key_transactions (key_id, user_id, action, porteiro_id, porteiro_confirmed_at, user_confirmed_at, status, initiated_at)
                VALUES (?, ?, 'withdraw', ?, ?, ?, 'pending', ?)
            `).run(keyId, resolvedUserId, porteiroId, porteiroConfirmedAt, userConfirmedAt, now);

            const transactionId = txResult.lastInsertRowid;

            logAction(session.id, session.username, 'TRANSACTION_INITIATED', key.name, 
                `Retirada iniciada para ${targetUser.full_name || targetUser.username}`);

            return NextResponse.json({ 
                success: true, 
                transactionId,
                status: 'pending',
                message: 'Transação criada. Aguardando confirmação do usuário.',
                requiresUserConfirmation: true,
                targetUser: {
                    id: targetUser.id,
                    username: targetUser.username,
                    full_name: targetUser.full_name,
                    role: targetUser.role
                }
            });

        } else if (action === 'return') {
            if (key.status !== 'in_use') return NextResponse.json({ error: 'Esta chave não está em uso.' }, { status: 400 });

            // Pegar o user_id atual da chave (quem tem ela)
            const currentUserId = key.user_id || resolvedUserId;

            // Verificar se já há transação pendente de devolução
            const existingPending = db.prepare(
                "SELECT id FROM key_transactions WHERE key_id = ? AND status IN ('pending', 'porteiro_confirmed')"
            ).get(keyId);
            if (existingPending) {
                return NextResponse.json({ error: 'Já existe uma transação pendente para esta chave.' }, { status: 400 });
            }

            const now = new Date().toISOString();
            const porteiroId = isPorteiroOrAdmin ? session.id : null;
            const porteiroConfirmedAt = isPorteiroOrAdmin ? now : null;
            const userConfirmedAt = isPorteiroOrAdmin ? null : now;

            const txResult = db.prepare(`
                INSERT INTO key_transactions (key_id, user_id, action, porteiro_id, porteiro_confirmed_at, user_confirmed_at, status, initiated_at)
                VALUES (?, ?, 'return', ?, ?, ?, 'pending', ?)
            `).run(keyId, currentUserId || resolvedUserId, porteiroId, porteiroConfirmedAt, userConfirmedAt, now);

            const transactionId = txResult.lastInsertRowid;

            logAction(session.id, session.username, 'TRANSACTION_INITIATED', key.name, 'Devolução iniciada pelo porteiro');

            return NextResponse.json({ 
                success: true, 
                transactionId,
                status: 'pending',
                message: 'Devolução iniciada. Aguardando confirmação do usuário.',
                requiresUserConfirmation: true,
            });
        } else {
            return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
        }
    } catch (error) {
        console.error('Transaction error:', error);
        return NextResponse.json({ error: 'Falha na transação.' }, { status: 500 });
    } finally {
        logTiming('POST /api/transactions', performance.now() - started);
    }
}
