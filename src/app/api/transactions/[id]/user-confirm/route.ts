import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { logAction } from '@/lib/logger';
import { logTiming } from '@/lib/structured-logger';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// POST /api/transactions/[id]/user-confirm
// O usuário confirma que retirou ou devolveu a chave
export async function POST(request: Request, { params }: RouteParams) {
    const started = performance.now();
    try {
        const { id } = await params;
        const transactionId = parseInt(id, 10);

        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const session = await verifySession(sessionCookie.value);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const tx = db.prepare(`
            SELECT kt.*, k.name as key_name, k.status as key_status,
                   u.username as user_username, u.full_name as user_full_name
            FROM key_transactions kt
            LEFT JOIN keys k ON kt.key_id = k.id
            LEFT JOIN users u ON kt.user_id = u.id
            WHERE kt.id = ?
        `).get(transactionId) as any;

        if (!tx) return NextResponse.json({ error: 'Transação não encontrada.' }, { status: 404 });

        // Verificar autorização: apenas o usuário da transação, porteiro ou admin pode confirmar
        const isTargetUser = tx.user_id === session.id;
        const isPorteiroOrAdmin = ['ADMIN', 'GESTOR', 'PORTEIRO'].includes(session.role);

        if (!isTargetUser && !isPorteiroOrAdmin) {
            return NextResponse.json({ error: 'Você não tem permissão para confirmar esta transação.' }, { status: 403 });
        }

        if (!['pending', 'porteiro_confirmed'].includes(tx.status)) {
            return NextResponse.json({ error: 'Esta transação não está mais pendente.' }, { status: 400 });
        }

        const now = new Date().toISOString();

        // Processar confirmação baseado em quem está confirmando
        if (isPorteiroOrAdmin && !isTargetUser) {
            if (tx.porteiro_confirmed_at) return NextResponse.json({ error: 'O porteiro já confirmou esta transação.' }, { status: 400 });
            db.prepare(`UPDATE key_transactions SET porteiro_confirmed_at = ?, porteiro_id = ? WHERE id = ?`).run(now, session.id, transactionId);
        } else {
            if (tx.user_confirmed_at) return NextResponse.json({ error: 'Você já confirmou esta transação.' }, { status: 400 });
            db.prepare(`UPDATE key_transactions SET user_confirmed_at = ? WHERE id = ?`).run(now, transactionId);
        }

        // Verificar se ambas as partes já confirmaram
        const updatedTx = db.prepare('SELECT porteiro_confirmed_at, user_confirmed_at FROM key_transactions WHERE id = ?').get(transactionId) as any;

        if (updatedTx.porteiro_confirmed_at && updatedTx.user_confirmed_at) {
            // Ambas as partes confirmaram, completar a transação
            const completeTransaction = db.transaction(() => {
                db.prepare(`UPDATE key_transactions SET status = 'completed', completed_at = ? WHERE id = ?`)
                    .run(now, transactionId);

                if (tx.action === 'withdraw') {
                    db.prepare("UPDATE keys SET status = 'in_use', user_id = ?, employee_id = NULL WHERE id = ?")
                        .run(tx.user_id, tx.key_id);
                    db.prepare(`INSERT INTO history (key_id, employee_id, user_id, username, action, timestamp, transaction_id) VALUES (?, NULL, ?, ?, 'withdraw', ?, ?)`)
                        .run(tx.key_id, tx.user_id, tx.user_username, now, transactionId);
                } else {
                    db.prepare("UPDATE keys SET status = 'available', user_id = NULL, employee_id = NULL WHERE id = ?")
                        .run(tx.key_id);
                    db.prepare(`INSERT INTO history (key_id, employee_id, user_id, username, action, timestamp, transaction_id) VALUES (?, NULL, ?, ?, 'return', ?, ?)`)
                        .run(tx.key_id, tx.user_id, tx.user_username, now, transactionId);
                }
            });

            completeTransaction();

            logAction(session.id, session.username, 
                tx.action === 'withdraw' ? 'KEY_WITHDRAWN' : 'KEY_RETURNED',
                tx.key_name, 
                `Transação #${transactionId} completada com dupla confirmação`
            );

            return NextResponse.json({ 
                success: true, 
                status: 'completed',
                action: tx.action,
                message: tx.action === 'withdraw' 
                    ? 'Chave retirada com sucesso! Ambas as partes confirmaram.' 
                    : 'Chave devolvida com sucesso! Ambas as partes confirmaram.'
            });
        }

        // Se ainda falta confirmação
        return NextResponse.json({ 
            success: true, 
            status: 'pending',
            message: 'Confirmação registrada. Aguardando a outra parte.'
        });
    } catch (error) {
        console.error('User confirm error:', error);
        return NextResponse.json({ error: 'Falha ao confirmar transação.' }, { status: 500 });
    } finally {
        logTiming('POST /api/transactions/[id]/user-confirm', performance.now() - started);
    }
}
