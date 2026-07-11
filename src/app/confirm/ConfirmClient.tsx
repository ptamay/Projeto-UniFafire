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
    porteiro_id?: number;
    initiated_at: string;
    user_confirmed_at?: string;
    porteiro_confirmed_at?: string;
}

interface Props {
    userRole: string;
    username: string;
    userId: number;
}

// Ícones do vocabulário SVG do app (stroke) — substituem os glifos unicode
// ✓/✕/⏳ que destoavam do resto da interface nos botões mais críticos.
const IconCheck = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
);
const IconX = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const IconClock = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);

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
    const displayTxs = isPorteiroOrAdmin ? pendingTxs : pendingTxs.filter(tx => tx.user_id === userId || tx.porteiro_id === userId);

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
                    // Skeleton com a MESMA anatomia dos cards reais (badge, título,
                    // contexto, ações) — o conteúdo chega sem salto de layout,
                    // no lugar do spinner central (registro de produto).
                    <div aria-hidden="true" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                                        <div className="skeleton" style={{ width: 120, height: 18, borderRadius: 'var(--radius-full)' }} />
                                        <div className="skeleton" style={{ width: '60%', height: 22 }} />
                                        <div className="skeleton" style={{ width: '35%', height: 14 }} />
                                    </div>
                                    <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
                                </div>
                                <div className="skeleton" style={{ width: '100%', height: 64 }} />
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <div className="skeleton" style={{ flex: 1, height: 44 }} />
                                    <div className="skeleton" style={{ width: 100, height: 44 }} />
                                </div>
                            </div>
                        ))}
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
                            // Numa transferência pendente, se o lado do portador ainda não confirmou,
                            // é uma solicitação (pull, REQ-027): quem tem a chave é que precisa aceitar.
                            const isPull = isTransfer && !tx.porteiro_confirmed_at;
                            const isHolderViewer = tx.porteiro_id === userId;
                            // Idioma único ação→cor (tokens com par dark/light):
                            // retirada = âmbar · transferência = roxo · devolução = verde.
                            const accentColor = isWithdraw ? 'var(--action-withdraw-fg)' : isTransfer ? 'var(--action-transfer-fg)' : 'var(--action-return-fg)';
                            const accentBg = isWithdraw ? 'var(--action-withdraw-bg)' : isTransfer ? 'var(--action-transfer-bg)' : 'var(--action-return-bg)';

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
                                                background: accentBg, padding: '2px 8px', borderRadius: 'var(--radius-full)', display: 'inline-block', marginBottom: '0.4rem'
                                            }}>
                                                {isWithdraw ? 'Retirada de Chave' : isPull ? 'Solicitação de Chave' : isTransfer ? 'Transferência de Chave' : 'Devolução de Chave'}
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
                                        {isPull ? (
                                            <>
                                                <strong style={{ color: 'var(--text-primary)' }}>{tx.user_full_name || tx.user_username}</strong> solicitou esta chave.<br/>
                                                {isHolderViewer
                                                    ? <>Está com você — aceite para repassá-la. Pedido às {new Date(tx.initiated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</>
                                                    : tx.porteiro_username && <>Aguardando <strong>@{tx.porteiro_username}</strong> aceitar. Pedido às {new Date(tx.initiated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</>}
                                            </>
                                        ) : isTransfer ? (
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
                                                ? <span style={{ color: 'var(--danger-text)' }}>● Aguardando o usuário confirmar</span>
                                                : <span style={{ color: 'var(--status-available-text)' }}>● Usuário confirmou</span>}
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
                                                    {actionLoading === tx.id ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <><IconCheck /> Confirmar</>}
                                                </button>
                                            )}

                                            {/* Porteiro/Admin: o usuário JÁ confirmou e falta o porteiro — exceto em solicitação pull,
                                                cujo aceite é estrito do portador (ADR-008), nunca da portaria por papel. */}
                                            {isPorteiroOrAdmin && !isPull && tx.user_confirmed_at && !tx.porteiro_confirmed_at && (
                                                <button
                                                    className="btn btn-green"
                                                    style={{ flex: 1, minWidth: '120px', minHeight: 44, fontSize: '0.9rem', fontWeight: 700 }}
                                                    onClick={() => confirmTransaction(tx.id)}
                                                    disabled={actionLoading === tx.id}
                                                >
                                                    {actionLoading === tx.id ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <><IconCheck /> Confirmar</>}
                                                </button>
                                            )}

                                            {/* Portador aceita uma solicitação pull da chave que está com ele (REQ-027) */}
                                            {isPull && isHolderViewer && (
                                                <button
                                                    className="btn btn-green"
                                                    style={{ flex: 1, minWidth: '120px', minHeight: 44, fontSize: '0.9rem', fontWeight: 700 }}
                                                    onClick={() => confirmTransaction(tx.id)}
                                                    disabled={actionLoading === tx.id}
                                                >
                                                    {actionLoading === tx.id ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <><IconCheck /> Aceitar</>}
                                                </button>
                                            )}

                                            {/* Mensagem de espera para quem iniciou e aguarda a outra parte */}
                                            {!isPorteiroOrAdmin && tx.user_id === userId && tx.user_confirmed_at && !tx.porteiro_confirmed_at && (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.75rem', background: 'var(--warning-bg)', color: 'var(--warning-text)', fontWeight: 700, borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', border: '1px solid color-mix(in srgb, currentColor 30%, transparent)', flex: 1 }}>
                                                    <IconClock /> Aguardando {isPull ? 'o portador' : 'porteiro'}
                                                </div>
                                            )}

                                            {/* Cancelar Transação */}
                                            {(isPorteiroOrAdmin || tx.user_id === userId || tx.porteiro_id === userId) && (
                                                <button
                                                    className="btn btn-ghost"
                                                    style={{ flex: '0 1 auto', minWidth: '100px', minHeight: 44, fontSize: '0.9rem', color: 'var(--danger-text)', border: '1px solid var(--danger-bg)' }}
                                                    onClick={() => cancelTransaction(tx.id)}
                                                    disabled={actionLoading === tx.id}
                                                >
                                                    <IconX /> Cancelar
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
