'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface LogItem {
    id: number;
    user_id: number | null;
    username: string;
    action: string;
    target: string | null;
    details: string | null;
    timestamp: string;
}

interface LogsClientProps {
    initialLogs?: LogItem[]; // Optional if we want SSR, but client-side fetching is fine too for this
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
        <div className="container">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Log de Ações</h1>
                    <Link href="/" style={{ color: '#0070f3', textDecoration: 'none' }}>&larr; Voltar para Dashboard</Link>
                </div>
            </header>

            <div className="card">
                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                    <input
                        type="text"
                        placeholder="Buscar por usuário, ação ou alvo..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                        style={{
                            padding: '0.6rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            width: '100%',
                            maxWidth: '400px',
                            outline: 'none'
                        }}
                    />
                </div>

                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Data/Hora</th>
                                <th>Usuário Responsável</th>
                                <th>Ação Realizada</th>
                                <th>Alvo da Ação</th>
                                <th>Detalhes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} style={{ textAlign: 'center' }}>Carregando...</td></tr>
                            ) : logs.length > 0 ? (
                                logs.map(log => (
                                    <tr key={log.id}>
                                        <td>{new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                                        <td><strong>{log.username}</strong></td>
                                        <td>
                                            <span style={{
                                                fontSize: '0.85rem',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                background: '#eee',
                                                fontWeight: 500
                                            }}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td>{log.target || '-'}</td>
                                        <td style={{ color: '#666', fontSize: '0.9rem' }}>{log.details || '-'}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#999' }}>Nenhum registro encontrado.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                    <button
                        className="btn btn-outline"
                        disabled={page === 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                        Anterior
                    </button>
                    <span>Página {page} de {totalPages}</span>
                    <button
                        className="btn btn-outline"
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                        Próxima
                    </button>
                </div>
            </div>
        </div>
    );
}
