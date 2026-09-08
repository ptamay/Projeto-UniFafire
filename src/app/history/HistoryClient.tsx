'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import PrintButton from '../components/PrintButton';
import Sidebar from '../components/Sidebar';
import { formatTimestamp } from '@/lib/time-filters';
import { HISTORY_ACTIONS } from '@/lib/history-query';
import { useClientClock } from '@/lib/use-client-clock';

interface BusinessMetrics {
    totalTransactions: number;
    doubleConfirmationRate: number | null;
    medianCounterMinutes: number | null;
}

export interface HistoryItem {
    id: number;
    action: string;
    timestamp: string;
    key_name: string;
    room: string;
    employee_name: string;
    confirmed_by?: string;
    justification?: string;
}

export interface HistoryFilterOptions {
    users: { id: number; name: string }[];
    keys: { id: number; name: string; room: string | null }[];
}

interface HistoryClientProps {
    history: HistoryItem[];
    userRole: string;
    username: string;
    currentPage?: number;
    totalPages?: number;
    totalRecords?: number;
    filterOptions?: HistoryFilterOptions;
    initialFilters?: {
        date?: string;
        month?: string;
        hour?: string;
        userId?: string;
        keyId?: string;
        action?: string;
    };
}

export default function HistoryClient({
    history, userRole, username, initialFilters,
    currentPage = 1, totalPages = 1, totalRecords = 0,
    filterOptions = { users: [], keys: [] },
}: HistoryClientProps) {
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // TASK-058: vazio no servidor e na hidratação, preenchido depois. Renderizar
    // o relógio direto no JSX fazia SSR e cliente caírem em segundos diferentes,
    // e o React descartava a árvore vinda do servidor.
    const agora = useClientClock();
    const geradoEm = agora === null ? '' : formatTimestamp(new Date(agora).toISOString());
    const router = useRouter();

    // Initialize filters from props
    const [dateFilter, setDateFilter] = useState(initialFilters?.date || '');
    const [monthFilter, setMonthFilter] = useState(initialFilters?.month || '');
    const [hourFilter, setHourFilter] = useState(initialFilters?.hour || '');
    const [userFilter, setUserFilter] = useState(initialFilters?.userId || '');
    const [keyFilter, setKeyFilter] = useState(initialFilters?.keyId || '');
    const [actionFilter, setActionFilter] = useState(initialFilters?.action || '');

    const hasActiveFilter = Boolean(
        dateFilter || monthFilter || hourFilter || userFilter || keyFilter || actionFilter
    );

    const isPorteiroOrAdmin = ['ADMIN', 'GESTOR', 'PORTEIRO'].includes(userRole);
    const [bizMetrics, setBizMetrics] = useState<BusinessMetrics | null>(null);

    // TASK-034: métricas de negócio (spec §5) — movidas do Dashboard para cá
    // (relatório consolidado, não informação operacional do balcão).
    useEffect(() => {
        if (!isPorteiroOrAdmin) return;
        fetch('/api/metrics/business')
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (d) setBizMetrics(d); })
            .catch(() => {});
    }, [isPorteiroOrAdmin]);

    const handleClearHistory = async () => {
        try {
            const res = await fetch('/api/history/clear', { method: 'POST' });
            if (res.ok) {
                setShowClearConfirm(false);
                router.refresh();
                toast.success('Histórico limpo com sucesso.');
            } else {
                toast.error('Erro ao limpar histórico.');
            }
        } catch (error) {
            console.error('Failed to clear history', error);
            toast.error('Erro ao limpar histórico.');
        }
    };

    const goToPage = (page: number) => {
        const params = new URLSearchParams(window.location.search);
        params.set('page', String(page));
        router.push(`/history?${params.toString()}`);
    };

    const updateFilters = (newFilters: {
        date?: string, month?: string, hour?: string,
        userId?: string, keyId?: string, action?: string,
    }) => {
        const params = new URLSearchParams(window.location.search);
        if (newFilters.date !== undefined) {
            if (newFilters.date) params.set('date', newFilters.date); else params.delete('date');
            params.delete('month'); // Mutual exclusivity for clarity
            setMonthFilter('');
            setDateFilter(newFilters.date);
        }
        if (newFilters.month !== undefined) {
            if (newFilters.month) params.set('month', newFilters.month); else params.delete('month');
            params.delete('date');
            setDateFilter('');
            setMonthFilter(newFilters.month);
        }
        if (newFilters.hour !== undefined) {
            if (newFilters.hour) params.set('hour', newFilters.hour); else params.delete('hour');
            setHourFilter(newFilters.hour);
        }
        if (newFilters.userId !== undefined) {
            if (newFilters.userId) params.set('userId', newFilters.userId); else params.delete('userId');
            setUserFilter(newFilters.userId);
        }
        if (newFilters.keyId !== undefined) {
            if (newFilters.keyId) params.set('keyId', newFilters.keyId); else params.delete('keyId');
            setKeyFilter(newFilters.keyId);
        }
        if (newFilters.action !== undefined) {
            if (newFilters.action) params.set('action', newFilters.action); else params.delete('action');
            setActionFilter(newFilters.action);
        }
        // Qualquer mudança de filtro volta à primeira página: manter o offset
        // antigo sobre um conjunto menor mostraria uma tela vazia sem explicação.
        params.set('page', '1');
        router.push(`/history?${params.toString()}`);
    };

    const [gerandoPDF, setGerandoPDF] = useState(false);

    // TASK-099 (ADR-019) — `jspdf` e `jspdf-autotable` eram import ESTATICO. Como
    // este e um componente de cliente, os dois entravam no bundle da rota: 459 KB
    // no maior chunk do app, baixados por todo mundo que abre /history, com ou sem
    // intencao de exportar. Agora descem no clique, que e quando servem.
    //
    // O estado `gerandoPDF` nao e polimento: o download acontece ENTRE o clique e
    // o PDF, e sem indicacao o botao parece morto em rede ruim — trocariamos 459 KB
    // de espera invisivel por um segundo de espera que parece defeito.
    const handleExportPDF = async () => {
        if (history.length === 0 || gerandoPDF) return;
        setGerandoPDF(true);
        try {
            const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
                import('jspdf'),
                import('jspdf-autotable'),
            ]);
            gerarPDF(jsPDF, autoTable);
        } catch {
            toast.error('Não foi possível carregar o gerador de PDF. Verifique a conexão.');
        } finally {
            setGerandoPDF(false);
        }
    };

    type ConstrutorPDF = typeof import('jspdf').default;
    type TabelaPDF = typeof import('jspdf-autotable').default;

    const gerarPDF = (jsPDF: ConstrutorPDF, autoTable: TabelaPDF) => {
        const doc = new jsPDF();
        doc.text('Relatório de Movimentações de Chaves', 14, 15);
        doc.setFontSize(10);
        doc.text(`Gerado em: ${formatTimestamp(new Date().toISOString())}`, 14, 22);

        const tableColumn = ["Data/Hora", "Ação", "Chave", "Funcionário", "Confirmado por"];
        const tableRows = history.map(item => [
            formatTimestamp(item.timestamp),
            item.action === 'withdraw' ? 'Retirada' : item.action === 'transfer' ? 'Transferência' : 'Devolução',
            `${item.key_name} (${item.room})`,
            item.employee_name || '-',
            item.confirmed_by || 'Sistêmico'
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 28,
        });

        doc.save(`relatorio_chaves_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    return (
        <div className="page-wrapper">
            <div className="no-print">
                <Sidebar userRole={userRole} username={username} />
            </div>

            <main className="main-content animate-fade">

                {/* Print Header (Only visible when printing) */}
                <div className="print-header" style={{ display: 'none', marginBottom: '2rem', textAlign: 'center' }}>
                    <h2>Relatório de Movimentações de Chaves</h2>
                    <p>Gerado em: {geradoEm}</p>
                </div>

                <div className="card full-width-print w-full">
                    <style jsx global>{`
                        @media print {
                            .no-print, .btn, header, nav { 
                                display: none !important; 
                            }
                            .print-header {
                                display: block !important;
                            }
                            .card {
                                box-shadow: none !important;
                                border: none !important;
                                padding: 0 !important;
                            }
                            .container {
                                max-width: 100% !important;
                                margin: 0 !important;
                                padding: 0 !important;
                            }
                            body {
                                background: white !important;
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }
                            table {
                                font-size: 12px;
                                width: 100%;
                                border-collapse: collapse;
                            }
                            th, td {
                                border: 1px solid var(--border);
                                padding: 8px;
                            }
                        }
                    `}</style>

                    <div className="page-header mb-6 no-print" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%', alignItems: 'center', gap: '1rem' }}>
                            <h2 className="page-title m-0">Histórico de Movimentações</h2>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                                {(userRole === 'ADMIN' || userRole === 'GESTOR') && (
                                    <button
                                        className="btn btn-danger"
                                        onClick={() => setShowClearConfirm(true)}
                                    >
                                        Limpar Histórico
                                    </button>
                                )}
                                <button className="btn btn-blue" onClick={handleExportPDF} disabled={gerandoPDF} style={{ fontSize: '0.9rem' }}>
                                    {gerandoPDF ? 'Gerando…' : 'Exportar PDF'}
                                </button>
                                <PrintButton />
                            </div>
                        </div>

                        {isPorteiroOrAdmin && bizMetrics && (
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <div title="% de transações (30 dias) confirmadas pelo portador em até 10 min — alvo ≥ 95%" style={{ background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dupla Confirmação</span>
                                    <span style={{ fontSize: '1.125rem', fontWeight: 800, color: bizMetrics.doubleConfirmationRate !== null && bizMetrics.doubleConfirmationRate >= 95 ? 'var(--status-available-text)' : 'var(--text-primary)' }}>
                                        {bizMetrics.doubleConfirmationRate !== null ? `${bizMetrics.doubleConfirmationRate}%` : '—'}
                                    </span>
                                </div>
                                <div title="Tempo mediano (30 dias) entre criação da transação e confirmação — alvo ≤ 2 min" style={{ background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tempo de Balcão</span>
                                    <span style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                        {bizMetrics.medianCounterMinutes !== null ? `${bizMetrics.medianCounterMinutes} min` : '—'}
                                    </span>
                                </div>
                            </div>
                        )}

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: '0.75rem', 
                            width: '100%',
                            background: 'rgba(255,255,255,0.02)',
                            padding: '1rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)'
                        }}>
                            <div className="input-group">
                                <label className="input-label">Filtrar Mês</label>
                                <input 
                                    type="month" 
                                    className="input" 
                                    value={monthFilter}
                                    onChange={(e) => updateFilters({ month: e.target.value })}
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label">Data Específica</label>
                                <input 
                                    type="date" 
                                    className="input" 
                                    value={dateFilter}
                                    onChange={(e) => updateFilters({ date: e.target.value })}
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label">Hora (0-23)</label>
                                <select 
                                    className="input" 
                                    value={hourFilter}
                                    onChange={(e) => updateFilters({ hour: e.target.value })}
                                >
                                    <option value="">Todas</option>
                                    {Array.from({ length: 24 }).map((_, i) => (
                                        <option key={i} value={i.toString().padStart(2, '0')}>
                                            {i.toString().padStart(2, '0')}:00
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Portador</label>
                                <select
                                    className="input"
                                    value={userFilter}
                                    onChange={(e) => updateFilters({ userId: e.target.value })}
                                >
                                    <option value="">Todos</option>
                                    {filterOptions.users.map(u => (
                                        <option key={u.id} value={String(u.id)}>{u.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Chave</label>
                                <select
                                    className="input"
                                    value={keyFilter}
                                    onChange={(e) => updateFilters({ keyId: e.target.value })}
                                >
                                    <option value="">Todas</option>
                                    {filterOptions.keys.map(k => (
                                        <option key={k.id} value={String(k.id)}>
                                            {k.name}{k.room ? ` (${k.room})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Movimentação</label>
                                <select
                                    className="input"
                                    value={actionFilter}
                                    onChange={(e) => updateFilters({ action: e.target.value })}
                                >
                                    <option value="">Todas</option>
                                    {HISTORY_ACTIONS.map(a => (
                                        <option key={a.value} value={a.value}>{a.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                <button
                                    className="btn btn-ghost btn-sm w-full"
                                    disabled={!hasActiveFilter}
                                    onClick={() => {
                                        setDateFilter('');
                                        setMonthFilter('');
                                        setHourFilter('');
                                        setUserFilter('');
                                        setKeyFilter('');
                                        setActionFilter('');
                                        router.push('/history');
                                    }}
                                >
                                    Limpar Filtros
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="table-wrapper table-cards">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Data/Hora</th>
                                    <th>Ação</th>
                                    <th>Chave</th>
                                    <th>Funcionário</th>
                                    <th>Justificativa</th>
                                    <th>Confirmado por</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((item) => (
                                    <tr key={item.id}>
                                        <td data-label="Data/Hora" style={{ color: 'var(--text-primary)' }}>{formatTimestamp(item.timestamp)}</td>
                                        <td data-label="Ação">
                                            {/* Idioma ação→cor: retirada=âmbar, transferência=roxo, devolução=verde —
                                                o mesmo das Confirmações (antes: rosa de "em uso", outro significado). */}
                                            <span className={`status-tag ${item.action === 'withdraw' ? 'status-withdraw' : item.action === 'transfer' ? 'status-transfer' : 'status-return'}`}>
                                                {item.action === 'withdraw' ? 'Retirada' : item.action === 'transfer' ? 'Transferência' : 'Devolução'}
                                            </span>
                                        </td>
                                        <td data-label="Chave"><strong>{item.key_name}</strong> <small style={{ color: 'var(--text-muted)' }}>({item.room})</small></td>
                                        <td data-label="Funcionário">{item.employee_name || '-'}</td>
                                        <td data-label="Justificativa" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.justification || '-'}</td>
                                        <td data-label="Confirmado por">
                                            {item.confirmed_by ? (
                                                <span className="badge badge-porteiro" style={{ fontSize: '0.7rem' }}>
                                                    {item.confirmed_by}
                                                </span>
                                            ) : (
                                                <span className="text-muted" style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>Sistêmico</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {history.length === 0 && (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        {hasActiveFilter
                                            ? 'Nenhuma movimentação encontrada para os filtros selecionados.'
                                            : 'Nenhum histórico registrado.'}
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* TASK-057: o servidor sempre paginou (LIMIT 50), mas a tela não
                        oferecia navegação — o histórico ficava preso aos 50 registros
                        mais recentes, sem sinal de que havia mais. */}
                    {totalRecords > 0 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: '1rem', flexWrap: 'wrap', marginTop: '1rem',
                        }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {totalRecords} {totalRecords === 1 ? 'movimentação' : 'movimentações'}
                                {totalPages > 1 && ` · página ${currentPage} de ${totalPages}`}
                            </span>

                            {totalPages > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        disabled={currentPage <= 1}
                                        onClick={() => goToPage(currentPage - 1)}
                                        aria-label="Página anterior"
                                    >
                                        ← Anterior
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        disabled={currentPage >= totalPages}
                                        onClick={() => goToPage(currentPage + 1)}
                                        aria-label="Próxima página"
                                    >
                                        Próxima →
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Clear History Confirmation Modal */}
            {showClearConfirm && (
                <div className="modal-overlay" onClick={() => setShowClearConfirm(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Atenção</h3>
                        </div>
                        <p style={{ color: 'var(--text-secondary)' }}>Esta ação apagará todos os registros de movimentação. Deseja realmente limpar o histórico?</p>
                        <div className="action-row mt-6">
                            <button className="btn btn-ghost" onClick={() => setShowClearConfirm(false)}>Cancelar</button>
                            <button className="btn btn-danger" onClick={handleClearHistory}>
                                Confirmar Limpeza
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
