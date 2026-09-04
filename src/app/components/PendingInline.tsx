'use client';
import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

// TASK-049 (REQ-029b, ADR-010) — painel compacto de pendências no Dashboard:
// ver e confirmar/aceitar/cancelar sem navegar a /confirm. Reutiliza os
// endpoints existentes (pending / user-confirm / cancel) — nenhuma lógica de
// negócio nova; /confirm permanece como visão completa.

interface PendingTransaction {
    id: number;
    user_id: number;
    action: 'withdraw' | 'return' | 'transfer';
    key_name: string;
    key_room?: string;
    user_full_name?: string;
    user_username?: string;
    porteiro_id?: number | null;
    user_confirmed_at?: string | null;
    porteiro_confirmed_at?: string | null;
}

interface Props {
    userRole: string;
    userId: number;
}

const ACTION_META: Record<string, { label: string; tagClass: string }> = {
    withdraw: { label: 'Retirada', tagClass: 'status-withdraw' },
    return: { label: 'Devolução', tagClass: 'status-return' },
    transfer: { label: 'Transferência', tagClass: 'status-transfer' },
};

export default function PendingInline({ userRole, userId }: Props) {
    const [pendingTxs, setPendingTxs] = useState<PendingTransaction[]>([]);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const isPorteiroOrAdmin = ['ADMIN', 'GESTOR', 'PORTEIRO'].includes(userRole);

    const fetchPending = useCallback(async () => {
        try {
            const res = await fetch('/api/transactions/pending');
            if (res.ok) setPendingTxs(await res.json());
        } catch { /* silencioso — o painel apenas não atualiza neste tick */ }
    }, []);

    useEffect(() => {
        fetchPending();
        const handleUpdate = () => fetchPending();
        window.addEventListener('pending-transactions-updated', handleUpdate);
        const interval = setInterval(fetchPending, 3000);
        return () => {
            window.removeEventListener('pending-transactions-updated', handleUpdate);
            clearInterval(interval);
        };
    }, [fetchPending]);

    const act = async (txId: number, endpoint: 'user-confirm' | 'cancel', successMsg: string) => {
        setActionLoading(txId);
        try {
            const res = await fetch(`/api/transactions/${txId}/${endpoint}`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                toast.success(data.message || successMsg);
                fetchPending();
                window.dispatchEvent(new CustomEvent('pending-transactions-updated'));
            } else {
                toast.error(data.error || 'Erro na operação.');
            }
        } catch {
            toast.error('Erro de conexão.');
        } finally {
            setActionLoading(null);
        }
    };

    const displayTxs = isPorteiroOrAdmin
        ? pendingTxs
        : pendingTxs.filter(tx => tx.user_id === userId || tx.porteiro_id === userId);

    // BDD: sem pendências, sem painel — não ocupa espaço.
    if (displayTxs.length === 0) return null;

    return (
        <section className="pending-inline" aria-label="Confirmações pendentes">
            <div className="pending-inline-title">
                Confirmações pendentes
                <span className="pending-inline-count">{displayTxs.length}</span>
            </div>
            {displayTxs.map(tx => {
                // Mesmas regras do /confirm: pull = transferência cujo portador ainda não aceitou.
                const isPull = tx.action === 'transfer' && !tx.porteiro_confirmed_at;
                const canUserConfirm = tx.user_id === userId && !tx.user_confirmed_at;
                const canPorteiroConfirm = isPorteiroOrAdmin && !isPull && !!tx.user_confirmed_at && !tx.porteiro_confirmed_at;
                const canHolderAccept = isPull && tx.porteiro_id === userId;
                const canConfirm = canUserConfirm || canPorteiroConfirm || canHolderAccept;
                const canCancel = isPorteiroOrAdmin || tx.user_id === userId || tx.porteiro_id === userId;
                const meta = ACTION_META[tx.action] ?? ACTION_META.withdraw;
                const who = tx.user_full_name || tx.user_username || 'Usuário';
                const statusText = canUserConfirm
                    ? 'Confirme para concluir'
                    : canHolderAccept
                        ? `${who} solicitou — aceite para repassar`
                        : !tx.user_confirmed_at
                            ? `Aguardando ${who} confirmar`
                            : isPull
                                ? 'Aguardando o portador aceitar'
                                : 'Aguardando a portaria confirmar';

                return (
                    <div key={tx.id} className="pending-inline-item">
                        <span className={`status-tag ${meta.tagClass}`}>{meta.label}</span>
                        <div className="pending-inline-info">
                            <span className="pending-inline-key">{tx.key_name}</span>
                            <span className="pending-inline-status">{statusText}</span>
                        </div>
                        <div className="pending-inline-actions">
                            {canConfirm && (
                                <button
                                    className="btn btn-green btn-sm"
                                    disabled={actionLoading === tx.id}
                                    onClick={() => act(tx.id, 'user-confirm', 'Confirmado com sucesso!')}
                                >
                                    {actionLoading === tx.id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : (canHolderAccept ? 'Aceitar' : 'Confirmar')}
                                </button>
                            )}
                            {canCancel && (
                                <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: 'var(--danger-text)', border: '1px solid var(--danger-bg)' }}
                                    disabled={actionLoading === tx.id}
                                    onClick={() => act(tx.id, 'cancel', 'Solicitação cancelada.')}
                                >
                                    Cancelar
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </section>
    );
}
