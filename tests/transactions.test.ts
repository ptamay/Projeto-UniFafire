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

    it('não deve permitir que usuário comum inicie devolução de chave que não está com ele', async () => {
        // Setup: chave 1 em uso pelo aluno 5
        db.prepare("UPDATE keys SET status = 'in_use', user_id = 5 WHERE id = 1").run();

        // Funcionário 4 (não portador) tenta iniciar a devolução
        currentSession = { id: 4, role: 'FUNCIONARIO', username: 'test_funcionario' };

        const returnReq = new Request('http://localhost/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'return', key_id: 1, user_id: 4 }),
            headers: { 'Content-Type': 'application/json' }
        });
        const returnRes = await TransactionPOST(returnReq);

        expect(returnRes.status).toBe(403);

        // Nenhuma transação deve ter sido criada
        const txCount = db.prepare('SELECT count(*) as c FROM key_transactions').get() as { c: number };
        expect(txCount.c).toBe(0);
    });

    it('deve permitir que o próprio portador inicie a devolução da sua chave', async () => {
        // Setup: chave 1 em uso pelo aluno 5
        db.prepare("UPDATE keys SET status = 'in_use', user_id = 5 WHERE id = 1").run();

        currentSession = { id: 5, role: 'ALUNO', username: 'test_aluno' };

        const returnReq = new Request('http://localhost/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'return', key_id: 1, user_id: 5 }),
            headers: { 'Content-Type': 'application/json' }
        });
        const returnRes = await TransactionPOST(returnReq);
        const returnData = await returnRes.json();

        expect(returnRes.status).toBe(200);
        expect(returnData.status).toBe('pending');

        // O lado do usuário já nasce confirmado (ele mesmo iniciou); falta a portaria
        const tx = db.prepare('SELECT user_confirmed_at, porteiro_confirmed_at FROM key_transactions WHERE id = ?')
            .get(returnData.transactionId) as { user_confirmed_at: string | null; porteiro_confirmed_at: string | null };
        expect(tx.user_confirmed_at).not.toBeNull();
        expect(tx.porteiro_confirmed_at).toBeNull();
    });

    it('deve permitir que qualquer porteiro cancele uma pendência que não iniciou', async () => {
        // Aluno 5 solicita a retirada da chave 1 (porteiro_id fica null)
        currentSession = { id: 5, role: 'ALUNO', username: 'test_aluno' };
        const withdrawReq = new Request('http://localhost/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'withdraw', key_id: 1, user_id: 5 }),
            headers: { 'Content-Type': 'application/json' }
        });
        const withdrawRes = await TransactionPOST(withdrawReq);
        const withdrawData = await withdrawRes.json();
        expect(withdrawRes.status).toBe(200);
        const txId = withdrawData.transactionId;

        // Porteiro 3 (não iniciou) cancela
        currentSession = { id: 3, role: 'PORTEIRO', username: 'test_porteiro' };
        const cancelReq = new Request(`http://localhost/api/transactions/${txId}/cancel`, { method: 'POST' });
        const params = Promise.resolve({ id: String(txId) });
        const cancelRes = await CancelPOST(cancelReq, { params });

        expect(cancelRes.status).toBe(200);
        const tx = db.prepare('SELECT status FROM key_transactions WHERE id = ?').get(txId) as { status: string };
        expect(tx.status).toBe('cancelled');
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
        const pendingRes = await PendingGET();
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

// REQ-027 (ADR-008) — Solicitação de chave em uso ao portador (fluxo "pull").
// Usuários: test_porteiro(3), test_funcionario(4=B), test_aluno(5=A), test_aluno2(6=C).
describe('Solicitação de Chave em Uso — fluxo pull (REQ-027)', () => {
    beforeEach(() => {
        db.prepare('DELETE FROM key_transactions').run();
        db.prepare('DELETE FROM history').run();
        db.prepare("UPDATE keys SET status = 'available', user_id = NULL").run();
        // Chave 1 em uso pelo aluno A (id 5)
        db.prepare("UPDATE keys SET status = 'in_use', user_id = 5 WHERE id = 1").run();
    });

    async function requestPull(requesterId: number, keyId = 1) {
        const req = new Request('http://localhost/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'transfer', key_id: keyId, user_id: requesterId }),
            headers: { 'Content-Type': 'application/json' }
        });
        const res = await TransactionPOST(req);
        return { res, data: await res.json() };
    }

    it('cria a solicitação pull com solicitante já confirmado e portador pendente', async () => {
        currentSession = { id: 4, role: 'FUNCIONARIO', username: 'test_funcionario' };
        const { res, data } = await requestPull(4);

        expect(res.status).toBe(200);
        expect(data.status).toBe('pending');

        const tx = db.prepare('SELECT user_id, porteiro_id, user_confirmed_at, porteiro_confirmed_at, action FROM key_transactions WHERE id = ?')
            .get(data.transactionId) as { user_id: number; porteiro_id: number; user_confirmed_at: string | null; porteiro_confirmed_at: string | null; action: string };
        expect(tx.action).toBe('transfer');
        expect(tx.user_id).toBe(4);        // solicitante (destino)
        expect(tx.porteiro_id).toBe(5);    // portador atual (contraparte)
        expect(tx.user_confirmed_at).not.toBeNull();
        expect(tx.porteiro_confirmed_at).toBeNull();

        // A chave permanece com A (id 5) até o aceite
        const key = db.prepare('SELECT status, user_id FROM keys WHERE id = 1').get() as { status: string; user_id: number };
        expect(key.status).toBe('in_use');
        expect(key.user_id).toBe(5);
    });

    it('completa a troca de posse quando o portador aceita', async () => {
        currentSession = { id: 4, role: 'FUNCIONARIO', username: 'test_funcionario' };
        const { data } = await requestPull(4);
        const txId = data.transactionId;

        // Portador A (id 5) aceita via user-confirm
        currentSession = { id: 5, role: 'ALUNO', username: 'test_aluno' };
        const confirmReq = new Request(`http://localhost/api/transactions/${txId}/user-confirm`, { method: 'POST' });
        const confirmRes = await ConfirmPOST(confirmReq, { params: Promise.resolve({ id: String(txId) }) });
        const confirmData = await confirmRes.json();

        expect(confirmRes.status).toBe(200);
        expect(confirmData.status).toBe('completed');

        const key = db.prepare('SELECT status, user_id FROM keys WHERE id = 1').get() as { status: string; user_id: number };
        expect(key.status).toBe('in_use');
        expect(key.user_id).toBe(4);   // chave agora com o solicitante B

        const hist = db.prepare("SELECT count(*) as c FROM history WHERE key_id = 1 AND action = 'transfer'").get() as { c: number };
        expect(hist.c).toBe(1);
    });

    it('rejeita (403) o aceite por terceiro não envolvido — autorização estrita', async () => {
        currentSession = { id: 4, role: 'FUNCIONARIO', username: 'test_funcionario' };
        const { data } = await requestPull(4);
        const txId = data.transactionId;

        // Terceiro comum C (id 6), que não é o solicitante nem o portador
        currentSession = { id: 6, role: 'ALUNO', username: 'test_aluno2' };
        const confirmReq = new Request(`http://localhost/api/transactions/${txId}/user-confirm`, { method: 'POST' });
        const confirmRes = await ConfirmPOST(confirmReq, { params: Promise.resolve({ id: String(txId) }) });

        expect(confirmRes.status).toBe(403);
        const tx = db.prepare('SELECT status FROM key_transactions WHERE id = ?').get(txId) as { status: string };
        expect(tx.status).toBe('pending');
    });

    it('não deixa um porteiro forçar o aceite no lugar do portador (ADR-008 estrito)', async () => {
        currentSession = { id: 4, role: 'FUNCIONARIO', username: 'test_funcionario' };
        const { data } = await requestPull(4);
        const txId = data.transactionId;

        // Porteiro (staff) tenta aceitar a solicitação pull no lugar do portador comum
        currentSession = { id: 3, role: 'PORTEIRO', username: 'test_porteiro' };
        const confirmReq = new Request(`http://localhost/api/transactions/${txId}/user-confirm`, { method: 'POST' });
        const confirmRes = await ConfirmPOST(confirmReq, { params: Promise.resolve({ id: String(txId) }) });

        expect(confirmRes.status).toBe(403);
        const key = db.prepare('SELECT user_id FROM keys WHERE id = 1').get() as { user_id: number };
        expect(key.user_id).toBe(5);   // chave não mudou de mãos
    });

    it('permite ao portador recusar cancelando a solicitação', async () => {
        currentSession = { id: 4, role: 'FUNCIONARIO', username: 'test_funcionario' };
        const { data } = await requestPull(4);
        const txId = data.transactionId;

        // Portador A (id 5) recusa = cancela
        currentSession = { id: 5, role: 'ALUNO', username: 'test_aluno' };
        const cancelReq = new Request(`http://localhost/api/transactions/${txId}/cancel`, { method: 'POST' });
        const cancelRes = await CancelPOST(cancelReq, { params: Promise.resolve({ id: String(txId) }) });

        expect(cancelRes.status).toBe(200);
        const tx = db.prepare('SELECT status FROM key_transactions WHERE id = ?').get(txId) as { status: string };
        expect(tx.status).toBe('cancelled');
        const key = db.prepare('SELECT status, user_id FROM keys WHERE id = 1').get() as { status: string; user_id: number };
        expect(key.status).toBe('in_use');
        expect(key.user_id).toBe(5);
    });

    it('bloqueia uma segunda solicitação enquanto há pendência na chave', async () => {
        currentSession = { id: 4, role: 'FUNCIONARIO', username: 'test_funcionario' };
        await requestPull(4);

        // Outro usuário comum C (id 6) tenta solicitar a mesma chave
        currentSession = { id: 6, role: 'ALUNO', username: 'test_aluno2' };
        const { res } = await requestPull(6);

        expect(res.status).toBe(400);
        const count = db.prepare('SELECT count(*) as c FROM key_transactions').get() as { c: number };
        expect(count.c).toBe(1);
    });

    it('rejeita (403) solicitação cujo destino não é o próprio solicitante', async () => {
        // B (id 4) tenta solicitar a chave para um terceiro (id 6) em vez de para si
        currentSession = { id: 4, role: 'FUNCIONARIO', username: 'test_funcionario' };
        const req = new Request('http://localhost/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'transfer', key_id: 1, user_id: 6 }),
            headers: { 'Content-Type': 'application/json' }
        });
        const res = await TransactionPOST(req);

        expect(res.status).toBe(403);
        const count = db.prepare('SELECT count(*) as c FROM key_transactions').get() as { c: number };
        expect(count.c).toBe(0);
    });
});
