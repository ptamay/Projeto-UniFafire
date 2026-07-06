'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';

interface PendingTransaction {
    id: number;
    key_id: number;
    user_id: number;
    action: 'withdraw' | 'return' | 'transfer';
    status: 'pending' | 'porteiro_confirmed';
    key_name: string;
    key_room: string;
    user_username: string;
    user_full_name: string;
    porteiro_username?: string;
    initiated_at: string;
    user_confirmed_at?: string;
    porteiro_confirmed_at?: string;
}

interface Props {
    userRole: string;
    username: string;
    userId: number;
}

export default function ConfirmClient({ userRole, username, userId }: Props) {
    const router = useRouter();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [pendingTxs, setPendingTxs] = useState<PendingTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    const fetchPending = async () => {
        try {
            const res = await fetch('/api/transactions/pending');
            if (res.ok) {
                const data = await res.json();
                setPendingTxs(data);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPending();
        // Poll no mesmo ritmo do Dashboard e reage na hora a qualquer ação local
        // (retirada/devolução/confirmação/cancelamento) — fluxo de balcão sem F5.
        const handleUpdate = () => fetchPending();
        window.addEventListener('pending-transactions-updated', handleUpdate);
        const interval = setInterval(fetchPending, 3000);
        return () => {
            window.removeEventListener('pending-transactions-updated', handleUpdate);
            clearInterval(interval);
        };
    }, []);

    const confirmTransaction = async (txId: number) => {
        setActionLoading(txId);
        try {
            const res = await fetch(`/api/transactions/${txId}/user-confirm`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || 'Confirmado com sucesso!');
                fetchPending();
                window.dispatchEvent(new CustomEvent('pending-transactions-updated'));
                router.refresh(); // Força a revalidação do cache para atualizar o Dashboard
            } else {
                toast.error(data.error || 'Erro ao confirmar.');
            }
        } catch {
            toast.error('Erro de conexão.');
        } finally {
            setActionLoading(null);
        }
    };

    const cancelTransaction = async (txId: number) => {
        setActionLoading(txId);
        try {
            const res = await fetch(`/api/transactions/${txId}/cancel`, { method: 'POST' });
            if (res.ok) {
                toast.success('Transação cancelada.');
                fetchPending();
                window.dispatchEvent(new CustomEvent('pending-transactions-updated'));
                router.refresh(); // Força a revalidação do cache para atualizar o Dashboard
            } else {
                toast.error('Falha ao cancelar.');
            }
        } catch { toast.error('Erro de conexão.'); }
        finally { setActionLoading(null); }
    };

    const isPorteiroOrAdmin = ['ADMIN', 'GESTOR', 'PORTEIRO'].includes(userRole);
    const displayTxs = isPorteiroOrAdmin ? pendingTxs : pendingTxs.filter(tx => tx.user_id === userId);

    return (
        <div className="page-wrapper">
            <Sidebar userRole={userRole} username={username} isOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

            <main className="main-content animate-fade">
                {/* ── HEADER ── */}
                <header className="page-header">
                    <div>
                        <h1 className="page-title">
                            {isPorteiroOrAdmin ? 'Central de Confirmações' : 'Minhas Confirmações'}
                        </h1>
                        <p className="page-subtitle">
                            {isPorteiroOrAdmin
                                ? 'Valide as movimentações de chaves do sistema.'
                                : 'Confirme as chaves que você está retirando ou devolvendo.'}
                        </p>
                    </div>
                </header>

                {/* ── CONTEÚDO ── */}
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : displayTxs.length === 0 ? (
                    <div className="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 1rem', opacity: 0.3 }}>
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <p>Nenhuma confirmação pendente no momento.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
                        {displayTxs.map(tx => {
                            const isWithdraw = tx.action === 'withdraw';
                            const isTransfer = tx.action === 'transfer';
                            const accentColor = isWithdraw ? '#b45309' : isTransfer ? '#7e22ce' : '#1d8046';
                            const accentBg = isWithdraw ? 'rgba(180,83,9,0.08)' : isTransfer ? 'rgba(126,34,206,0.08)' : 'rgba(29,128,70,0.08)';

                            return (
                                <div key={tx.id} style={{
                                    background: 'var(--bg-card)',
                                    border: `1px solid var(--border)`,
                                    borderTop: `3px solid ${accentColor}`,
                                    borderRadius: 'var(--radius-lg)',
                                    padding: '1.25rem',
                                    boxShadow: 'var(--shadow-sm)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem',
                                }}>
                                    {/* Tipo + Chave */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <span style={{
                                                fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase',
                                                letterSpacing: '0.05em', color: accentColor,
                                                background: accentBg, padding: '2px 8px', borderRadius: '99px', display: 'inline-block', marginBottom: '0.4rem'
                                            }}>
                                                {isWithdraw ? 'Retirada de Chave' : isTransfer ? 'Transferência de Chave' : 'Devolução de Chave'}
                                            </span>
                                            <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>{tx.key_name}</div>
                                            {tx.key_room && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{tx.key_room}</div>}
                                        </div>
                                        <div style={{
                                            width: 40, height: 40, borderRadius: '50%',
                                            background: accentBg, color: accentColor,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                        }}>
                                            {isWithdraw
                                                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                                                : isTransfer
                                                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3l4 4-4 4 M3 17l4 4 4-4 M21 7H3 M3 17h18"/></svg>
                                                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20m-5-5l5 5 5-5"/></svg>}
                                        </div>
                                    </div>

                                    {/* Contexto */}
                                    <div style={{ background: 'var(--bg-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                        {isTransfer ? (
                                            <>
                                                Transferência para <strong style={{ color: 'var(--text-primary)' }}>{tx.user_full_name || tx.user_username}</strong><br/>
                                                {tx.porteiro_username && (
                                                    <>Iniciada por <strong>@{tx.porteiro_username}</strong> às {new Date(tx.initiated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <strong style={{ color: 'var(--text-primary)' }}>{tx.user_full_name || tx.user_username}</strong><br/>
                                                {tx.porteiro_username
                                                    ? <>Iniciado pelo porteiro <strong>@{tx.porteiro_username}</strong> às {new Date(tx.initiated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</>
                                                    : <>Iniciado por {isPorteiroOrAdmin ? 'usuário' : 'você'} às {new Date(tx.initiated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</>}
                                            </>
                                        )}
                                    </div>

                                    {/* Status Administrativo */}
                                    {isPorteiroOrAdmin && (
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '-0.5rem' }}>
                                            {!tx.user_confirmed_at
                                                ? <span style={{ color: '#ef4444' }}>● Aguardando o usuário confirmar</span>
                                                : <span style={{ color: '#10b981' }}>● Usuário confirmou</span>}
                                        </div>
                                    )}

                                    {/* Ações */}
                                    <div style={{ marginTop: 'auto' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {/* Se o usuário destino for o próprio usuário logado e ainda não confirmou como usuário */}
                                            {tx.user_id === userId && !tx.user_confirmed_at && (
                                                <button
                                                    className="btn btn-green"
                                                    style={{ flex: 1, minWidth: '120px', minHeight: 44, fontSize: '0.9rem', fontWeight: 700 }}
                                                    onClick={() => confirmTransaction(tx.id)}
                                                    disabled={actionLoading === tx.id}
                                                >
                                                    {actionLoading === tx.id ? <div className="spinner" style={{ width: 16, height: 16 }} /> : '✓ Confirmar'}
                                                </button>
                                            )}

                                            {/* Se for Porteiro/Admin, o usuário JÁ confirmou, mas o porteiro AINDA NÃO */}
                                            {isPorteiroOrAdmin && tx.user_confirmed_at && !tx.porteiro_confirmed_at && (
                                                <button
                                                    className="btn btn-green"
                                                    style={{ flex: 1, minWidth: '120px', minHeight: 44, fontSize: '0.9rem', fontWeight: 700 }}
                                                    onClick={() => confirmTransaction(tx.id)}
                                                    disabled={actionLoading === tx.id}
                                                >
                                                    {actionLoading === tx.id ? <div className="spinner" style={{ width: 16, height: 16 }} /> : '✓ Confirmar'}
                                                </button>
                                            )}

                                            {/* Mensagem de aguardando porteiro para usuários comuns */}
                                            {!isPorteiroOrAdmin && tx.user_id === userId && tx.user_confirmed_at && !tx.porteiro_confirmed_at && (
                                                <div style={{ textAlign: 'center', padding: '0.75rem', background: 'rgba(217,119,6,0.08)', color: '#d97706', fontWeight: 700, borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', border: '1px solid rgba(217,119,6,0.2)', flex: 1 }}>
                                                    ⏳ Aguardando porteiro
                                                </div>
                                            )}

                                            {/* Cancelar Transação */}
                                            {(isPorteiroOrAdmin || tx.user_id === userId) && (
                                                <button
                                                    className="btn btn-ghost"
                                                    style={{ flex: '0 1 auto', minWidth: '100px', minHeight: 44, fontSize: '0.9rem', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                                                    onClick={() => cancelTransaction(tx.id)}
                                                    disabled={actionLoading === tx.id}
                                                >
                                                    ✕ Cancelar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
