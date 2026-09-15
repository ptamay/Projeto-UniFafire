'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatTimestamp } from '@/lib/time-filters';
import type { PaginaDeLogs } from '@/lib/logs-query';
import FolhaDeFiltros from '@/app/components/FolhaDeFiltros';
import MenuDeAcoes from '@/app/components/MenuDeAcoes';
import { rotuloDaAcao, detalheLegivel, alvoLegivel } from '@/lib/trilha-legivel';

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

/** TASK-131: a primeira página vem do servidor — a tela abre com ela, sem "Carregando…". */
export default function LogsClient({ logsIniciais }: { logsIniciais: PaginaDeLogs }) {
    const [logs, setLogs] = useState<LogEntry[]>(logsIniciais.logs as LogEntry[]);
    const [loading, setLoading] = useState(false);
    const [category, setCategory] = useState<LogCategory>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [monthFilter, setMonthFilter] = useState('');
    const [hourFilter, setHourFilter] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(logsIniciais.totalPages || 1);
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

    // A página com os filtros no padrão já veio do servidor. O efeito só busca quando os filtros
    // DIFEREM dos da última página carregada — e não "pula a primeira execução": em
    // desenvolvimento o React (StrictMode) executa o efeito DUAS vezes na montagem, a primeira
    // gastava o pulo e a segunda buscava de novo, com "Carregando…" na tela (visto no CI da
    // TASK-131, 79 quadros). Comparando os filtros, as duas execuções veem a mesma chave.
    const chaveDosFiltros = JSON.stringify([category, page, searchTerm, dateFilter, monthFilter, hourFilter]);
    const chaveCarregada = useRef(JSON.stringify(['all', 1, '', '', '', '']));
    useEffect(() => {
        if (chaveDosFiltros === chaveCarregada.current) return;
        const timer = setTimeout(() => {
            chaveCarregada.current = chaveDosFiltros;
            fetchLogs();
        }, 300); // Debounce search
        return () => clearTimeout(timer);
    }, [fetchLogs, chaveDosFiltros]);

    return (
        <>
            <main className="main-content animate-fade">
                <div className="card w-full">
                    <div className="page-header cabecalho-enxuto">
                        <h1 className="page-title m-0">Logs do Sistema</h1>
                    </div>

                    {/* TASK-135: a busca à vista; tipo, mês, dia e hora numa folha (no celular), e a
                        planilha no menu "⋯". Antes a primeira tela inteira era filtro. */}
                    <FolhaDeFiltros
                        ativos={[category !== 'all', monthFilter, dateFilter, hourFilter].filter(Boolean).length}
                        aoLimpar={() => {
                            setDateFilter('');
                            setMonthFilter('');
                            setHourFilter('');
                            setCategory('all');
                            setPage(1);
                        }}
                        busca={
                            <div className="search-bar" style={{ maxWidth: '100%' }}>
                                <input
                                    type="search"
                                    className="input"
                                    aria-label="Buscar nos registros"
                                    placeholder="Buscar"
                                    enterKeyHint="search"
                                    value={searchTerm}
                                    onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                                />
                                <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            </div>
                        }
                        acoes={
                            <MenuDeAcoes acoes={[{
                                rotulo: 'Baixar planilha (CSV)',
                                desabilitada: logs.length === 0,
                                aoEscolher: () => {
                                    if (logs.length === 0) return;
                                    const csv = 'Data/Hora,Usuário,Ação Realizada,Alvo,Endereço IP,Detalhes\n' +
                                        logs.map(l => `"${formatTimestamp(l.timestamp)}","${l.username || ''}","${l.action || ''}","${l.target || ''}","${l.ip_address || ''}","${l.details || ''}"`).join('\n');
                                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `logs_${category}_${new Date().toISOString().split('T')[0]}.csv`;
                                    a.click();
                                },
                            }]} />
                        }
                    >
                        <div className="input-group">
                            <label className="input-label" htmlFor="logs-tipo">Tipo de registro</label>
                            <select
                                id="logs-tipo"
                                className="input"
                                value={category}
                                onChange={(e) => { setCategory(e.target.value as LogCategory); setPage(1); setLogs([]); setLoading(true); }}
                            >
                                <option value="all">Todos</option>
                                <option value="system">Ações no sistema</option>
                                <option value="security">Segurança</option>
                                <option value="login">Entradas no sistema</option>
                            </select>
                        </div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="logs-mes">Mês</label>
                            <input
                                id="logs-mes"
                                type="month"
                                className="input"
                                value={monthFilter}
                                aria-describedby="logs-dica-mes"
                                onChange={(e) => { setMonthFilter(e.target.value); setDateFilter(''); setPage(1); }}
                            />
                            <span id="logs-dica-mes" className="dica-campo">Mostra o mês inteiro</span>
                        </div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="logs-dia">Dia</label>
                            <input
                                id="logs-dia"
                                type="date"
                                className="input"
                                value={dateFilter}
                                aria-describedby="logs-dica-dia"
                                onChange={(e) => { setDateFilter(e.target.value); setMonthFilter(''); setPage(1); }}
                            />
                            <span id="logs-dica-dia" className="dica-campo">Ou escolha um dia só</span>
                        </div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="logs-hora">Hora do dia</label>
                            <select
                                id="logs-hora"
                                className="input"
                                value={hourFilter}
                                onChange={(e) => { setHourFilter(e.target.value); setPage(1); }}
                            >
                                <option value="">Qualquer hora</option>
                                {Array.from({ length: 24 }).map((_, i) => (
                                    <option key={i} value={i.toString().padStart(2, '0')}>
                                        Das {i.toString().padStart(2, '0')}:00 às {i.toString().padStart(2, '0')}:59
                                    </option>
                                ))}
                            </select>
                        </div>
                    </FolhaDeFiltros>

                    {/* TASK-136 (ADR-031): no celular, cada registro é uma LINHA — a ação, quem,
                        sobre o quê e quando —, e não o cartão de seis "rótulo: valor".
                        TASK-137: a ação em palavra ("Entrou no sistema"); o código gravado
                        (LOGIN_SUCCESS) fica pequeno, junto da hora — é o registro, não o rótulo.
                        O IP fica na tabela do desktop e na planilha: aqui, quebrava a linha. */}
                    <div className="mobile-only">
                        <ul className="lista-linhas" aria-label="Registros">
                            {loading ? (
                                <li className="linha-vazia">Carregando…</li>
                            ) : logs.length > 0 ? logs.map(log => {
                                const alvo = alvoLegivel(log.target);
                                return (
                                <li key={log.id} className="linha-lista">
                                    <div className="linha-texto">
                                        <div className="linha-nome">{rotuloDaAcao(log.action)}</div>
                                        <div className="linha-apoio">{log.username}{alvo ? ` · ${alvo}` : ''}</div>
                                        {log.details && <div className="linha-apoio">{detalheLegivel(log.details)}</div>}
                                        <div className="linha-meta">
                                            {formatTimestamp(log.timestamp)} · <span className="codigo-trilha">{log.action}</span>
                                        </div>
                                    </div>
                                </li>
                                );
                            }) : (
                                <li className="linha-vazia">Nenhum registro encontrado.</li>
                            )}
                        </ul>
                    </div>

                    <div className="table-wrapper desktop-only">
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
                                            <td data-label="Data/Hora" style={{ color: 'var(--text-primary)' }}>{formatTimestamp(log.timestamp)}</td>
                                            <td data-label="Usuário"><strong>{log.username}</strong></td>
                                            <td data-label="Ação">
                                                {/* TASK-137: a ação em palavra; embaixo, pequeno, o código gravado na
                                                    trilha (LOGOUT, LOGIN_SUCCESS) — é o registro, e fica como foi gravado. */}
                                                <div style={{ color: 'var(--text-primary)', fontWeight: isSecurityEvent ? 600 : 400 }}>
                                                    {rotuloDaAcao(log.action)}
                                                </div>
                                                <span className="codigo-trilha">{log.action}</span>
                                            </td>
                                            <td data-label="Alvo">{alvoLegivel(log.target) || '-'}</td>
                                            <td data-label="IP" style={{ fontFamily: 'monospace', fontSize: 'var(--fs-2)', color: 'var(--text-muted)' }}>{log.ip_address || '-'}</td>
                                            <td data-label="Detalhes" style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-2)' }}>{detalheLegivel(log.details) || '-'}</td>
                                        </tr>
                                    )})
                                ) : (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Nenhum registro encontrado.</td></tr>
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
        </>
    );
}
