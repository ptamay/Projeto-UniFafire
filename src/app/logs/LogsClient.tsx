'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';

// Note: Logs are usually Admin only. The page loader should handle access control or redirect.
// We'll pass isAdmin as a prop if possible or assume LogsClient is protected.

interface LogItem {
    id: number;
    user_id: number | null;
    username: string;
    action: string;
    target: string | null;
    details: string | null;
    timestamp: string;
    // We should probably know if the viewer is admin to show this page properly, but let's assume valid access for now and pass isAdmin=true since only admins see the link.
}

export default function LogsClient() {
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const router = useRouter();

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '50',
                search: searchTerm
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
    }, [page, searchTerm]);

    return (
        <div className="flex flex-col min-h-screen">
            <Navbar isAdmin={true} /> {/* Logs are generally Admin only */}

            <main className="container w-full max-w-7xl mx-auto min-h-content flex-1 mt-4 md:mt-8">
                <div className="card w-full">
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 className="text-navy text-xl font-bold m-0">Log de Ações</h2>
                        </div>

                        <div className="search-wrapper max-w-md relative w-full">
                            <input
                                type="text"
                                placeholder="Buscar por usuário, ação ou alvo..."
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                                style={{
                                    padding: '0.6rem 1rem',
                                    paddingLeft: '2.5rem',
                                    borderRadius: '9999px',
                                    border: '1px solid #e2e8f0',
                                    width: '100%',
                                    outline: 'none',
                                    backgroundColor: '#f8fafc'
                                }}
                            />
                            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>🔍</span>
                        </div>
                    </div>

                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th className="text-navy">Data/Hora</th>
                                    <th className="text-navy">Usuário Responsável</th>
                                    <th className="text-navy">Ação Realizada</th>
                                    <th className="text-navy">Alvo da Ação</th>
                                    <th className="text-navy">Detalhes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Carregando...</td></tr>
                                ) : logs.length > 0 ? (
                                    logs.map(log => (
                                        <tr key={log.id}>
                                            <td style={{ color: '#334155' }}>{new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                                            <td><strong>{log.username}</strong></td>
                                            <td>
                                                <span style={{
                                                    fontSize: '0.85rem',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    background: '#f1f5f9',
                                                    color: '#475569',
                                                    fontWeight: 500,
                                                    border: '1px solid #e2e8f0'
                                                }}>
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td>{log.target || '-'}</td>
                                            <td style={{ color: '#64748b', fontSize: '0.9rem' }}>{log.details || '-'}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>Nenhum registro encontrado.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                        <button
                            className="btn btn-outline-navy"
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            style={{ opacity: page === 1 ? 0.5 : 1 }}
                        >
                            Anterior
                        </button>
                        <span style={{ color: '#64748b' }}>Página {page} de {totalPages}</span>
                        <button
                            className="btn btn-outline-navy"
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
