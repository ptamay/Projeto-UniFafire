import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { TransactionSchema } from '@/lib/schemas';
import { logAction } from '@/lib/logger';
import { logTiming } from '@/lib/structured-logger';
import type { KeyTableRow, TargetUserRow } from '@/lib/db-rows';

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
        
        const { action, key_id: keyId, user_id: userId, employee_id: legacyEmployeeId, bypassConfirmation, justification, observation } = parseResult.data;

        // Resolver o user_id: preferir user_id, fallback para employee_id (legado)
        const resolvedUserId = userId || legacyEmployeeId || null;

        const key = db.prepare('SELECT * FROM keys WHERE id = ?').get(keyId) as KeyTableRow | undefined;
        if (!key) return NextResponse.json({ error: 'Chave não encontrada.' }, { status: 404 });
        if (key.active === 0) return NextResponse.json({ error: 'Esta chave foi desativada.' }, { status: 400 });

        if (action === 'withdraw') {
            if (!resolvedUserId) return NextResponse.json({ error: 'Usuário obrigatório para retirada.' }, { status: 400 });
            if (key.status !== 'available') return NextResponse.json({ error: 'Esta chave já está em uso.' }, { status: 400 });

            if (!isPorteiroOrAdmin && resolvedUserId !== session.id) {
                return NextResponse.json({ error: 'Você só pode solicitar chaves para si mesmo.' }, { status: 403 });
            }

            // Verificar se usuário existe e está ativo
            const targetUser = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ? AND active = 1').get(resolvedUserId) as TargetUserRow | undefined;
            if (!targetUser) return NextResponse.json({ error: 'Usuário não encontrado ou inativo.' }, { status: 400 });

            // Verificar se já há transação pendente para esta chave
            const existingPending = db.prepare(
                "SELECT id FROM key_transactions WHERE key_id = ? AND status IN ('pending', 'porteiro_confirmed')"
            ).get(keyId);
            if (existingPending) {
                return NextResponse.json({ error: 'Já existe uma transação pendente para esta chave.' }, { status: 400 });
            }

            const now = new Date().toISOString();

            if (bypassConfirmation) {
                if (!isPorteiroOrAdmin) return NextResponse.json({ error: 'Apenas porteiros ou gestores podem atribuir chaves sem confirmação.' }, { status: 403 });
                if (!justification || justification.trim() === '') return NextResponse.json({ error: 'Justificativa é obrigatória ao atribuir sem confirmação.' }, { status: 400 });

                // Atribuição direta
                const txResult = db.prepare(`
                    INSERT INTO key_transactions (key_id, user_id, action, porteiro_id, porteiro_confirmed_at, user_confirmed_at, status, initiated_at, completed_at, justification)
                    VALUES (?, ?, 'withdraw', ?, ?, ?, 'completed', ?, ?, ?)
                `).run(keyId, resolvedUserId, session.id, now, now, now, now, justification.trim());

                const transactionId = txResult.lastInsertRowid;

                db.prepare("UPDATE keys SET status = 'in_use', user_id = ? WHERE id = ?").run(resolvedUserId, keyId);

                db.prepare(`
                    INSERT INTO history (key_id, action, user_id, username, transaction_id)
                    VALUES (?, 'withdraw', ?, ?, ?)
                `).run(keyId, resolvedUserId, targetUser.username, transactionId);

                logAction(session.id, session.username, 'TRANSACTION_BYPASS', key.name, 
                    `Atribuída diretamente para ${targetUser.full_name || targetUser.username}. Justificativa: ${justification.trim()}`);

                return NextResponse.json({ 
                    success: true, 
                    transactionId,
                    status: 'completed',
                    message: 'Chave atribuída com sucesso.',
                    requiresUserConfirmation: false
                });
            }

            // Criar transação pendente — dupla confirmação necessária
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

            // Somente a portaria ou o portador atual podem iniciar a devolução —
            // sem isso, um usuário comum criaria uma devolução "confirmada" em nome do portador.
            if (!isPorteiroOrAdmin && key.user_id !== session.id) {
                return NextResponse.json({ error: 'Você só pode devolver chaves que estão sob sua posse.' }, { status: 403 });
            }

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

            if (bypassConfirmation) {
                if (!isPorteiroOrAdmin) return NextResponse.json({ error: 'Apenas porteiros ou gestores podem devolver chaves sem confirmação.' }, { status: 403 });

                // REQ-028/ADR-009: a portaria pode forçar a devolução de QUALQUER chave em uso.
                // A justificativa é informada no ato (não mais herdada da retirada) e é obrigatória.
                if (!justification || justification.trim() === '') {
                    return NextResponse.json({ error: 'Justificativa é obrigatória para forçar a devolução.' }, { status: 400 });
                }
                const returnJustification = justification.trim();

                // Devolução direta
                const txResult = db.prepare(`
                    INSERT INTO key_transactions (key_id, user_id, action, porteiro_id, porteiro_confirmed_at, user_confirmed_at, status, initiated_at, completed_at, justification)
                    VALUES (?, ?, 'return', ?, ?, ?, 'completed', ?, ?, ?)
                `).run(keyId, currentUserId || resolvedUserId, session.id, now, now, now, now, returnJustification);

                const transactionId = txResult.lastInsertRowid;

                db.prepare("UPDATE keys SET status = 'available', user_id = NULL WHERE id = ?").run(keyId);

                const targetUser = db.prepare('SELECT username FROM users WHERE id = ?').get(currentUserId || resolvedUserId) as { username: string } | undefined;

                db.prepare(`
                    INSERT INTO history (key_id, action, user_id, username, transaction_id)
                    VALUES (?, 'return', ?, ?, ?)
                `).run(keyId, currentUserId || resolvedUserId, targetUser?.username || 'Unknown', transactionId);

                logAction(session.id, session.username, 'TRANSACTION_BYPASS', key.name,
                    `Devolução forçada de ${targetUser?.username || 'Unknown'}. Justificativa: ${returnJustification}`);

                return NextResponse.json({ 
                    success: true, 
                    transactionId,
                    status: 'completed',
                    message: 'Chave devolvida com sucesso.',
                    requiresUserConfirmation: false
                });
            }

            // Criar transação pendente de devolução
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
        } else if (action === 'transfer') {
            if (key.status !== 'in_use') return NextResponse.json({ error: 'A chave deve estar em uso para ser transferida.' }, { status: 400 });
            if (!resolvedUserId) return NextResponse.json({ error: 'Usuário de destino obrigatório para transferência.' }, { status: 400 });

            // Dois fluxos de usuário comum:
            //  • push (REQ-024): o portador cede a chave a outro.
            //  • pull (REQ-027): quem não está com a chave a solicita ao portador — só para si mesmo.
            const isHolder = key.user_id === session.id;
            if (!isPorteiroOrAdmin && !isHolder && resolvedUserId !== session.id) {
                return NextResponse.json({ error: 'Você só pode solicitar a chave para si mesmo.' }, { status: 403 });
            }

            const targetUser = db.prepare('SELECT id, username, full_name, role FROM users WHERE id = ? AND active = 1').get(resolvedUserId) as TargetUserRow | undefined;
            if (!targetUser) return NextResponse.json({ error: 'Usuário de destino não encontrado ou inativo.' }, { status: 400 });

            if (key.user_id === resolvedUserId) return NextResponse.json({ error: 'A chave já está com este usuário.' }, { status: 400 });

            const existingPending = db.prepare(
                "SELECT id FROM key_transactions WHERE key_id = ? AND status IN ('pending', 'porteiro_confirmed')"
            ).get(keyId);
            if (existingPending) {
                return NextResponse.json({ error: 'Há uma transação pendente. Cancele-a antes de transferir.' }, { status: 400 });
            }

            const now = new Date().toISOString();
            const obs = observation || justification || null;

            if (isPorteiroOrAdmin) {
                // Porteiro transfere imediatamente (como já era)
                const txResult = db.prepare(`
                    INSERT INTO key_transactions (key_id, user_id, action, porteiro_id, porteiro_confirmed_at, user_confirmed_at, status, initiated_at, completed_at, justification)
                    VALUES (?, ?, 'transfer', ?, ?, ?, 'completed', ?, ?, ?)
                `).run(keyId, resolvedUserId, session.id, now, now, now, now, obs?.trim() || null);

                const transactionId = txResult.lastInsertRowid;

                db.prepare("UPDATE keys SET user_id = ? WHERE id = ?").run(resolvedUserId, keyId);

                db.prepare(`
                    INSERT INTO history (key_id, action, user_id, username, transaction_id)
                    VALUES (?, 'transfer', ?, ?, ?)
                `).run(keyId, resolvedUserId, targetUser.username, transactionId);

                logAction(session.id, session.username, 'KEY_TRANSFERRED', key.name, 
                    `Chave transferida (bypass admin) para ${targetUser.full_name || targetUser.username}. Observação: ${obs?.trim() || 'Nenhuma'}`);

                return NextResponse.json({ 
                    success: true, 
                    transactionId,
                    status: 'completed',
                    message: 'Chave transferida com sucesso.',
                    requiresUserConfirmation: false
                });
            } else if (isHolder) {
                // PUSH (REQ-024): o portador cede a chave. O destinatário (user_id) aceita.
                // `porteiro_id` guarda o remetente que já confirmou ao iniciar (contraparte).
                const txResult = db.prepare(`
                    INSERT INTO key_transactions (key_id, user_id, action, porteiro_id, porteiro_confirmed_at, user_confirmed_at, status, initiated_at, justification)
                    VALUES (?, ?, 'transfer', ?, ?, NULL, 'pending', ?, ?)
                `).run(keyId, resolvedUserId, session.id, now, now, obs?.trim() || null);

                const transactionId = txResult.lastInsertRowid;

                logAction(session.id, session.username, 'TRANSACTION_INITIATED', key.name,
                    `Transferência iniciada para ${targetUser.full_name || targetUser.username}. Observação: ${obs?.trim() || 'Nenhuma'}`);

                return NextResponse.json({
                    success: true,
                    transactionId,
                    status: 'pending',
                    message: 'Transferência iniciada. Aguardando confirmação do destinatário.',
                    requiresUserConfirmation: true,
                    targetUser: {
                        id: targetUser.id,
                        username: targetUser.username,
                        full_name: targetUser.full_name,
                        role: targetUser.role
                    }
                });
            } else {
                // PULL (REQ-027): quem não está com a chave a solicita ao portador.
                // Espelha o push: `user_id` = solicitante (destino, já confirmado ao iniciar);
                // `porteiro_id` = portador atual (contraparte que precisa aceitar).
                const txResult = db.prepare(`
                    INSERT INTO key_transactions (key_id, user_id, action, porteiro_id, porteiro_confirmed_at, user_confirmed_at, status, initiated_at, justification)
                    VALUES (?, ?, 'transfer', ?, NULL, ?, 'pending', ?, ?)
                `).run(keyId, resolvedUserId, key.user_id, now, now, obs?.trim() || null);

                const transactionId = txResult.lastInsertRowid;

                logAction(session.id, session.username, 'TRANSACTION_INITIATED', key.name,
                    `Solicitação de chave iniciada por ${session.username} ao portador. Observação: ${obs?.trim() || 'Nenhuma'}`);

                return NextResponse.json({
                    success: true,
                    transactionId,
                    status: 'pending',
                    message: 'Solicitação enviada. Aguardando o portador aceitar.',
                    requiresUserConfirmation: true,
                    targetUser: {
                        id: targetUser.id,
                        username: targetUser.username,
                        full_name: targetUser.full_name,
                        role: targetUser.role
                    }
                });
            }
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
