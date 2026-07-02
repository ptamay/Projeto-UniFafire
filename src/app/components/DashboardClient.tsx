'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import toast from 'react-hot-toast';
import { OVERDUE_HOURS } from '@/lib/business-rules';

interface BusinessMetrics {
    totalTransactions: number;
    doubleConfirmationRate: number | null;
    medianCounterMinutes: number | null;
}

interface Key {
    id: number;
    name: string;
    room?: string;
    status: 'available' | 'in_use';
    employee_id?: number;
    employee_name?: string;
    employee_role?: string;
    pending_info?: { action: 'withdraw' | 'return'; user_confirmed: boolean; porteiro_confirmed: boolean; user_name: string; user_role: string; };
    in_use_since?: string;
}

interface User {
    id: number;
    name: string;
    role?: string;
    username?: string;
    full_name?: string;
}

interface Props {
    initialKeys: Key[];
    initialUsers: User[];
    userRole: string;
    userId: number;
    username?: string;
}

const UserSelector = ({ users, selectedId, onSelect, placeholder = "Escolher..." }: { users: User[], selectedId?: number, onSelect: (id: number) => void, placeholder?: string }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const selectedUser = users.find(u => u.id === selectedId);

    const filtered = users.filter(u => 
        normalize(u.name).includes(normalize(search)) || 
        normalize(u.username || '').includes(normalize(search))
    ).slice(0, 10);

    return (
        <div style={{ position: 'relative', width: '100%', maxWidth: '240px', minWidth: '160px' }}>
            <div 
                onClick={() => setOpen(!open)}
                style={{ 
                    height: '36px', 
                    background: 'var(--bg-input)', 
                    border: '1px solid var(--border-strong)', 
                    borderRadius: 'var(--radius-sm)', 
                    padding: '0 0.75rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    color: selectedUser ? 'var(--text-primary)' : 'var(--text-muted)',
                    transition: 'all 0.2s',
                    boxShadow: open ? '0 0 0 3px rgba(29, 128, 70, 0.1)' : 'none',
                    borderColor: open ? 'var(--green-400)' : 'var(--border-strong)'
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: selectedUser ? 600 : 400 }}>
                    {selectedUser ? selectedUser.name : placeholder}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', opacity: 0.6 }}>
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </div>

            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />
                    <div className="animate-fade" style={{ 
                        position: 'absolute', 
                        top: 'calc(100% + 5px)', 
                        left: 0, 
                        right: 0, 
                        background: 'var(--bg-card)', 
                        border: '1px solid var(--border-strong)', 
                        borderRadius: 'var(--radius-md)', 
                        boxShadow: 'var(--shadow-lg)', 
                        zIndex: 999,
                        overflow: 'hidden',
                        animation: 'slideUp 0.2s ease-out'
                    }}>
                        <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                            <input 
                                autoFocus
                                style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: 'var(--text-primary)', outline: 'none' }}
                                placeholder="Filtrar usuário..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onClick={e => e.stopPropagation()}
                            />
                        </div>
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            {filtered.length > 0 ? filtered.map(u => (
                                <div 
                                    key={u.id}
                                    style={{ 
                                        padding: '0.6rem 0.75rem', 
                                        fontSize: '0.8rem', 
                                        cursor: 'pointer',
                                        background: selectedId === u.id ? 'rgba(29, 128, 70, 0.15)' : 'transparent',
                                        color: selectedId === u.id ? 'var(--green-300)' : 'var(--text-primary)',
                                        borderLeft: selectedId === u.id ? '3px solid var(--green-500)' : '3px solid transparent',
                                        transition: 'all 0.1s'
                                    }}
                                    onClick={() => { onSelect(u.id); setOpen(false); setSearch(''); }}
                                    onMouseEnter={e => {
                                        if (selectedId !== u.id) {
                                            e.currentTarget.style.background = 'var(--bg-elevated)';
                                            e.currentTarget.style.color = 'var(--text-primary)';
                                        }
                                    }}
                                    onMouseLeave={e => {
                                        if (selectedId !== u.id) {
                                            e.currentTarget.style.background = 'transparent';
                                        }
                                    }}
                                >
                                    <div style={{ fontWeight: 600 }}>{u.name}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '1px' }}>{u.role || 'Usuário'}</div>
                                </div>
                            )) : (
                                <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nenhum usuário encontrado</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

const normalize = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function DashboardClient({ initialKeys, initialUsers, userRole, userId, username }: Props) {
    const router = useRouter();
    const [keys, setKeys] = useState<Key[]>(initialKeys || []);
    // Map initialUsers so it has a 'name' property (falling back to full_name or username)
    const mappedUsers = useMemo(() => (initialUsers || []).map(u => ({ ...u, name: u.full_name || u.username || '' })), [initialUsers]);
    const [employees, setEmployees] = useState<User[]>(mappedUsers);
    
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'available' | 'in_use'>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [selectedEmployee, setSelectedEmployee] = useState<Record<number, number>>({});
    const [bizMetrics, setBizMetrics] = useState<BusinessMetrics | null>(null);

    const isPorteiroOrAdmin = ['ADMIN', 'GESTOR', 'PORTEIRO'].includes(userRole);

    // TASK-034: métricas de negócio (spec §5) — só para quem opera o balcão
    useEffect(() => {
        if (!isPorteiroOrAdmin) return;
        fetch('/api/metrics/business')
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (d) setBizMetrics(d); })
            .catch(() => {});
    }, [isPorteiroOrAdmin]);

    const refreshData = async () => {
        try {
            const kRes = await fetch('/api/keys');
            const uRes = await fetch('/api/users');
            if (kRes.ok) {
                const newKeys = await kRes.json();
                
                // Checar se alguma chave nossa foi aprovada
                if (!isPorteiroOrAdmin) {
                    setKeys(prevKeys => {
                        prevKeys.forEach(oldKey => {
                            const newKey = newKeys.find((k: Key) => k.id === oldKey.id);
                            if (newKey && oldKey.pending_info && !newKey.pending_info && newKey.status === 'in_use') {
                                // Se estava pendente e agora está in_use, foi aprovada!
                                // Para ter certeza de que é nossa:
                                if (oldKey.pending_info.action === 'withdraw' && oldKey.pending_info.user_name === username) {
                                    toast.success(`Sua solicitação da chave ${newKey.name} foi aprovada!`, { duration: 5000 });
                                }
                            }
                        });
                        return newKeys;
                    });
                } else {
                    setKeys(newKeys);
                }
            }
            if (uRes.ok) {
                const uData = await uRes.json();
                setEmployees(uData.map((u: any) => ({ ...u, name: u.full_name || u.username || '' })));
            }
            router.refresh();
        } catch (e) {
            console.error('Refresh error:', e);
        }
    };

    useEffect(() => {
        const handleUpdate = () => refreshData();
        window.addEventListener('pending-transactions-updated', handleUpdate);
        const interval = setInterval(refreshData, 30000); // Polling as fallback
        return () => {
            window.removeEventListener('pending-transactions-updated', handleUpdate);
            clearInterval(interval);
        };
    }, []);

    // Normalização para busca ignorando acentos
    // const normalize = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    // Sugestões Customizadas
    const [keySuggestions, setKeySuggestions] = useState<Key[]>([]);
    const [empSuggestions, setEmpSuggestions] = useState<User[]>([]);
    const [showKeyDrops, setShowKeyDrops] = useState(false);
    const [showEmpDrops, setShowEmpDrops] = useState(false);
    const [keyIndex, setKeyIndex] = useState(-1);
    const [empIndex, setEmpIndex] = useState(-1);
    const keyScrollRef = useRef<HTMLDivElement>(null);
    const empScrollRef = useRef<HTMLDivElement>(null);
    const modalOpenTime = useRef<number>(0);

    useEffect(() => {
        if (keyIndex >= 0 && keyScrollRef.current) {
            const activeItem = keyScrollRef.current.children[keyIndex] as HTMLElement;
            activeItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [keyIndex]);

    useEffect(() => {
        if (empIndex >= 0 && empScrollRef.current) {
            const activeItem = empScrollRef.current.children[empIndex] as HTMLElement;
            activeItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [empIndex]);

    // Modal de Confirmação
    const [confirmModal, setConfirmModal] = useState<{
        open: boolean;
        keyId: number;
        keyName: string;
        type: 'withdraw' | 'return';
        employeeId?: number;
        employeeName?: string;
    }>({ open: false, keyId: 0, keyName: '', type: 'withdraw' });

    // Processamento da Transação
    const handleTransaction = async (keyId: number, type: 'withdraw' | 'return', employeeId?: number) => {
        setActionLoading(keyId);
        try {
            const empId = isPorteiroOrAdmin ? employeeId : userId;
            const res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: type, key_id: keyId, user_id: empId }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(type === 'withdraw' ? 'Solicitação de retirada enviada!' : 'Solicitação de devolução enviada!');
                refreshData();
                window.dispatchEvent(new CustomEvent('pending-transactions-updated'));
                if (type === 'withdraw') {
                    setSelectedEmployee(prev => { const n = { ...prev }; delete n[keyId]; return n; });
                }
            } else {
                toast.error(data.error || 'Erro na operação.');
            }
        } catch {
            toast.error('Erro de conexão.');
        } finally {
            setActionLoading(null);
            setConfirmModal({ open: false, keyId: 0, keyName: '', type: 'withdraw' });
        }
    };

    const requestTransaction = (keyId: number, type: 'withdraw' | 'return', manualEmployeeId?: number) => {
        const key = keys.find(k => k.id === keyId);
        if (!key) return;

        const employeeId = manualEmployeeId || (type === 'withdraw' ? selectedEmployee[keyId] : undefined);
        const targetEmpId = isPorteiroOrAdmin ? employeeId : userId;
        const emp = isPorteiroOrAdmin ? employees.find(e => e.id === targetEmpId) : { name: username };

        if (type === 'withdraw' && !targetEmpId) {
            return toast.error('Selecione um usuário.');
        }

        setConfirmModal({
            open: true,
            keyId,
            keyName: key.name,
            type,
            employeeId: targetEmpId,
            employeeName: emp?.name
        });
        modalOpenTime.current = Date.now();
    };

    const confirmAction = () => {
        handleTransaction(confirmModal.keyId, confirmModal.type, confirmModal.employeeId);
        setKeySuggestions([]); 
        setEmpSuggestions([]);
        const keyInp = document.getElementById('unified-key-input') as HTMLInputElement;
        const empInp = document.getElementById('unified-emp-input') as HTMLInputElement;
        if (keyInp) keyInp.value = '';
        if (empInp) empInp.value = '';
        const nextStep = document.getElementById('unified-next-step');
        const confirmBtn = document.getElementById('unified-confirm-btn');
        if (nextStep) nextStep.style.display = 'none';
        if (confirmBtn) confirmBtn.style.display = 'none';
    };

    useEffect(() => {
        if (!confirmModal.open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                if (Date.now() - modalOpenTime.current < 150) return;
                e.preventDefault();
                confirmAction();
            } else if (e.key === 'Escape') {
                setConfirmModal(prev => ({ ...prev, open: false }));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [confirmModal.open, confirmModal.keyId, confirmModal.type, confirmModal.employeeId]);

    useEffect(() => {
        const savedView = localStorage.getItem('dashboard-view') as 'grid' | 'list' | null;
        if (savedView) setViewMode(savedView);
    }, []);

    const toggleView = (mode: 'grid' | 'list') => {
        setViewMode(mode);
        localStorage.setItem('dashboard-view', mode);
    };

    const stats = useMemo(() => ({
        total: keys.length,
        available: keys.filter(k => k.status === 'available').length,
        inUse: keys.filter(k => k.status === 'in_use').length,
    }), [keys]);

    const filtered = useMemo(() => {
        const s = normalize(search);
        return keys
            .filter(k => {
                const matchSearch = normalize(k.name).includes(s) ||
                    normalize(k.room || '').includes(s) ||
                    normalize(k.employee_name || '').includes(s);
                const matchFilter = filter === 'all' || k.status === filter;
                return matchSearch && matchFilter;
            })
            .sort((a, b) => {
                if (a.status === 'in_use' && b.status === 'available') return -1;
                if (a.status === 'available' && b.status === 'in_use') return 1;
                return a.name.localeCompare(b.name);
            });
    }, [keys, search, filter]);

    // Calcular atrasos — threshold do spec §5 (TASK-034), centralizado em business-rules
    const delayedKeys = useMemo(() => {
        return keys.filter(k => {
            if (k.status !== 'in_use' || !k.in_use_since) return false;
            const diffHours = (new Date().getTime() - new Date(k.in_use_since).getTime()) / (1000 * 60 * 60);
            return diffHours > OVERDUE_HOURS;
        }).map(k => ({
            ...k,
            diffHours: Math.floor((new Date().getTime() - new Date(k.in_use_since!).getTime()) / (1000 * 60 * 60))
        }));
    }, [keys]);

    return (
        <div className="page-wrapper">
            <Sidebar userRole={userRole} username={username} isOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

            <main className="main-content">
                {/* Header */}
                <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Monitoramento de Chaves</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sistema Administrativo</p>
                    </div>
                    <div className="dashboard-stats" style={{ display: 'flex', gap: '0.75rem' }}>
                        <div style={{ background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Disponíveis</span>
                            <span style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--status-available-text)' }}>{stats.available}</span>
                        </div>
                        <div style={{ background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Em Uso</span>
                            <span style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--status-inuse-text)' }}>{stats.inUse}</span>
                        </div>
                        {/* TASK-034 — métricas de negócio (spec §5): taxa de dupla confirmação e tempo de balcão */}
                        {isPorteiroOrAdmin && bizMetrics && (
                            <>
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
                            </>
                        )}
                    </div>
                </header>

                {/* Painel de Alertas */}
                {delayedKeys.length > 0 && isPorteiroOrAdmin && (
                    <div style={{ marginBottom: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--red-500)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--red-500)" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        <div>
                            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--red-600)', fontSize: '0.9rem', fontWeight: 800 }}>Atenção: Chaves em Atraso</h3>
                            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--red-700)', fontSize: '0.8rem' }}>
                                {delayedKeys.map(k => (
                                    <li key={k.id}>
                                        A chave <strong>{k.name}</strong> está com <strong>{k.employee_name}</strong> há mais de {k.diffHours} horas.
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {/* Unified Control Bar */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                    <div className="search-bar" style={{ flex: '1', minWidth: '200px' }}>
                        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input
                            className="input"
                            style={{ paddingLeft: '2.5rem', height: '38px', background: 'transparent', border: 'none' }}
                            placeholder="Buscar chave ou usuário..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '2', minWidth: '300px' }}>
                        <div style={{ color: 'var(--green-500)', flexShrink: 0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                        </div>
                        
                        <div style={{ position: 'relative', flex: 1 }}>
                            <input 
                                className="input" 
                                placeholder="Ação Rápida: Qual a chave?" 
                                id="unified-key-input"
                                autoComplete="off"
                                style={{ height: '38px', fontSize: '0.8rem', border: '1px solid var(--border-strong)', width: '100%' }}
                                onFocus={() => {
                                    setShowKeyDrops(true);
                                    setKeyIndex(-1);
                                    if (keySuggestions.length === 0) {
                                        const initial = [...keys].sort((a, b) => {
                                            if (a.status === 'in_use' && b.status === 'available') return -1;
                                            if (a.status === 'available' && b.status === 'in_use') return 1;
                                            return a.name.localeCompare(b.name);
                                        }).slice(0, 8);
                                        setKeySuggestions(initial);
                                    }
                                }}
                                onBlur={() => setTimeout(() => setShowKeyDrops(false), 200)}
                                onKeyDown={(e) => {
                                    if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        setKeyIndex(prev => (prev < keySuggestions.length - 1 ? prev + 1 : prev));
                                    } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        setKeyIndex(prev => (prev > 0 ? prev - 1 : 0));
                                    } else if (e.key === 'Escape') {
                                        setShowKeyDrops(false);
                                    } else if (e.key === 'Enter') {
                                        const val = normalize(e.currentTarget.value.trim());
                                        const selected = keyIndex >= 0 ? keySuggestions[keyIndex] : null;
                                        const match = selected || keySuggestions[0] || keys.find(k => normalize(k.name).includes(val));
                                        
                                        if (match) {
                                            e.currentTarget.value = match.name;
                                            if (match.status === 'available') {
                                                const nextField = document.getElementById('unified-next-step');
                                                const withdrawField = document.getElementById('withdraw-step');
                                                if (nextField) nextField.style.display = 'block';
                                                if (withdrawField) withdrawField.style.display = 'block';
                                                if (isPorteiroOrAdmin) {
                                                    setTimeout(() => {
                                                        const empInp = document.getElementById('unified-emp-input') as HTMLInputElement;
                                                        empInp?.focus();
                                                        setEmpSuggestions(employees.slice(0, 5));
                                                    }, 10);
                                                } else {
                                                    const btn = document.getElementById('unified-confirm-btn');
                                                    if (btn) btn.style.display = 'block';
                                                }
                                            } else {
                                                requestTransaction(match.id, 'return');
                                            }
                                            setShowKeyDrops(false);
                                        }
                                    }
                                }}
                                onChange={(e) => {
                                    const val = normalize(e.target.value.trim());
                                    const filtered = keys
                                        .filter(k => normalize(k.name).includes(val))
                                        .sort((a, b) => {
                                            if (a.status === 'in_use' && b.status === 'available') return -1;
                                            if (a.status === 'available' && b.status === 'in_use') return 1;
                                            return a.name.localeCompare(b.name);
                                        })
                                        .slice(0, 8);
                                    setKeySuggestions(filtered);
                                    setKeyIndex(-1);
                                    
                                    const match = keys.find(k => normalize(k.name) === val);
                                    const nextField = document.getElementById('unified-next-step');
                                    const withdrawField = document.getElementById('withdraw-step');
                                    const returnField = document.getElementById('return-step');
                                    const btn = document.getElementById('unified-confirm-btn');

                                    if (match) {
                                        if (nextField) nextField.style.display = 'block';
                                        if (match.status === 'available') {
                                            if (withdrawField) withdrawField.style.display = 'block';
                                            if (returnField) returnField.style.display = 'none';
                                            if (btn) { btn.innerText = 'Solicitar'; btn.className = 'btn btn-green btn-sm'; btn.style.display = isPorteiroOrAdmin ? 'none' : 'block'; }
                                            if (isPorteiroOrAdmin) {
                                                setTimeout(() => {
                                                    const empInp = document.getElementById('unified-emp-input') as HTMLInputElement;
                                                    empInp?.focus();
                                                    setEmpSuggestions(employees.slice(0, 5));
                                                }, 10);
                                            }
                                        } else {
                                            if (withdrawField) withdrawField.style.display = 'none';
                                            if (returnField) { 
                                                returnField.style.display = 'block';
                                                const holderSpan = document.getElementById('current-holder-name');
                                                if (holderSpan) holderSpan.innerText = match.employee_name || '';
                                            }
                                            if (btn) { btn.innerText = 'Devolver'; btn.className = 'btn btn-blue btn-sm'; btn.style.display = 'block'; }
                                        }
                                    } else {
                                        if (nextField) nextField.style.display = 'none';
                                        if (btn) btn.style.display = 'none';
                                    }
                                }}
                            />
                            {showKeyDrops && keySuggestions.length > 0 && (
                                <div 
                                    ref={keyScrollRef}
                                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0 0 var(--radius-md) var(--radius-md)', boxShadow: 'var(--shadow-lg)', zIndex: 100, maxHeight: '300px', overflowY: 'auto', marginTop: '1px' }}
                                >
                                    {keySuggestions.map((k, index) => (
                                        <div 
                                            key={k.id} 
                                            style={{ 
                                                padding: '0.6rem 1rem', 
                                                cursor: 'pointer', 
                                                borderBottom: '1px solid var(--border)', 
                                                display: 'flex', 
                                                justifyContent: 'space-between', 
                                                alignItems: 'center',
                                                background: keyIndex === index ? 'var(--green-100)' : 'transparent',
                                                borderLeft: keyIndex === index ? '4px solid var(--green-500)' : '4px solid transparent'
                                            }}
                                            onMouseDown={() => {
                                                const inp = document.getElementById('unified-key-input') as HTMLInputElement;
                                                if (inp) {
                                                    inp.value = k.name;
                                                    if (k.status === 'available') {
                                                        const nextField = document.getElementById('unified-next-step');
                                                        if (nextField) nextField.style.display = 'block';
                                                        document.getElementById('withdraw-step')!.style.display = 'block';
                                                        const btn = document.getElementById('unified-confirm-btn');
                                                        if (btn) {
                                                            btn.innerText = 'Solicitar';
                                                            btn.className = 'btn btn-green btn-sm';
                                                            btn.style.display = isPorteiroOrAdmin ? 'none' : 'block';
                                                        }
                                                        if (isPorteiroOrAdmin) {
                                                            setTimeout(() => {
                                                                const empInp = document.getElementById('unified-emp-input') as HTMLInputElement;
                                                                empInp?.focus();
                                                                setEmpSuggestions(employees.slice(0, 5));
                                                            }, 10);
                                                        }
                                                    } else {
                                                        requestTransaction(k.id, 'return');
                                                    }
                                                }
                                            }}
                                            className="suggestion-item"
                                        >
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{k.name}</span>
                                            <span style={{ fontSize: '0.7rem', color: k.status === 'available' ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                                                {k.status === 'available' ? '✅ DISPONÍVEL' : `❌ COM ${k.employee_name?.toUpperCase()}`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div id="unified-next-step" style={{ display: 'none' }}>
                            <div id="withdraw-step" style={{ position: 'relative' }}>
                                {isPorteiroOrAdmin ? (
                                    <>
                                        <input 
                                            className="input" 
                                            placeholder="Para quem?" 
                                            id="unified-emp-input"
                                            autoComplete="off"
                                            style={{ height: '38px', fontSize: '0.8rem', width: '220px' }}
                                            onFocus={() => {
                                                setShowEmpDrops(true);
                                                setEmpIndex(-1);
                                                if (empSuggestions.length === 0) setEmpSuggestions(employees.slice(0, 5));
                                            }}
                                            onBlur={() => setTimeout(() => setShowEmpDrops(false), 200)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    setEmpIndex(prev => (prev < empSuggestions.length - 1 ? prev + 1 : prev));
                                                } else if (e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    setEmpIndex(prev => (prev > 0 ? prev - 1 : 0));
                                                } else if (e.key === 'Escape') {
                                                    setShowEmpDrops(false);
                                                } else if (e.key === 'Enter') {
                                                    const val = normalize(e.currentTarget.value);
                                                    const selected = empIndex >= 0 ? empSuggestions[empIndex] : null;
                                                    const match = selected || empSuggestions[0] || employees.find(emp => normalize(emp.name).includes(val));
                                                    
                                                    if (match) {
                                                        e.currentTarget.value = match.name;
                                                        const keyName = (document.getElementById('unified-key-input') as HTMLInputElement).value;
                                                        const key = keys.find(k => normalize(k.name) === normalize(keyName));
                                                        if (key) requestTransaction(key.id, 'withdraw', match.id);
                                                    }
                                                }
                                            }}
                                            onChange={(e) => {
                                                const val = normalize(e.target.value);
                                                setEmpSuggestions(employees.filter(emp => normalize(emp.name).includes(val)).slice(0, 5));
                                                setEmpIndex(-1);
                                            }}
                                        />
                                        {showEmpDrops && empSuggestions.length > 0 && (
                                            <div 
                                                ref={empScrollRef}
                                                style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0 0 var(--radius-md) var(--radius-md)', boxShadow: 'var(--shadow-lg)', zIndex: 100, maxHeight: '200px', overflowY: 'auto', marginTop: '1px' }}
                                            >
                                                {empSuggestions.map((e, index) => (
                                                    <div 
                                                        key={e.id} 
                                                        style={{ 
                                                            padding: '0.6rem 1rem', 
                                                            cursor: 'pointer', 
                                                            borderBottom: '1px solid var(--border)',
                                                            background: empIndex === index ? 'var(--green-100)' : 'transparent',
                                                            borderLeft: empIndex === index ? '4px solid var(--green-500)' : '4px solid transparent'
                                                        }}
                                                        onMouseDown={() => {
                                                            const inp = document.getElementById('unified-emp-input') as HTMLInputElement;
                                                            if (inp) {
                                                                inp.value = e.name;
                                                                const keyName = (document.getElementById('unified-key-input') as HTMLInputElement).value;
                                                                const key = keys.find(k => k.name.toLowerCase() === keyName.toLowerCase());
                                                                if (key) {
                                                                    requestTransaction(key.id, 'withdraw', e.id);
                                                                    setShowEmpDrops(false);
                                                                }
                                                            }
                                                        }}
                                                        className="suggestion-item"
                                                    >
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{e.name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{e.role}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div style={{ height: '38px', display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.02)', padding: '0 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Para: <strong style={{ color: 'var(--text-primary)' }}>{username}</strong></span>
                                    </div>
                                )}
                            </div>
                            <div id="return-step" style={{ display: 'none' }}>
                                <div style={{ height: '38px', display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.02)', padding: '0 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Com: <strong id="current-holder-name" style={{ color: 'var(--text-primary)' }}>-</strong></span>
                                </div>
                            </div>
                        </div>
                        <button 
                            id="unified-confirm-btn"
                            className="btn btn-green btn-sm" 
                            style={{ height: '38px', minWidth: '90px', display: 'none' }}
                            onClick={() => {
                                const keyName = normalize((document.getElementById('unified-key-input') as HTMLInputElement).value.trim());
                                const key = keys.find(k => normalize(k.name) === keyName);
                                if (!key) return toast.error('Chave inválida.');
                                if (key.status === 'available') {
                                    if (isPorteiroOrAdmin) {
                                        const empName = normalize((document.getElementById('unified-emp-input') as HTMLInputElement).value.trim());
                                        const emp = employees.find(e => normalize(e.name) === empName);
                                        if (!emp) return toast.error('Usuário não encontrado. Selecione da lista.');
                                        requestTransaction(key.id, 'withdraw', emp.id);
                                    } else {
                                        requestTransaction(key.id, 'withdraw');
                                    }
                                } else {
                                    requestTransaction(key.id, 'return');
                                }
                            }}
                        >
                            Solicitar
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center' }}>
                    {(['all','available','in_use'] as const).map(f => (
                        <button 
                            key={f} 
                            className={`btn ${filter === f ? 'btn-green' : 'btn-ghost'} btn-sm`} 
                            onClick={() => setFilter(f)}
                        >
                            {f === 'all' ? 'Todas' : f === 'available' ? 'Disponíveis' : 'Em Uso'}
                        </button>
                    ))}

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button className={`btn ${viewMode === 'list' ? 'btn-green' : 'btn-ghost'} btn-sm`} onClick={() => toggleView('list')} title="Ver em Lista">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        </button>
                        <button className={`btn ${viewMode === 'grid' ? 'btn-green' : 'btn-ghost'} btn-sm`} onClick={() => toggleView('grid')} title="Ver em Grade">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                {filtered.length === 0 ? (
                    <div className="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 1rem', opacity: 0.3 }}>
                            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                        </svg>
                        <p>Nenhuma chave encontrada.</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                        {filtered.map(key => (
                            <div key={key.id} className={`key-card ${key.status === 'in_use' ? 'inuse' : 'available'}`}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '2rem' }}>
                                    <div style={{ flex: 1 }} className="key-card-header-content">
                                        <div className="key-card-title">{key.name}</div>
                                        {key.room && <div className="key-card-room">{key.room}</div>}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                                        <span className={`status-tag ${key.pending_info ? 'status-pending' : key.status === 'available' ? 'status-available' : 'status-inuse'}`}>
                                            {key.pending_info ? 'Aguardando' : (key.status === 'available' ? 'Disponível' : 'Em Uso')}
                                        </span>
                                    </div>
                                </div>

                                <div className="key-card-dynamic-area">
                                    {key.status === 'in_use' && key.employee_name ? (
                                        <div className="key-card-holder animate-fade" style={{ width: '100%', marginTop: 0 }}>
                                            <div className="key-card-avatar">
                                                {key.employee_name[0].toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key.employee_name}</div>
                                                {key.employee_role && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>{key.employee_role}</div>}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                                            {isPorteiroOrAdmin ? (
                                                    <UserSelector 
                                                        users={employees} 
                                                        selectedId={selectedEmployee[key.id]} 
                                                        onSelect={(uid) => setSelectedEmployee(prev => ({ ...prev, [key.id]: uid }))}
                                                        placeholder="Para quem?"
                                                    />
                                            ) : (
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)', paddingLeft: '0.5rem', height: '42px' }}>
                                                    Retirar para mim
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div style={{ marginTop: 'auto' }}>
                                    {key.pending_info ? (
                                        <div className="animate-fade" style={{ 
                                            background: 'rgba(217,119,6,0.05)', 
                                            border: '1px solid rgba(217,119,6,0.2)', 
                                            borderRadius: 'var(--radius-sm)', 
                                            padding: '0.5rem 0.75rem', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '0.75rem',
                                            height: '42px',
                                            boxSizing: 'border-box'
                                        }}>
                                            <div className="spinner" style={{ width: 14, height: 14, borderTopColor: '#d97706', opacity: 0.8 }} />
                                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1, marginBottom: '2px' }}>
                                                    Aguardando Confirmação
                                                </span>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
                                                    {(!key.pending_info.user_confirmed && key.pending_info.user_name) ? key.pending_info.user_name.split(' ')[0] : 'Porteiro'}
                                                </span>
                                            </div>
                                        </div>
                                    ) : key.status === 'available' ? (
                                        <button
                                            className="btn btn-green btn-sm"
                                            style={{ width: '100%', height: '42px', gap: '0.625rem' }}
                                            disabled={actionLoading === key.id || (isPorteiroOrAdmin && !selectedEmployee[key.id])}
                                            onClick={() => requestTransaction(key.id, 'withdraw')}
                                        >
                                            {actionLoading === key.id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : (
                                                <>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                                                    Solicitar Retirada
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <button
                                            className="btn btn-blue btn-sm"
                                            disabled={actionLoading === key.id}
                                            onClick={() => requestTransaction(key.id, 'return')}
                                            style={{ width: '100%', height: '42px', gap: '0.625rem' }}
                                        >
                                            {actionLoading === key.id ? <div className="spinner" style={{ width: 16, height: 16 }} /> : (
                                                <>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                                                    Solicitar Devolução
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* Modo Lista */
                    viewMode === 'list' && (
                        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                            <div className="dashboard-list-header" style={{
                                display: 'grid',
                                gridTemplateColumns: '1.5fr 1fr 180px 1.8fr 120px',
                                padding: '1rem 1rem 1rem 2.5rem',
                                gap: '1rem',
                                background: 'var(--bg-elevated)',
                                borderBottom: '1px solid var(--border)',
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                color: 'var(--text-secondary)',
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase'
                            }}>
                                <div style={{ textAlign: 'left' }}>Nome</div>
                                <div style={{ textAlign: 'left' }}>Sala / Local</div>
                                <div style={{ textAlign: 'center' }}>Status</div>
                                <div style={{ textAlign: 'center' }}>Usuário</div>
                                <div style={{ textAlign: 'center' }}>Ações</div>
                            </div>

                            {filtered.length === 0 ? (
                                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    Nenhuma chave encontrada com estes filtros.
                                </div>
                            ) : (
                                filtered.map(key => (
                                    <div key={key.id} style={{ 
                                        display: 'grid', 
                                        gridTemplateColumns: '1.5fr 1fr 180px 1.8fr 120px', 
                                        padding: '1rem 1rem 1rem 2.5rem', 
                                        gap: '1rem',
                                        borderBottom: '1px solid var(--border)',
                                        alignItems: 'center',
                                        transition: 'background 0.2s ease'
                                    }} className="list-row-hover dashboard-list-row">
                                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem', textAlign: 'left' }}>
                                            {key.name}
                                        </div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'left' }}>
                                            {key.room || '-'}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            <span className={`status-tag ${key.pending_info ? 'status-pending' : key.status === 'available' ? 'status-available' : 'status-inuse'}`}>
                                                {key.pending_info ? 'Aguardando' : (key.status === 'available' ? 'Disponível' : 'Em Uso')}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
                                            {key.status === 'in_use' ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'left', minWidth: 0 }}>
                                                    <div style={{ width: '32px', height: '32px', background: 'var(--green-100)', color: '#064e3b', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 900, flexShrink: 0, border: '2px solid white', boxShadow: 'var(--shadow-sm)' }}>
                                                        {key.employee_name?.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-green)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '-2px', letterSpacing: '0.025em' }}>Portador Atual</div>
                                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{key.employee_name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{key.employee_role || 'Usuário'}</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                                    {isPorteiroOrAdmin ? (
                                                        <>
                                                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.025em', marginBottom: '4px' }}>Selecionar Usuário</div>
                                                            <UserSelector 
                                                                users={employees} 
                                                                selectedId={selectedEmployee[key.id]} 
                                                                onSelect={(uid) => setSelectedEmployee(prev => ({ ...prev, [key.id]: uid }))}
                                                            />
                                                        </>
                                                    ) : (
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>-</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            {key.status === 'available' ? (
                                                <button
                                                    className="btn btn-green btn-sm"
                                                    disabled={actionLoading === key.id || (isPorteiroOrAdmin && !selectedEmployee[key.id]) || !!key.pending_info}
                                                    onClick={() => requestTransaction(key.id, 'withdraw')}
                                                    style={{ padding: '0.4rem 1.25rem', opacity: key.pending_info ? 0 : 1, pointerEvents: key.pending_info ? 'none' : 'auto' }}
                                                >
                                                    Solicitar
                                                </button>
                                            ) : (
                                                <button
                                                    className="btn btn-blue btn-sm"
                                                    disabled={actionLoading === key.id || !!key.pending_info}
                                                    onClick={() => requestTransaction(key.id, 'return')}
                                                    style={{ padding: '0.4rem 1.25rem', opacity: key.pending_info ? 0 : 1, pointerEvents: key.pending_info ? 'none' : 'auto' }}
                                                >
                                                    Devolver
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )
                )}
            </main>

            {/* Modal de Confirmação Premium */}
            {confirmModal.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,10,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div style={{ background: 'var(--bg-card)', width: '100%', maxWidth: '400px', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', overflow: 'hidden', animation: 'modalIn 0.3s ease-out' }}>
                        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                            <div style={{ width: '48px', height: '48px', background: confirmModal.type === 'withdraw' ? 'var(--green-100)' : 'var(--blue-100)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                {confirmModal.type === 'withdraw' ? (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                                ) : (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--blue-600)" strokeWidth="2.5"><path d="M12 2v20m-5-5l5 5 5-5"/></svg>
                                )}
                            </div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                                Solicitar {confirmModal.type === 'withdraw' ? 'Retirada' : 'Devolução'}?
                            </h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                                Você está prestes a iniciar a {confirmModal.type === 'withdraw' ? 'retirada' : 'devolução'} da chave <strong style={{ color: 'var(--text-primary)' }}>&quot;{confirmModal.keyName}&quot;</strong>
                                {confirmModal.type === 'withdraw' && (
                                    <span> para <strong style={{ color: 'var(--green-400)' }}>{confirmModal.employeeName}</strong></span>
                                )}.
                                <br/><span style={{ fontSize: '0.8rem', opacity: 0.8, display: 'inline-block', marginTop: '0.5rem' }}>(Requer confirmação da outra parte na aba de Confirmações)</span>
                            </p>
                        </div>
                        <div style={{ padding: '1rem', background: 'var(--bg-elevated)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <button 
                                className="btn btn-ghost" 
                                style={{ border: '1px solid var(--border)' }}
                                onClick={() => setConfirmModal({ ...confirmModal, open: false })}
                            >
                                Cancelar
                            </button>
                            <button 
                                className={`btn ${confirmModal.type === 'withdraw' ? 'btn-green' : 'btn-blue'}`}
                                onClick={confirmAction}
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                    <style jsx>{`
                        @keyframes modalIn {
                            from { opacity: 0; transform: scale(0.95) translateY(10px); }
                            to { opacity: 1; transform: scale(1) translateY(0); }
                        }
                    `}</style>
                </div>
            )}
        </div>
    );
}
