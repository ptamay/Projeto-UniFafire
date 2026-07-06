import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as TransactionPOST } from '@/app/api/transactions/route';
import { GET as PendingGET } from '@/app/api/transactions/pending/route';
import { POST as CancelPOST } from '@/app/api/transactions/[id]/cancel/route';
import { POST as ConfirmPOST } from '@/app/api/transactions/[id]/user-confirm/route';
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

// Helper for changing the current logged in user
let currentSession: MockSession = { id: 5, role: 'ALUNO', username: 'test_aluno' };

vi.mock('@/lib/session', () => {
    return {
        verifySession: vi.fn().mockImplementation(() => Promise.resolve(currentSession)),
    };
});

describe('Ciclo de Vida das Chaves (Transações)', () => {

    beforeEach(() => {
        // Limpar transações para testes independentes
        db.prepare('DELETE FROM key_transactions').run();
        db.prepare('DELETE FROM history').run();
        db.prepare("UPDATE keys SET status = 'available', user_id = NULL").run();
        
        // Reset do mock de sessão para ALUNO por padrão (id 5 é o test_aluno)
        currentSession = { id: 5, role: 'ALUNO', username: 'test_aluno' };
    });

    it('deve permitir a retirada (withdraw) com dupla confirmação', async () => {
        // 1. Aluno solicita a chave 1
        const withdrawReq = new Request('http://localhost/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'withdraw', key_id: 1, user_id: 5 }),
            headers: { 'Content-Type': 'application/json' }
        });
        
        const withdrawRes = await TransactionPOST(withdrawReq);
        const withdrawData = await withdrawRes.json();
        
        expect(withdrawRes.status).toBe(200);
        expect(withdrawData.status).toBe('pending');
        expect(withdrawData.transactionId).toBeDefined();

        const txId = withdrawData.transactionId;

        // A chave ainda deve estar disponível enquanto aguarda confirmação
        const keyStatus = db.prepare('SELECT status FROM keys WHERE id = 1').get() as { status: string };
        expect(keyStatus.status).toBe('available');

        // 2. Porteiro (ID 3) confirma a retirada
        currentSession = { id: 3, role: 'PORTEIRO', username: 'test_porteiro' };
        
        const confirmReq = new Request(`http://localhost/api/transactions/${txId}/user-confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const params = Promise.resolve({ id: String(txId) });
        const confirmRes = await ConfirmPOST(confirmReq, { params });
        const confirmData = await confirmRes.json();

        expect(confirmRes.status).toBe(200);
        expect(confirmData.status).toBe('completed');

        // 3. Verifica se a chave foi pra 'in_use' e o user_id foi associado
        const keyStatus2 = db.prepare('SELECT status, user_id FROM keys WHERE id = 1').get() as { status: string; user_id: number | null };
        expect(keyStatus2.status).toBe('in_use');
        expect(keyStatus2.user_id).toBe(5);

        // Verifica histórico
        const historyCount = db.prepare('SELECT count(*) as c FROM history WHERE key_id = 1 AND action = ?').get('withdraw') as { c: number };
        expect(historyCount.c).toBe(1);
    });

    it('deve permitir a devolução (return) com dupla confirmação', async () => {
        // 1. Setup: Colocar a chave 1 em 'in_use' pelo aluno 5
        db.prepare("UPDATE keys SET status = 'in_use', user_id = 5 WHERE id = 1").run();

        // 2. Porteiro inicia a devolução
        currentSession = { id: 3, role: 'PORTEIRO', username: 'test_porteiro' };
        
        const returnReq = new Request('http://localhost/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'return', key_id: 1, user_id: 5 }),
            headers: { 'Content-Type': 'application/json' }
        });
        const returnRes = await TransactionPOST(returnReq);
        const returnData = await returnRes.json();
        
        expect(returnRes.status).toBe(200);
        expect(returnData.status).toBe('pending');
        
        const txId = returnData.transactionId;

        // 3. Aluno confirma a devolução
        currentSession = { id: 5, role: 'ALUNO', username: 'test_aluno' };
        
        const confirmReq = new Request(`http://localhost/api/transactions/${txId}/user-confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const params = Promise.resolve({ id: String(txId) });
        const confirmRes = await ConfirmPOST(confirmReq, { params });
        const confirmData = await confirmRes.json();

        expect(confirmRes.status).toBe(200);
        expect(confirmData.status).toBe('completed');

        // 4. Verifica se a chave voltou pra 'available' e o user_id foi limpo
        // 4. Verifica se a chave voltou pra 'available' e o user_id foi limpo
        const keyStatus = db.prepare('SELECT status, user_id FROM keys WHERE id = 1').get() as { status: string; user_id: number | null };
        expect(keyStatus.status).toBe('available');
        expect(keyStatus.user_id).toBeNull();

        // Verifica histórico
        const historyCount = db.prepare('SELECT count(*) as c FROM history WHERE key_id = 1 AND action = ?').get('return') as { c: number };
        expect(historyCount.c).toBe(1);
    });

    it('deve permitir a transferência (transfer) direta de uma chave emprestada', async () => {
        // 1. Setup: Colocar a chave 1 em 'in_use' pelo aluno 5
        db.prepare("UPDATE keys SET status = 'in_use', user_id = 5 WHERE id = 1").run();

        // 2. Porteiro (ID 3) inicia a transferência para o aluno 4 (test_funcionario)
        currentSession = { id: 3, role: 'PORTEIRO', username: 'test_porteiro' };
        
        const transferReq = new Request('http://localhost/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'transfer', key_id: 1, user_id: 4, observation: 'Passando a chave' }),
            headers: { 'Content-Type': 'application/json' }
        });
        const transferRes = await TransactionPOST(transferReq);
                const transferData = await transferRes.json();
        if (transferRes.status !== 200) console.log("ERROR:", transferData);
        expect(transferRes.status).toBe(200);
        
        // 3. Verifica se a chave continuou em 'in_use' e o user_id mudou para 4
        const keyStatus = db.prepare('SELECT status, user_id FROM keys WHERE id = 1').get() as { status: string; user_id: number | null };
        expect(keyStatus.status).toBe('in_use');
        expect(keyStatus.user_id).toBe(4);

        // Verifica histórico
        const historyCount = db.prepare('SELECT count(*) as c FROM history WHERE key_id = 1 AND action = ?').get('transfer') as { c: number };
        expect(historyCount.c).toBe(1);
    });

    it('deve permitir a transferência (transfer) por usuário comum gerando transação pendente', async () => {
        // 1. Setup: Colocar a chave 1 em 'in_use' pelo aluno 5
        db.prepare("UPDATE keys SET status = 'in_use', user_id = 5 WHERE id = 1").run();

        // 2. Aluno 5 inicia a transferência para o aluno 4
        currentSession = { id: 5, role: 'ALUNO', username: 'test_aluno' };
        
        const transferReq = new Request('http://localhost/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'transfer', key_id: 1, user_id: 4, observation: 'Te passei a chave' }),
            headers: { 'Content-Type': 'application/json' }
        });
        const transferRes = await TransactionPOST(transferReq);
        const transferData = await transferRes.json();
        
        expect(transferRes.status).toBe(200);
        expect(transferData.status).toBe('pending');
        expect(transferData.transactionId).toBeDefined();

        const txId = transferData.transactionId;

        // A chave ainda deve estar com o aluno 5 enquanto aguarda confirmação
        const keyStatus1 = db.prepare('SELECT status, user_id FROM keys WHERE id = 1').get() as { status: string; user_id: number | null };
        expect(keyStatus1.status).toBe('in_use');
        expect(keyStatus1.user_id).toBe(5);

        // 3. Aluno 4 (destinatário) confirma a transferência
        currentSession = { id: 4, role: 'ALUNO', username: 'test_funcionario' };
        
        const confirmReq = new Request(`http://localhost/api/transactions/${txId}/user-confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const params = Promise.resolve({ id: String(txId) });
        const confirmRes = await ConfirmPOST(confirmReq, { params });
        const confirmData = await confirmRes.json();

        expect(confirmRes.status).toBe(200);
        expect(confirmData.status).toBe('completed');

        // 4. Verifica se a chave foi transferida para o aluno 4
        const keyStatus2 = db.prepare('SELECT status, user_id FROM keys WHERE id = 1').get() as { status: string; user_id: number | null };
        expect(keyStatus2.status).toBe('in_use');
        expect(keyStatus2.user_id).toBe(4);

        // Verifica histórico
        const historyCount = db.prepare('SELECT count(*) as c FROM history WHERE key_id = 1 AND action = ?').get('transfer') as { c: number };
        expect(historyCount.c).toBe(1);
    });

    it('deve permitir que o remetente (initiator) veja e cancele uma transferência pendente (TASK-041)', async () => {
        // Setup: Colocar a chave 1 em 'in_use' pelo aluno 5
        db.prepare("UPDATE keys SET status = 'in_use', user_id = 5 WHERE id = 1").run();

        // 1. Aluno 5 inicia a transferência para o aluno 4
        currentSession = { id: 5, role: 'ALUNO', username: 'test_aluno' };
        
        const transferReq = new Request('http://localhost/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'transfer', key_id: 1, user_id: 4, observation: 'Oops errado' }),
            headers: { 'Content-Type': 'application/json' }
        });
        const transferRes = await TransactionPOST(transferReq);
        const transferData = await transferRes.json();
        
        expect(transferRes.status).toBe(200);
        const txId = transferData.transactionId;

        // 2. Aluno 5 verifica as pendências dele
        const pendingReq = new Request('http://localhost/api/transactions/pending', { method: 'GET' });
        const pendingRes = await PendingGET(pendingReq);
        const pendingData = await pendingRes.json();

        // Ele deve conseguir ver a transação que iniciou
        expect(pendingRes.status).toBe(200);
        expect(pendingData.some((t: { id: number }) => t.id === txId)).toBe(true);

        // 3. Aluno 5 cancela a transação
        const cancelReq = new Request(`http://localhost/api/transactions/${txId}/cancel`, { method: 'POST' });
        const params = Promise.resolve({ id: String(txId) });
        const cancelRes = await CancelPOST(cancelReq, { params });
        const cancelData = await cancelRes.json();

        expect(cancelRes.status).toBe(200);
        expect(cancelData.success).toBe(true);

        // Verifica no banco se foi cancelada
        const tx = db.prepare('SELECT status FROM key_transactions WHERE id = ?').get(txId) as { status: string };
        expect(tx.status).toBe('cancelled');
    });
});
