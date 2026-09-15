'use client';
import { useState, useEffect } from 'react';
import { useAtualizacaoDeChaves } from '@/lib/realtime-sinal';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { Pendencia } from '@/lib/pendencias';
import { SEM_CONEXAO, naoDeuPara } from '@/lib/mensagens';

// TASK-131: o mesmo tipo da consulta que a rota e a página usam (`src/lib/pendencias.ts`).
type PendingTransaction = Pendencia;

interface Props {
    userRole: string;
    userId: number;
    /** TASK-131: as pendências vêm do servidor — a tela abre com elas, sem cartões cinzas. */
    pendenciasIniciais: Pendencia[];
}

// Ícones do vocabulário SVG do app (stroke) — substituem os glifos unicode
// ✓/✕/⏳ que destoavam do resto da interface nos botões mais críticos.
const IconCheck = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
);
const IconX = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
export default function ConfirmClient({ userRole, userId, pendenciasIniciais }: Props) {
    const router = useRouter();
    const [pendingTxs, setPendingTxs] = useState<PendingTransaction[]>(pendenciasIniciais);
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    const fetchPending = async () => {
        const res = await fetch('/api/transactions/pending');
        if (res.ok) setPendingTxs(await res.json());
    };

    useEffect(() => {
        // TASK-131: sem busca na montagem — a lista chegou pelo servidor, fresca, junto com a
        // tela. Buscar de novo aqui só custaria uma ida à rota a cada visita.
        // Poll no mesmo ritmo do Dashboard e reage na hora a qualquer ação local
        // (retirada/devolução/confirmação/cancelamento) — fluxo de balcão sem F5.
        const handleUpdate = () => fetchPending();
        window.addEventListener('pending-transactions-updated', handleUpdate);
        // TASK-072: o polling de 3 s saiu. O que atualiza esta tela quando a
        // mudanca vem de OUTRO dispositivo e o sinal do banco (`useSinalDeMudanca`,
        // abaixo). O listener de evento continua: ele cobre a acao feita NESTA
        // aba, que nao precisa esperar viagem nenhuma.
        return () => {
            window.removeEventListener('pending-transactions-updated', handleUpdate);
        };
    }, []);

    useAtualizacaoDeChaves(fetchPending);

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
                toast.error(data.error || naoDeuPara('confirmar'));
            }
        } catch {
            toast.error(SEM_CONEXAO);
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
                toast.error(naoDeuPara('cancelar'));
            }
        } catch { toast.error(SEM_CONEXAO); }
        finally { setActionLoading(null); }
    };

    const isPorteiroOrAdmin = ['ADMIN', 'GESTOR', 'PORTEIRO'].includes(userRole);
    const displayTxs = isPorteiroOrAdmin ? pendingTxs : pendingTxs.filter(tx => tx.user_id === userId || tx.porteiro_id === userId);

    return (
        <>
            <main className="main-content animate-fade tela-confirmacoes">
                {/* ── HEADER ── */}
                <header className="page-header cabecalho-enxuto">
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

                {/* ── CONTEÚDO ──
                    TASK-137 (emenda do ADR-031): cada pendência é uma LINHA da lista — chave e tipo,
                    sala, quem e quando, o estado — com o verbo ("Confirmar", "Aceitar") e "Cancelar"
                    discreto embaixo. Antes eram cartões grandes, com um ícone redondo e uma caixa de
                    contexto dentro do cartão. Uma lista só, para celular e desktop. */}
                {displayTxs.length === 0 ? (
                    <div className="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 1rem', opacity: 0.3 }} aria-hidden="true">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        <p>Nenhuma confirmação pendente no momento.</p>
                    </div>
                ) : (
                    <ul className="lista-linhas" aria-label="Confirmações pendentes">
                        {displayTxs.map(tx => {
                            const isWithdraw = tx.action === 'withdraw';
                            const isTransfer = tx.action === 'transfer';
                            // Numa transferência pendente, se o lado do portador ainda não confirmou,
                            // é uma solicitação (pull, REQ-027): quem tem a chave é que precisa aceitar.
                            const isPull = isTransfer && !tx.porteiro_confirmed_at;
                            const isHolderViewer = tx.porteiro_id === userId;
                            const hora = new Date(tx.initiated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                            const pessoa = tx.user_full_name || tx.user_username;
                            // Idioma único ação→cor, o mesmo do Histórico: retirada âmbar ·
                            // transferência roxa · devolução verde.
                            const tipo = isWithdraw ? 'status-withdraw' : isTransfer ? 'status-transfer' : 'status-return';
                            const rotulo = isWithdraw ? 'Retirada' : isPull ? 'Pedido' : isTransfer ? 'Transferência' : 'Devolução';
                            const podeConfirmarComoUsuario = tx.user_id === userId && !tx.user_confirmed_at;
                            // Porteiro/Admin: o usuário JÁ confirmou e falta o porteiro — exceto em solicitação pull,
                            // cujo aceite é estrito do portador (ADR-008), nunca da portaria por papel.
                            const podeConfirmarComoPorteiro = isPorteiroOrAdmin && !isPull && !!tx.user_confirmed_at && !tx.porteiro_confirmed_at;
                            const podeAceitar = isPull && isHolderViewer;
                            const aguardandoOutraParte = !isPorteiroOrAdmin && tx.user_id === userId && !!tx.user_confirmed_at && !tx.porteiro_confirmed_at;
                            const podeCancelar = isPorteiroOrAdmin || tx.user_id === userId || tx.porteiro_id === userId;

                            return (
                                <li key={tx.id} className="linha-lista linha-lista--acoes-embaixo">
                                    <div className="linha-texto">
                                        <div className="linha-topo">
                                            <div className="linha-nome">{tx.key_name}</div>
                                            <span className={`status-tag ${tipo}`}>{rotulo}</span>
                                        </div>
                                        {tx.key_room && <div className="linha-apoio">{tx.key_room}</div>}
                                        <div className="linha-apoio">
                                            {isPull ? (
                                                <>
                                                    <strong>{pessoa}</strong> solicitou esta chave às {hora}.
                                                    {isHolderViewer
                                                        ? <> Está com você — aceite para passá-la.</>
                                                        : tx.porteiro_username && <> Falta <strong>@{tx.porteiro_username}</strong> aceitar.</>}
                                                </>
                                            ) : isTransfer ? (
                                                <>
                                                    Para <strong>{pessoa}</strong>
                                                    {tx.porteiro_username && <>, iniciada por <strong>@{tx.porteiro_username}</strong></>} às {hora}.
                                                </>
                                            ) : (
                                                tx.porteiro_username
                                                    ? <><strong>{pessoa}</strong> · o porteiro <strong>@{tx.porteiro_username}</strong> iniciou às {hora}.</>
                                                    : isPorteiroOrAdmin
                                                        ? <><strong>{pessoa}</strong> pediu às {hora}.</>
                                                        : <>Você pediu às {hora}.</>
                                            )}
                                        </div>
                                        {/* Esperar não é alarme: âmbar (pendente), não vermelho. */}
                                        {isPorteiroOrAdmin && (
                                            !tx.user_confirmed_at
                                                ? <div className="linha-estado is-pendente">Aguardando o usuário confirmar</div>
                                                : <div className="linha-estado is-livre">Usuário confirmou</div>
                                        )}
                                        {aguardandoOutraParte && (
                                            <div className="linha-estado is-pendente">Aguardando {isPull ? 'o portador' : 'porteiro'}</div>
                                        )}
                                    </div>
                                    {(podeConfirmarComoUsuario || podeConfirmarComoPorteiro || podeAceitar || podeCancelar) && (
                                        <div className="linha-acoes">
                                            {(podeConfirmarComoUsuario || podeConfirmarComoPorteiro) && (
                                                <button
                                                    className="btn btn-secundario btn-sm"
                                                    onClick={() => confirmTransaction(tx.id)}
                                                    disabled={actionLoading === tx.id}
                                                >
                                                    {actionLoading === tx.id ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <><IconCheck /> Confirmar</>}
                                                </button>
                                            )}
                                            {/* Portador aceita uma solicitação pull da chave que está com ele (REQ-027) */}
                                            {podeAceitar && (
                                                <button
                                                    className="btn btn-secundario btn-sm"
                                                    onClick={() => confirmTransaction(tx.id)}
                                                    disabled={actionLoading === tx.id}
                                                >
                                                    {actionLoading === tx.id ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <><IconCheck /> Aceitar</>}
                                                </button>
                                            )}
                                            {podeCancelar && (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => cancelTransaction(tx.id)}
                                                    disabled={actionLoading === tx.id}
                                                >
                                                    <IconX /> Cancelar
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </main>
        </>
    );
}
