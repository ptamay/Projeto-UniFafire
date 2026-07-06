'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PrintButton from '../components/PrintButton';
import Sidebar from '../components/Sidebar';

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

interface HistoryClientProps {
    history: HistoryItem[];
    userRole: string;
    username: string;
    currentPage?: number;
    totalPages?: number;
    initialFilters?: {
        date?: string;
        month?: string;
        hour?: string;
    };
}

export default function HistoryClient({ history, userRole, username, initialFilters }: HistoryClientProps) {
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const router = useRouter();

    // Initialize filters from props
    const [dateFilter, setDateFilter] = useState(initialFilters?.date || '');
    const [monthFilter, setMonthFilter] = useState(initialFilters?.month || '');
    const [hourFilter, setHourFilter] = useState(initialFilters?.hour || '');

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
                alert('Histórico limpo com sucesso.');
            } else {
                alert('Erro ao limpar histórico.');
            }
        } catch (error) {
            console.error('Failed to clear history', error);
            alert('Erro ao limpar histórico.');
        }
    };

    const updateFilters = (newFilters: { date?: string, month?: string, hour?: string }) => {
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
        params.set('page', '1');
        router.push(`/history?${params.toString()}`);
    };

    const handleExportPDF = () => {
        if (history.length === 0) return;
        const doc = new jsPDF();
        doc.text('Relatório de Movimentações de Chaves', 14, 15);
        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 22);

        const tableColumn = ["Data/Hora", "Ação", "Chave", "Funcionário", "Confirmado por"];
        const tableRows = history.map(item => [
            new Date(item.timestamp).toLocaleString('pt-BR'),
            item.action === 'withdraw' ? 'Retirada' : 'Devolução',
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
                    <p>Gerado em: {new Date().toLocaleString('pt-BR')}</p>
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
                                <button className="btn btn-blue" onClick={handleExportPDF} style={{ fontSize: '0.9rem' }}>
                                    Exportar PDF
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

                            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                <button 
                                    className="btn btn-ghost btn-sm w-full" 
                                    onClick={() => {
                                        setDateFilter('');
                                        setMonthFilter('');
                                        setHourFilter('');
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
                                        <td data-label="Data/Hora" style={{ color: 'var(--text-primary)' }}>{new Date(item.timestamp).toLocaleString('pt-BR')}</td>
                                        <td data-label="Ação">
                                            <span className={`status-tag ${item.action === 'withdraw' ? 'status-inuse' : 'status-available'}`}>
                                                {item.action === 'withdraw' ? 'Retirada' : 'Devolução'}
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
                                {history.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Nenhum histórico registrado.</td></tr>}
                            </tbody>
                        </table>
                    </div>
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
