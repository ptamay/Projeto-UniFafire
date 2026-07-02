'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '../components/Sidebar';

type LogType = 'actions' | 'audit' | 'logins';

export default function LogsClient({ userRole, username }: { userRole: string, username: string }) {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<LogType>('actions');
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [monthFilter, setMonthFilter] = useState('');
    const [hourFilter, setHourFilter] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const router = useRouter();

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                type: activeTab,
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
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchLogs();
        }, 300); // Debounce search
        return () => clearTimeout(timer);
    }, [page, searchTerm, dateFilter, monthFilter, hourFilter, activeTab]);

    return (
        <div className="page-wrapper">
            <Sidebar userRole={userRole} username={username} />

            <main className="main-content animate-fade">
                <div className="card w-full">
                    <div className="page-header mb-6" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                            <h2 className="page-title m-0">Painel de Auditoria</h2>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', width: '100%' }}>
                            {(['actions', 'audit', 'logins'] as LogType[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => { setActiveTab(tab); setPage(1); setLogs([]); setLoading(true); }}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: '0.75rem 1rem',
                                        fontSize: '0.875rem',
                                        fontWeight: 600,
                                        color: activeTab === tab ? 'var(--green-500)' : 'var(--text-muted)',
                                        borderBottom: activeTab === tab ? '2px solid var(--green-500)' : '2px solid transparent',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {tab === 'actions' && 'Ações do Sistema'}
                                    {tab === 'audit' && 'Auditoria de Segurança'}
                                    {tab === 'logins' && 'Tentativas de Login'}
                                </button>
                            ))}
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
                                        placeholder={activeTab === 'logins' ? "Usuário ou IP..." : "Buscar nos registros..."}
                                        value={searchTerm}
                                        onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                                    />
                                    <span className="search-icon">🔍</span>
                                </div>
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
                                        setPage(1);
                                    }}
                                >
                                    Limpar Filtros
                                </button>
                                <button 
                                    className="btn btn-green btn-sm"
                                    onClick={() => {
                                        if (logs.length === 0) return;
                                        let csv = '';
                                        if (activeTab === 'actions') {
                                            csv = 'Data/Hora,Usuário,Ação Realizada,Alvo,Endereço IP,Detalhes\n' + 
                                                logs.map(l => `"${new Date(l.timestamp).toLocaleString('pt-BR')}","${l.username}","${l.action}","${l.target || ''}","${l.ip_address || ''}","${l.details || ''}"`).join('\n');
                                        } else if (activeTab === 'audit') {
                                            csv = 'Data/Hora,ID Ator,ID Alvo,Ação,Detalhes\n' + 
                                                logs.map(l => `"${new Date(l.timestamp).toLocaleString('pt-BR')}","${l.actor_id}","${l.target_user_id}","${l.action}","${l.details || ''}"`).join('\n');
                                        } else if (activeTab === 'logins') {
                                            csv = 'Data/Hora,Usuário,IP,Status\n' + 
                                                logs.map(l => `"${new Date(l.timestamp).toLocaleString('pt-BR')}","${l.username}","${l.ip}","${l.success ? 'Sucesso' : 'Falha'}"`).join('\n');
                                        }
                                        
                                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `auditoria_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
                                        a.click();
                                    }}
                                >
                                    Exportar CSV
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="table-wrapper">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Data/Hora</th>
                                    {activeTab === 'actions' && (
                                        <>
                                            <th>Usuário</th>
                                            <th>Ação Realizada</th>
                                            <th>Alvo</th>
                                            <th>Endereço IP</th>
                                            <th>Detalhes</th>
                                        </>
                                    )}
                                    {activeTab === 'audit' && (
                                        <>
                                            <th>ID Ator</th>
                                            <th>ID Alvo</th>
                                            <th>Ação</th>
                                            <th>Detalhes</th>
                                        </>
                                    )}
                                    {activeTab === 'logins' && (
                                        <>
                                            <th>Usuário</th>
                                            <th>IP</th>
                                            <th>Status</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Carregando...</td></tr>
                                ) : logs.length > 0 ? (
                                    logs.map(log => (
                                        <tr key={log.id}>
                                            <td style={{ color: 'var(--text-primary)' }}>{new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                                            
                                            {activeTab === 'actions' && (
                                                <>
                                                    <td><strong>{log.username}</strong></td>
                                                    <td>
                                                        <span style={{
                                                            fontSize: '0.85rem',
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            background: 'var(--bg-elevated)',
                                                            color: 'var(--text-secondary)',
                                                            fontWeight: 500,
                                                            border: '1px solid var(--border)'
                                                        }}>
                                                            {log.action}
                                                        </span>
                                                    </td>
                                                    <td>{log.target || '-'}</td>
                                                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{log.ip_address || '-'}</td>
                                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{log.details || '-'}</td>
                                                </>
                                            )}

                                            {activeTab === 'audit' && (
                                                <>
                                                    <td><strong>ID: {log.actor_id}</strong></td>
                                                    <td>ID: {log.target_user_id}</td>
                                                    <td>
                                                        <span style={{
                                                            fontSize: '0.85rem', padding: '2px 8px', borderRadius: '12px',
                                                            background: 'var(--blue-900)', color: 'var(--blue-300)',
                                                            border: '1px solid var(--blue-700)'
                                                        }}>
                                                            {log.action}
                                                        </span>
                                                    </td>
                                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{log.details || '-'}</td>
                                                </>
                                            )}

                                            {activeTab === 'logins' && (
                                                <>
                                                    <td><strong>{log.username}</strong></td>
                                                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{log.ip}</td>
                                                    <td>
                                                        <span style={{
                                                            fontSize: '0.85rem', padding: '2px 8px', borderRadius: '12px',
                                                            background: log.success ? 'var(--green-900)' : 'var(--red-900)', 
                                                            color: log.success ? 'var(--green-300)' : '#ef4444',
                                                            border: `1px solid ${log.success ? 'var(--green-700)' : '#dc2626'}`
                                                        }}>
                                                            {log.success ? 'Sucesso' : 'Falha'}
                                                        </span>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))
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
