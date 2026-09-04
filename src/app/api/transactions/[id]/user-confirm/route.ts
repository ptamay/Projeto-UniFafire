import { NextResponse } from 'next/server';
import { queryOne, execute, withTransaction } from '@/lib/pg';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { logAction } from '@/lib/logger';
import { logTiming } from '@/lib/structured-logger';
import type { KeyTransactionJoinRow } from '@/lib/db-rows';

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

        const tx = await queryOne<KeyTransactionJoinRow>(`
            SELECT kt.*, k.name as key_name, k.status as key_status,
                   u.username as user_username, u.full_name as user_full_name
            FROM key_transactions kt
            LEFT JOIN keys k ON kt.key_id = k.id
            LEFT JOIN users u ON kt.user_id = u.id
            WHERE kt.id = $1
        `, [transactionId]);

        if (!tx) return NextResponse.json({ error: 'Transação não encontrada.' }, { status: 404 });

        // Autorização. Dois lados podem confirmar:
        //  • o usuário-alvo (user_id) confirma o "lado do usuário";
        //  • a contraparte confirma o "lado do porteiro".
        // A contraparte é estrita quando já designada (transferências push/pull: o remetente
        // ou o portador exato, nunca por papel — ADR-008). Quando `porteiro_id` ainda é null
        // (retirada/devolução iniciada pelo usuário), qualquer porteiro/admin pode assumi-la.
        const isTargetUser = tx.user_id === session.id;
        const isStaff = ['ADMIN', 'GESTOR', 'PORTEIRO'].includes(session.role);
        const canActAsCounterparty = tx.porteiro_id != null
            ? tx.porteiro_id === session.id
            : isStaff;

        if (!isTargetUser && !canActAsCounterparty) {
            return NextResponse.json({ error: 'Você não tem permissão para confirmar esta transação.' }, { status: 403 });
        }

        if (!['pending', 'porteiro_confirmed'].includes(tx.status)) {
            return NextResponse.json({ error: 'Esta transação não está mais pendente.' }, { status: 400 });
        }

        const now = new Date().toISOString();

        // Processar confirmação baseado em quem está confirmando
        if (!isTargetUser && canActAsCounterparty) {
            if (tx.porteiro_confirmed_at) return NextResponse.json({ error: 'O porteiro já confirmou esta transação.' }, { status: 400 });
            // Se a contraparte já estava designada, preserva-a; senão, o porteiro que assume vira o dono do lado.
            const counterpartyId = tx.porteiro_id ?? session.id;
            await execute(
                'UPDATE key_transactions SET porteiro_confirmed_at = $1, porteiro_id = $2 WHERE id = $3',
                [now, counterpartyId, transactionId],
            );
        } else {
            if (tx.user_confirmed_at) return NextResponse.json({ error: 'Você já confirmou esta transação.' }, { status: 400 });
            await execute('UPDATE key_transactions SET user_confirmed_at = $1 WHERE id = $2', [now, transactionId]);
        }

        // Verificar se ambas as partes já confirmaram
        const updatedTx = (await queryOne<Pick<KeyTransactionJoinRow, 'porteiro_confirmed_at' | 'user_confirmed_at'>>(
            'SELECT porteiro_confirmed_at, user_confirmed_at FROM key_transactions WHERE id = $1',
            [transactionId],
        ))!;

        if (updatedTx.porteiro_confirmed_at && updatedTx.user_confirmed_at) {
            // Ambas as partes confirmaram, completar a transação
            // O fecho da dupla confirmacao e a transacao mais critica do sistema:
            // marca a transacao completa, muda o estado da chave e grava o
            // historico. As tres tem de valer juntas ou nenhuma valer — uma chave
            // marcada como devolvida sem a linha de historico correspondente e
            // exatamente o buraco que o REQ-005 existe para impedir.
            //
            // No Postgres isso exige CLIENT DEDICADO: com o pool solto, cada
            // consulta poderia sair por uma conexao diferente e o BEGIN nao
            // alcancaria as demais.
            await withTransaction(async (trx) => {
                await trx.execute(
                    "UPDATE key_transactions SET status = 'completed', completed_at = $1 WHERE id = $2",
                    [now, transactionId],
                );

                if (tx.action === 'withdraw') {
                    await trx.execute("UPDATE keys SET status = 'in_use', user_id = $1 WHERE id = $2",
                        [tx.user_id, tx.key_id]);
                    await trx.execute(
                        "INSERT INTO history (key_id, user_id, username, action, timestamp, transaction_id) VALUES ($1, $2, $3, 'withdraw', $4, $5)",
                        [tx.key_id, tx.user_id, tx.user_username, now, transactionId]);
                } else if (tx.action === 'return') {
                    await trx.execute("UPDATE keys SET status = 'available', user_id = NULL WHERE id = $1",
                        [tx.key_id]);
                    await trx.execute(
                        "INSERT INTO history (key_id, user_id, username, action, timestamp, transaction_id) VALUES ($1, $2, $3, 'return', $4, $5)",
                        [tx.key_id, tx.user_id, tx.user_username, now, transactionId]);
                } else if (tx.action === 'transfer') {
                    // Na transferência por usuário comum, o alvo é o user_id da transação.
                    // A chave continua in_use, mas agora com o novo usuário.
                    await trx.execute("UPDATE keys SET status = 'in_use', user_id = $1 WHERE id = $2",
                        [tx.user_id, tx.key_id]);
                    await trx.execute(
                        "INSERT INTO history (key_id, user_id, username, action, timestamp, transaction_id) VALUES ($1, $2, $3, 'transfer', $4, $5)",
                        [tx.key_id, tx.user_id, tx.user_username, now, transactionId]);
                }
            });

            logAction(session.id, session.username,
                tx.action === 'withdraw' ? 'KEY_WITHDRAWN' : (tx.action === 'return' ? 'KEY_RETURNED' : 'KEY_TRANSFERRED'),
                tx.key_name || 'Chave manipulada',
                `Transação #${transactionId} completada com dupla confirmação`
            );

            return NextResponse.json({ 
                success: true, 
                status: 'completed',
                action: tx.action,
                message: tx.action === 'withdraw' 
                    ? 'Chave retirada com sucesso! Ambas as partes confirmaram.' 
                    : (tx.action === 'return' ? 'Chave devolvida com sucesso! Ambas as partes confirmaram.' : 'Chave transferida com sucesso! Ambas as partes confirmaram.')
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
