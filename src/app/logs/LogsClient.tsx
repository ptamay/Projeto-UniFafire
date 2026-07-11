'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../components/Sidebar';

type LogCategory = 'all' | 'system' | 'security' | 'login';

interface LogEntry {
    id: number;
    timestamp: string;
    username?: string;
    action?: string;
    target?: string;
    ip_address?: string;
    details?: string;
}

export default function LogsClient({ userRole, username }: { userRole: string, username: string }) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState<LogCategory>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [monthFilter, setMonthFilter] = useState('');
    const [hourFilter, setHourFilter] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const router = useRouter();

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                category: category,
                page: page.toString(),
                limit: '50',
                search: searchTerm,
                date: dateFilter,
                month: monthFilter,
                hour: hourFilter
            });
            const res = await fetch(`/api/logs?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs);
                setTotalPages(data.totalPages);
            } else {
                if (res.status === 401 || res.status === 403) {
                    router.push('/');
                }
            }
        } catch (error) {
            console.error('Failed to fetch logs', error);
        } finally {
            setLoading(false);
        }
    }, [category, page, searchTerm, dateFilter, monthFilter, hourFilter, router]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchLogs();
        }, 300); // Debounce search
        return () => clearTimeout(timer);
    }, [fetchLogs]);

    return (
        <div className="page-wrapper">
            <Sidebar userRole={userRole} username={username} />

            <main className="main-content animate-fade">
                <div className="card w-full">
                    <div className="page-header mb-6" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                            <h2 className="page-title m-0">Logs do Sistema</h2>
                        </div>

                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                            gap: '0.75rem', 
                            width: '100%',
                            background: 'rgba(255,255,255,0.02)',
                            padding: '1rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)'
                        }}>
                            <div className="input-group">
                                <label className="input-label">Buscar</label>
                                <div className="search-bar" style={{ maxWidth: '100%' }}>
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder="Buscar nos registros..."
                                        value={searchTerm}
                                        onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                                    />
                                    <span className="search-icon">🔍</span>
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Categoria</label>
                                <select 
                                    className="input" 
                                    value={category}
                                    onChange={(e) => { setCategory(e.target.value as LogCategory); setPage(1); setLogs([]); setLoading(true); }}
                                >
                                    <option value="all">Todas as Ações</option>
                                    <option value="system">Ações do Sistema</option>
                                    <option value="security">Auditoria de Segurança</option>
                                    <option value="login">Eventos de Login</option>
                                </select>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Mês</label>
                                <input 
                                    type="month" 
                                    className="input" 
                                    value={monthFilter}
                                    onChange={(e) => { setMonthFilter(e.target.value); setDateFilter(''); setPage(1); }}
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label">Data Específica</label>
                                <input 
                                    type="date" 
                                    className="input" 
                                    value={dateFilter}
                                    onChange={(e) => { setDateFilter(e.target.value); setMonthFilter(''); setPage(1); }}
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label">Hora (0-23)</label>
                                <select 
                                    className="input" 
                                    value={hourFilter}
                                    onChange={(e) => { setHourFilter(e.target.value); setPage(1); }}
                                >
                                    <option value="">Todas</option>
                                    {Array.from({ length: 24 }).map((_, i) => (
                                        <option key={i} value={i.toString().padStart(2, '0')}>
                                            {i.toString().padStart(2, '0')}:00
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                                <button 
                                    className="btn btn-ghost btn-sm" 
                                    onClick={() => {
                                        setSearchTerm('');
                                        setDateFilter('');
                                        setMonthFilter('');
                                        setHourFilter('');
                                        setCategory('all');
                                        setPage(1);
                                    }}
                                >
                                    Limpar Filtros
                                </button>
                                <button 
                                    className="btn btn-green btn-sm"
                                    onClick={() => {
                                        if (logs.length === 0) return;
                                        const csv = 'Data/Hora,Usuário,Ação Realizada,Alvo,Endereço IP,Detalhes\n' + 
                                            logs.map(l => `"${new Date(l.timestamp).toLocaleString('pt-BR')}","${l.username || ''}","${l.action || ''}","${l.target || ''}","${l.ip_address || ''}","${l.details || ''}"`).join('\n');
                                        
                                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `logs_${category}_${new Date().toISOString().split('T')[0]}.csv`;
                                        a.click();
                                    }}
                                >
                                    Exportar CSV
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="table-wrapper table-cards">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Data/Hora</th>
                                    <th>Usuário</th>
                                    <th>Ação Realizada</th>
                                    <th>Alvo</th>
                                    <th>Endereço IP</th>
                                    <th>Detalhes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Carregando...</td></tr>
                                ) : logs.length > 0 ? (
                                    logs.map(log => {
                                        const isSecurityEvent = ['LOGIN_FAILED', 'RATE_LIMIT_EXCEEDED', 'ACCOUNT_LOCKOUT', 'CHANGE_PASSWORD', 'PASSWORD_RESET', 'TRANSACTION_BYPASS', 'CLEAR_DATABASE', 'CLEAR_HISTORY'].includes(log.action || '');
                                        return (
                                        <tr key={log.id}>
                                            <td data-label="Data/Hora" style={{ color: 'var(--text-primary)' }}>{new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                                            <td data-label="Usuário"><strong>{log.username}</strong></td>
                                            <td data-label="Ação">
                                                <span style={{
                                                    fontSize: '0.85rem',
                                                    padding: '2px 8px',
                                                    borderRadius: 'var(--radius-sm)',
                                                    background: isSecurityEvent ? 'var(--blue-900)' : 'var(--bg-elevated)',
                                                    color: isSecurityEvent ? 'var(--blue-300)' : 'var(--text-secondary)',
                                                    fontWeight: 500,
                                                    border: '1px solid var(--border)'
                                                }}>
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td data-label="Alvo">{log.target || '-'}</td>
                                            <td data-label="IP" style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{log.ip_address || '-'}</td>
                                            <td data-label="Detalhes" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{log.details || '-'}</td>
                                        </tr>
                                    )})
                                ) : (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Nenhum registro encontrado.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                        <button
                            className="btn btn-ghost"
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            style={{ opacity: page === 1 ? 0.5 : 1 }}
                        >
                            Anterior
                        </button>
                        <span style={{ color: 'var(--text-muted)' }}>Página {page} de {totalPages}</span>
                        <button
                            className="btn btn-ghost"
                            disabled={page >= totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            style={{ opacity: page >= totalPages ? 0.5 : 1 }}
                        >
                            Próxima
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
