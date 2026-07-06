'use client';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import toast from 'react-hot-toast';
import { OVERDUE_HOURS } from '@/lib/business-rules';

export interface Key {
    id: number;
    name: string;
    room?: string;
    status: 'available' | 'in_use';
    employee_id?: number;
    employee_name?: string;
    employee_role?: string;
    pending_info?: { transaction_id: number; action: 'withdraw' | 'return'; user_confirmed: boolean; porteiro_confirmed: boolean; user_name: string; user_role: string; user_id: number; };
    in_use_since?: string;
    withdraw_justification?: string;
}

export interface User {
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
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-controls="user-listbox"
                tabIndex={0}
                onClick={() => setOpen(!open)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpen(!open);
                    } else if (e.key === 'Escape') {
                        setOpen(false);
                    }
                }}
                style={{ 
                    minHeight: '44px', 
                    background: 'var(--bg-input)', 
                    border: '1px solid var(--border-strong)', 
                    borderRadius: 'var(--radius-sm)', 
                    padding: '0.4rem 0.75rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    color: selectedUser ? 'var(--text-primary)' : 'var(--text-muted)',
                    transition: 'all 0.2s',
                    boxShadow: open ? 'var(--shadow-accent)' : 'none',
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
                                role="searchbox"
                                aria-label="Filtrar usuário"
                                style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.6rem', fontSize: '0.75rem', color: 'var(--text-primary)', outline: 'none', minHeight: '44px' }}
                                placeholder="Filtrar usuário..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onClick={e => e.stopPropagation()}
                            />
                        </div>
                        <div role="listbox" id="user-listbox" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            {filtered.length > 0 ? filtered.map(u => (
                                <div 
                                    key={u.id}
                                    role="option"
                                    aria-selected={selectedId === u.id}
                                    style={{ 
                                        padding: '0.6rem 0.75rem', 
                                        minHeight: '44px',
                                        fontSize: '0.8rem', 
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: selectedId === u.id ? 'var(--bg-selection)' : 'transparent',
                                        color: selectedId === u.id ? 'var(--text-primary)' : 'var(--text-primary)',
                                        transition: 'all 0.1s'
                                    }}
                                    onClick={() => { onSelect(u.id); setOpen(false); setSearch(''); }}
                                    onMouseEnter={e => {
                                        if (selectedId !== u.id) {
                                            e.currentTarget.style.background = 'var(--bg-selection-light)';
                                        }
                                    }}
                                    onMouseLeave={e => {
                                        if (selectedId !== u.id) {
                                            e.currentTarget.style.background = 'transparent';
                                        }
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: selectedId === u.id ? 700 : 500 }}>{u.name}</div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '1px' }}>{u.role || 'Usuário'}</div>
                                    </div>
                                    {selectedId === u.id && (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-400)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                    )}
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
    const [isDesktop, setIsDesktop] = useState(true);
    
    useEffect(() => {
        const handleResize = () => setIsDesktop(window.innerWidth > 768);
        handleResize(); // Executa na montagem
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    
    const effectiveViewMode = isDesktop ? 'list' : 'grid';

    // Explicação da dupla confirmação — contextual e dispensável (não é tour forçado).
    const [showIntro, setShowIntro] = useState(false);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [selectedEmployee, setSelectedEmployee] = useState<Record<number, number>>({});

    const isPorteiroOrAdmin = ['ADMIN', 'GESTOR', 'PORTEIRO'].includes(userRole);

    const [frequentKeys, setFrequentKeys] = useState<number[]>([]);
    
    // Fetch frequent keys for normal users
    useEffect(() => {
        if (isPorteiroOrAdmin) return;
        fetch('/api/metrics/frequent-keys')
            .then(r => r.ok ? r.json() : [])
            .then(ids => {
                if (Array.isArray(ids)) setFrequentKeys(ids);
            })
            .catch(() => {});
    }, [isPorteiroOrAdmin]);

    const refreshData = useCallback(async () => {
        try {
            const kRes = await fetch('/api/keys');
            let uRes = null;
            if (isPorteiroOrAdmin) {
                uRes = await fetch('/api/users');
            }

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
            if (uRes && uRes.ok) {
                const uData = await uRes.json() as { id: number; username: string; full_name: string | null; role: string }[];
                setEmployees(uData.map((u) => ({ ...u, full_name: u.full_name ?? undefined, name: u.full_name || u.username || '' })));
            }
            router.refresh();
        } catch (e) {
            console.error('Refresh error:', e);
        }
    }, [isPorteiroOrAdmin, username, router]);

    useEffect(() => {
        const handleUpdate = () => refreshData();
        window.addEventListener('pending-transactions-updated', handleUpdate);
        // Não reordena a lista se o usuário está no meio de uma ação (dropdown/modal
        // aberto ou campo preenchido) — evita que a linha "pule" sob o cursor.
        const interval = setInterval(() => { if (!interactingRef.current) refreshData(); }, 3000);
        return () => {
            window.removeEventListener('pending-transactions-updated', handleUpdate);
            clearInterval(interval);
        };
    }, [refreshData]);

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

    // ── Ação Rápida: estado React (antes: DOM imperativo via getElementById) ──
    // qaKey/qaEmp são a fonte da verdade dos campos; o passo (withdraw/return),
    // o rótulo do botão e a validação derivam disso — nada de style.display manual.
    const [qaKey, setQaKey] = useState('');
    const [qaEmp, setQaEmp] = useState('');
    const qaEmpRef = useRef<HTMLInputElement>(null);
    // Enquanto o usuário está no meio de uma ação, o polling de 30s não deve
    // reordenar a lista sob o cursor (spec: fricção zero na portaria).
    const interactingRef = useRef(false);

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
        type: 'withdraw' | 'return' | 'transfer';
        employeeId?: number;
        employeeName?: string;
        withdrawJustification?: string;
    }>({ open: false, keyId: 0, keyName: '', type: 'withdraw' });
    const [transferTargetId, setTransferTargetId] = useState<number | undefined>(undefined);

    // Modal Mobile: Escolha rápida 100% Touch
    const [touchSelectModal, setTouchSelectModal] = useState<{
        open: boolean;
        keyId: number;
        keyName: string;
        searchStr: string;
        suggestions: User[];
    }>({ open: false, keyId: 0, keyName: '', searchStr: '', suggestions: [] });

    const [bypassConfirmation, setBypassConfirmation] = useState(false);
    const [justification, setJustification] = useState('');
    const [customJustification, setCustomJustification] = useState('');
    const justificationOptions = [
        "Funcionário sem acesso a celular/internet",
        "Autorização verbal da diretoria",
        "Emergência/Manutenção urgente",
        "Outro"
    ];

    // Processamento da Transação
    const handleTransaction = async (keyId: number, type: 'withdraw' | 'return' | 'transfer', employeeId?: number) => {
        setActionLoading(keyId);
        try {
            const empId = isPorteiroOrAdmin ? employeeId : userId;
            const finalJustification = justification === 'Outro' ? customJustification : justification;
            const res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: type, 
                    key_id: keyId, 
                    user_id: empId,
                    bypassConfirmation: bypassConfirmation,
                    justification: finalJustification,
                    observation: type === 'transfer' ? customJustification : undefined
                }),
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
            setBypassConfirmation(false);
            setJustification('');
            setCustomJustification('');
            setTransferTargetId(undefined);
        }
    };

    // Cancela uma solicitação pendente (dupla confirmação) direto do dashboard —
    // antes só era possível ir até a aba Confirmações. Usa o endpoint existente.
    const [cancelLoading, setCancelLoading] = useState<number | null>(null);
    const handleCancel = async (transactionId: number, keyName: string) => {
        setCancelLoading(transactionId);
        try {
            const res = await fetch(`/api/transactions/${transactionId}/cancel`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                toast.success(`Solicitação da chave ${keyName} cancelada.`);
                refreshData();
                window.dispatchEvent(new CustomEvent('pending-transactions-updated'));
            } else {
                toast.error(data.error || 'Não foi possível cancelar a solicitação.');
            }
        } catch {
            toast.error('Erro de conexão ao cancelar.');
        } finally {
            setCancelLoading(null);
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
            employeeName: emp?.name,
            withdrawJustification: key.withdraw_justification
        });
        modalOpenTime.current = Date.now();
    };

    const confirmAction = () => {
        const empId = confirmModal.type === 'transfer' ? transferTargetId : confirmModal.employeeId;
        if (confirmModal.type === 'transfer' && !empId) {
            toast.error('Selecione o usuário de destino.');
            return;
        }
        handleTransaction(confirmModal.keyId, confirmModal.type, empId);
        // Limpa a barra de Ação Rápida via estado (o render cuida do resto).
        setKeySuggestions([]);
        setEmpSuggestions([]);
        setQaKey('');
        setQaEmp('');
        setShowKeyDrops(false);
        setShowEmpDrops(false);
    };

    // Seleção de chave na Ação Rápida: disponível → revela o passo (foca "Para quem?"
    // no perfil de balcão); em uso → abre direto o modal de devolução.
    const selectQaKey = (k: Key) => {
        setQaKey(k.name);
        setShowKeyDrops(false);
        setKeyIndex(-1);
        if (k.status === 'available') {
            if (isPorteiroOrAdmin) {
                // Fetch frequent users for this key to improve sorting
                fetch(`/api/metrics/frequent-users?keyId=${k.id}`)
                    .then(res => res.ok ? res.json() : [])
                    .then(freqUsers => {
                        const freqIds = new Set(freqUsers.map((u: User) => u.id));
                        const others = employees.filter(e => !freqIds.has(e.id));
                        const finalSuggestions = [...freqUsers, ...others];
                        
                        setEmpSuggestions(finalSuggestions.slice(0, 5));
                        setEmpIndex(-1);
                        
                        if (window.innerWidth <= 768) {
                            setTouchSelectModal({ open: true, keyId: k.id, keyName: k.name, searchStr: '', suggestions: finalSuggestions });
                        } else {
                            setTimeout(() => qaEmpRef.current?.focus(), 10);
                        }
                    })
                    .catch(() => {
                        setEmpSuggestions(employees.slice(0, 5));
                        setEmpIndex(-1);
                        
                        if (window.innerWidth <= 768) {
                            setTouchSelectModal({ open: true, keyId: k.id, keyName: k.name, searchStr: '', suggestions: employees });
                        } else {
                            setTimeout(() => qaEmpRef.current?.focus(), 10);
                        }
                    });
            } else {
                // Para usuários normais (não porteiros), o saque é automático para si mesmo.
                requestTransaction(k.id, 'withdraw');
            }
        } else {
            requestTransaction(k.id, 'return');
        }
    };

    // Seleção de usuário na Ação Rápida → abre o modal de retirada para a chave atual.
    const selectQaEmp = (emp: User) => {
        setQaEmp(emp.name);
        setShowEmpDrops(false);
        setEmpIndex(-1);
        const key = keys.find(k => normalize(k.name) === normalize(qaKey.trim()));
        if (key) requestTransaction(key.id, 'withdraw', emp.id);
    };

    useEffect(() => {
        if (!confirmModal.open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                if (Date.now() - modalOpenTime.current < 150) return;
                // Prevenir Enter em textarea ou inputs quando estamos apenas navegando
                if (e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox' && e.target.type !== 'radio')) {
                    // Mas se o formulário for válido e não for shift+enter no textarea...
                    if (!(e.target instanceof HTMLTextAreaElement && e.shiftKey)) {
                        e.preventDefault();
                        confirmAction();
                    }
                    return;
                }
                e.preventDefault();
                confirmAction();
            } else if (e.key === 'Escape') {
                setConfirmModal(prev => ({ ...prev, open: false }));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // confirmAction é recriada a cada render e já reflete o confirmModal atual —
        // os campos abaixo são o que de fato determina quando o efeito precisa rodar de novo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [confirmModal.open, confirmModal.keyId, confirmModal.type, confirmModal.employeeId]);

    useEffect(() => {
        // Mostra a explicação só até o usuário dispensá-la (uma vez por navegador).
        if (localStorage.getItem('dashboard-intro-dismissed') !== 'true') setShowIntro(true);
    }, []);

    const dismissIntro = () => {
        setShowIntro(false);
        localStorage.setItem('dashboard-intro-dismissed', 'true');
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
                
                // Se for funcionário, priorizar as frequentes
                if (!isPorteiroOrAdmin) {
                    const aFreq = frequentKeys.indexOf(a.id);
                    const bFreq = frequentKeys.indexOf(b.id);
                    if (aFreq !== -1 && bFreq !== -1) return aFreq - bFreq;
                    if (aFreq !== -1) return -1;
                    if (bFreq !== -1) return 1;
                }
                
                return a.name.localeCompare(b.name);
            });
    }, [keys, search, filter, isPorteiroOrAdmin, frequentKeys]);

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

    // ── Ação Rápida: valores derivados do estado (fonte única de verdade) ──
    const qaResolvedKey = keys.find(k => normalize(k.name) === normalize(qaKey.trim())) || null;
    const qaStep: 'withdraw' | 'return' | null = qaResolvedKey
        ? (qaResolvedKey.status === 'available' ? 'withdraw' : 'return')
        : null;
    const qaResolvedEmp = employees.find(e => normalize(e.name) === normalize(qaEmp.trim())) || null;
    const qaConfirmEnabled = qaStep === 'return'
        || (qaStep === 'withdraw' && (!isPorteiroOrAdmin || !!qaResolvedEmp));
    // Mensagem anunciada por leitor de tela quando o passo muda (aria-live).
    const qaLiveMessage = qaStep === 'withdraw'
        ? (isPorteiroOrAdmin && !qaResolvedEmp
            ? `Chave ${qaResolvedKey!.name} selecionada. Escolha o usuário para a retirada.`
            : `Pronto para solicitar a retirada da chave ${qaResolvedKey!.name}.`)
        : qaStep === 'return'
            ? `Chave ${qaResolvedKey!.name} está com ${qaResolvedKey!.employee_name || 'usuário'}. Pronto para solicitar a devolução.`
            : '';
    // Mantém o ref de "interagindo" atualizado a cada render (lido pelo polling).
    interactingRef.current = showKeyDrops || showEmpDrops || confirmModal.open || qaKey.trim() !== '' || actionLoading !== null;

    return (
        <div className="page-wrapper">
            <Sidebar userRole={userRole} username={username} isOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

            <main className="main-content">
                {/* Header */}
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Monitoramento de Chaves</h1>
                        <p className="page-subtitle">Sistema Administrativo</p>
                    </div>
                    <div className="dashboard-stats" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Disponíveis</span>
                            <span style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--status-available-text)' }}>{stats.available}</span>
                        </div>
                        <div style={{ background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Em Uso</span>
                            <span style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--status-inuse-text)' }}>{stats.inUse}</span>
                        </div>
                    </div>
                </header>

                {/* Painel de Alertas */}
                {delayedKeys.length > 0 && isPorteiroOrAdmin && (
                    <div style={{ marginBottom: '1.5rem', background: 'var(--status-inuse-bg)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px', color: 'var(--status-inuse-text)' }} aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        <div>
                            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--status-inuse-text)', fontSize: '0.9rem', fontWeight: 800 }}>Atenção: Chaves em Atraso</h3>
                            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                                {delayedKeys.map(k => (
                                    <li key={k.id}>
                                        A chave <strong>{k.name}</strong> está com <strong>{k.employee_name}</strong> há mais de {k.diffHours} horas.
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {/* Explicação da dupla confirmação (dispensável, contextual) */}
                {showIntro && (
                    <div className="animate-fade" style={{ marginBottom: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>Como funciona a dupla confirmação</div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                Toda retirada ou devolução precisa da confirmação das duas partes — quem solicita e a outra pessoa confirmam na aba <strong style={{ color: 'var(--text-primary)' }}>Confirmações</strong>. Enquanto a solicitação estiver <strong style={{ color: 'var(--text-primary)' }}>Aguardando</strong>, você pode cancelá-la.
                            </p>
                        </div>
                        <button
                            onClick={dismissIntro}
                            data-tooltip="Não mostrar de novo"
                            data-tooltip-pos="bottom"
                            aria-label="Dispensar explicação"
                            className="icon-btn"
                            style={{ flexShrink: 0, marginTop: '-4px', marginRight: '-4px' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                )}

                {/* Unified Control Bar */}
                <div className="unified-control-bar" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', background: 'var(--bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', alignItems: 'center' }}>
                    <div className="search-bar" style={{ flex: '1', minWidth: '200px', background: 'var(--bg-input)', borderRadius: '12px', position: 'relative' }}>
                        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input
                            className="input"
                            aria-label="Buscar chave ou usuário"
                            style={{ paddingLeft: '2.75rem', minHeight: '44px', background: 'transparent', border: 'none', boxShadow: 'none', width: '100%' }}
                            placeholder="Buscar chave ou usuário..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="control-actions" style={{ flex: '2', minWidth: '300px', display: 'flex', alignItems: 'center', background: 'var(--bg-input)', borderRadius: '12px', paddingLeft: '1rem' }}>
                        <div style={{ color: 'var(--accent-primary)', flexShrink: 0 }} aria-hidden="true">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                        </div>

                        {/* Passo 1 — qual a chave */}
                        <div style={{ position: 'relative', flex: 1 }}>
                            <input
                                className="input"
                                placeholder="Ação Rápida: Qual a chave?"
                                id="unified-key-input"
                                autoComplete="off"
                                role="combobox"
                                aria-label="Ação rápida: qual a chave?"
                                aria-expanded={showKeyDrops}
                                aria-controls="key-dropdown"
                                value={qaKey}
                                style={{ minHeight: '44px', fontSize: '0.8rem', background: 'transparent', border: 'none', boxShadow: 'none', width: '100%', paddingLeft: '0.5rem' }}
                                onFocus={() => {
                                    setShowKeyDrops(true);
                                    setKeyIndex(-1);
                                    if (keySuggestions.length === 0) {
                                        const initial = [...keys].sort((a, b) => {
                                            if (a.status === 'in_use' && b.status === 'available') return -1;
                                            if (a.status === 'available' && b.status === 'in_use') return 1;
                                            
                                            if (!isPorteiroOrAdmin) {
                                                const aFreq = frequentKeys.indexOf(a.id);
                                                const bFreq = frequentKeys.indexOf(b.id);
                                                if (aFreq !== -1 && bFreq !== -1) return aFreq - bFreq;
                                                if (aFreq !== -1) return -1;
                                                if (bFreq !== -1) return 1;
                                            }
                                            
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
                                        e.preventDefault();
                                        const val = normalize(e.currentTarget.value.trim());
                                        const selected = keyIndex >= 0 ? keySuggestions[keyIndex] : null;
                                        const match = selected || keySuggestions[0] || keys.find(k => normalize(k.name).includes(val));
                                        if (match) selectQaKey(match);
                                    }
                                }}
                                onChange={(e) => {
                                    const raw = e.target.value;
                                    setQaKey(raw);
                                    const val = normalize(raw.trim());
                                    const filtered = keys
                                        .filter(k => normalize(k.name).includes(val))
                                        .sort((a, b) => {
                                            if (a.status === 'in_use' && b.status === 'available') return -1;
                                            if (a.status === 'available' && b.status === 'in_use') return 1;
                                            
                                            if (!isPorteiroOrAdmin) {
                                                const aFreq = frequentKeys.indexOf(a.id);
                                                const bFreq = frequentKeys.indexOf(b.id);
                                                if (aFreq !== -1 && bFreq !== -1) return aFreq - bFreq;
                                                if (aFreq !== -1) return -1;
                                                if (bFreq !== -1) return 1;
                                            }

                                            return a.name.localeCompare(b.name);
                                        })
                                        .slice(0, 8);
                                    setKeySuggestions(filtered);
                                    setKeyIndex(-1);
                                    // Nome exato de chave disponível: já pré-carrega sugestões de usuário.
                                    const exact = keys.find(k => normalize(k.name) === val);
                                    if (exact && exact.status === 'available' && isPorteiroOrAdmin) {
                                        setEmpSuggestions(employees.slice(0, 5));
                                    }
                                }}
                            />
                            {showKeyDrops && keySuggestions.length > 0 && (
                                <div
                                    ref={keyScrollRef}
                                    id="key-dropdown"
                                    role="listbox"
                                    aria-label="Chaves"
                                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0 0 var(--radius-md) var(--radius-md)', boxShadow: 'var(--shadow-lg)', zIndex: 100, maxHeight: '300px', overflowY: 'auto', marginTop: '1px' }}
                                >
                                    <div style={{ padding: '0.4rem 1rem', fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                                        Use as setas e Enter para selecionar
                                    </div>
                                    {keySuggestions.map((k, index) => (
                                        <div
                                            key={k.id}
                                            role="option"
                                            aria-selected={keyIndex === index}
                                            style={{ padding: '0.8rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: keyIndex === index ? 'var(--bg-selection)' : 'transparent', minHeight: '44px' }}
                                            onMouseDown={(ev) => { ev.preventDefault(); selectQaKey(k); }}
                                            className="suggestion-item"
                                        >
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{k.name}</span>
                                            <span className={`status-tag ${k.status === 'available' ? 'status-available' : 'status-inuse'}`}>
                                                {k.status === 'available' ? 'DISPONÍVEL' : `COM ${k.employee_name?.toUpperCase() || '—'}`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Passo 2 — revelado por estado derivado (qaStep), não por style.display */}
                        {qaStep === 'withdraw' && (
                            <div style={{ position: 'relative' }}>
                                {isPorteiroOrAdmin ? (
                                    <>
                                        <input
                                            ref={qaEmpRef}
                                            className="input unified-emp-input"
                                            placeholder="Para quem?"
                                            id="unified-emp-input"
                                            autoComplete="off"
                                            role="combobox"
                                            aria-label="Selecionar usuário para a retirada"
                                            aria-expanded={showEmpDrops}
                                            aria-controls="emp-dropdown"
                                            value={qaEmp}
                                            style={{ minHeight: '44px', fontSize: '0.8rem', width: '220px', background: 'transparent', border: 'none', borderLeft: '1px solid var(--border)' }}
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
                                                    e.preventDefault();
                                                    const val = normalize(e.currentTarget.value);
                                                    const selected = empIndex >= 0 ? empSuggestions[empIndex] : null;
                                                    const match = selected || empSuggestions[0] || employees.find(emp => normalize(emp.name).includes(val));
                                                    if (match) selectQaEmp(match);
                                                }
                                            }}
                                            onChange={(e) => {
                                                setQaEmp(e.target.value);
                                                const val = normalize(e.target.value);
                                                setEmpSuggestions(employees.filter(emp => normalize(emp.name).includes(val)).slice(0, 5));
                                                setEmpIndex(-1);
                                            }}
                                        />
                                        {showEmpDrops && empSuggestions.length > 0 && (
                                            <div
                                                ref={empScrollRef}
                                                id="emp-dropdown"
                                                role="listbox"
                                                aria-label="Usuários"
                                                style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0 0 var(--radius-md) var(--radius-md)', boxShadow: 'var(--shadow-lg)', zIndex: 100, maxHeight: '200px', overflowY: 'auto', marginTop: '1px' }}
                                            >
                                                <div style={{ padding: '0.4rem 1rem', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                                                    Use as setas e Enter para selecionar
                                                </div>
                                                {empSuggestions.map((emp, index) => (
                                                    <div
                                                        key={emp.id}
                                                        role="option"
                                                        aria-selected={empIndex === index}
                                                        style={{ padding: '0.8rem 1rem', minHeight: '44px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: empIndex === index ? 'var(--bg-selection)' : 'transparent' }}
                                                        onMouseDown={(ev) => { ev.preventDefault(); selectQaEmp(emp); }}
                                                        className="suggestion-item"
                                                    >
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{emp.name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{emp.role}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div style={{ minHeight: '38px', display: 'flex', alignItems: 'center', background: 'var(--bg-selection-light)', padding: '0 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Para: <strong style={{ color: 'var(--text-primary)' }}>{username}</strong></span>
                                    </div>
                                )}
                            </div>
                        )}
                        {qaStep === 'return' && (
                            <div style={{ minHeight: '38px', display: 'flex', alignItems: 'center', background: 'var(--bg-selection-light)', padding: '0 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Com: <strong style={{ color: 'var(--text-primary)' }}>{qaResolvedKey?.employee_name || '—'}</strong></span>
                            </div>
                        )}

                        {qaStep && (
                            <button
                                id="unified-confirm-btn"
                                className={`btn ${qaStep === 'withdraw' ? 'btn-green' : 'btn-blue'} btn-sm`}
                                style={{ minHeight: '44px', minWidth: '90px' }}
                                disabled={!qaConfirmEnabled}
                                onClick={() => {
                                    if (!qaResolvedKey) return toast.error('Chave inválida.');
                                    if (qaStep === 'withdraw') {
                                        if (isPorteiroOrAdmin) {
                                            if (!qaResolvedEmp) return toast.error('Usuário não encontrado. Selecione da lista.');
                                            requestTransaction(qaResolvedKey.id, 'withdraw', qaResolvedEmp.id);
                                        } else {
                                            requestTransaction(qaResolvedKey.id, 'withdraw');
                                        }
                                    } else {
                                        requestTransaction(qaResolvedKey.id, 'return');
                                    }
                                }}
                            >
                                {qaStep === 'withdraw' ? 'Solicitar' : 'Devolver'}
                            </button>
                        )}

                        {/* Anúncio para leitor de tela quando o passo muda (antes: revelação silenciosa) */}
                        <span className="sr-only" role="status" aria-live="polite">{qaLiveMessage}</span>
                    </div>
                </div>

                {/* Mobile: troca a Ação Rápida em 2 passos (chave + pessoa por
                    digitação) por uma busca compacta de 1 campo — filtra a lista
                    abaixo em tempo real, então basta tocar no card (que já dispara
                    o mesmo fluxo de retirar/devolver). Atalhos de chaves frequentes
                    dão acesso em 1 toque, sem digitar nada, para quem sempre pega
                    a(s) mesma(s) chave(s) — a parte "inteligente" que já existia. */}
                <div className="mobile-touch-bar">
                    <div className="mobile-touch-search">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input
                            aria-label="Filtrar chave por nome ou sala"
                            placeholder="Filtrar por nome ou sala..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>

                    {!isPorteiroOrAdmin && frequentKeys.length > 0 && (
                        <div className="mobile-quick-chips" role="list" aria-label="Chaves que você usa com frequência">
                            {frequentKeys
                                .map(id => keys.find(k => k.id === id))
                                .filter((k): k is Key => Boolean(k))
                                .slice(0, 5)
                                .map(k => (
                                    <button
                                        key={k.id}
                                        type="button"
                                        role="listitem"
                                        className={`mobile-quick-chip ${k.status === 'available' ? 'is-available' : 'is-inuse'}`}
                                        onClick={() => selectQaKey(k)}
                                    >
                                        {k.name}
                                    </button>
                                ))}
                        </div>
                    )}
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center', width: '100%' }}>
                    {(['all','available','in_use'] as const).map(f => (
                        <button 
                            key={f} 
                            className={`btn ${filter === f ? 'btn-green' : 'btn-ghost'} btn-sm`} 
                            onClick={() => setFilter(f)}
                            style={{ borderRadius: '10px', flex: 1 }}
                        >
                            {f === 'all' ? 'Todas' : f === 'available' ? 'Disponíveis' : 'Em Uso'}
                        </button>
                    ))}

                </div>

                {/* Content */}
                {filtered.length === 0 ? (
                    keys.length === 0 ? (
                        // Primeira vez: nenhuma chave cadastrada — ensina o próximo passo.
                        <div className="empty-state">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 1rem', opacity: 0.3 }} aria-hidden="true">
                                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                            </svg>
                            <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>Nenhuma chave cadastrada ainda</p>
                            <p style={{ maxWidth: '34rem', margin: '0 auto' }}>As chaves da portaria aparecem aqui. Cadastre a primeira para começar a registrar retiradas e devoluções.</p>
                            {isPorteiroOrAdmin ? (
                                <button className="btn btn-green btn-sm" style={{ marginTop: '1.25rem' }} onClick={() => router.push('/keys')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    Cadastrar chave
                                </button>
                            ) : (
                                <p style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>Peça a um gestor para cadastrar as chaves.</p>
                            )}
                        </div>
                    ) : (
                        // Há chaves, mas a busca/filtro atual não retornou nenhuma.
                        <div className="empty-state">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 1rem', opacity: 0.3 }} aria-hidden="true">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>Nenhuma chave encontrada</p>
                            <p>Nenhuma chave corresponde à busca ou ao filtro atual.</p>
                            {(search !== '' || filter !== 'all') && (
                                <button className="btn btn-ghost btn-sm" style={{ marginTop: '1.25rem' }} onClick={() => { setSearch(''); setFilter('all'); }}>
                                    Limpar busca e filtros
                                </button>
                            )}
                        </div>
                    )
                ) : effectiveViewMode === 'grid' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {filtered.map(key => (
                            <div 
                                key={key.id} 
                                className={`key-card ${key.pending_info ? 'pending' : key.status === 'in_use' ? 'inuse' : 'available'}`}
                                onClick={() => selectQaKey(key)}
                            >
                                <div className="key-card-icon-wrapper">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                                </div>
                                
                                <div className="key-card-content-wrapper">
                                    <div className="key-card-header-row">
                                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, alignItems: 'flex-start', width: '100%' }}>
                                            <div className="key-card-title">{key.name}</div>
                                            {key.room && <div className="key-card-room">{key.room}</div>}
                                            
                                            {key.status === 'in_use' && key.employee_name && !key.pending_info && (
                                                <div className="key-card-holder animate-fade" style={{ width: '100%' }}>
                                                    <div className="key-card-avatar">
                                                        {key.employee_name[0].toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key.employee_name}</div>
                                                        {key.employee_role && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>{key.employee_role}</div>}
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {key.pending_info && (
                                                <div className="key-card-holder animate-fade" style={{ width: '100%' }}>
                                                    <div className="key-card-avatar">
                                                        {(key.pending_info.user_name || 'U')[0].toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key.pending_info.user_name || 'Usuário'}</div>
                                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>{key.pending_info.user_role || 'Aluno'}</div>
                                                    </div>
                                                </div>
                                            )}

                                            {key.pending_info && (isPorteiroOrAdmin || key.pending_info.user_id === userId) && (
                                                <button
                                                    className="key-card-action-btn"
                                                    disabled={cancelLoading === key.pending_info.transaction_id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCancel(key.pending_info!.transaction_id, key.name);
                                                    }}
                                                >
                                                    {cancelLoading === key.pending_info.transaction_id ? <div className="spinner" style={{ width: 12, height: 12 }} /> : 'Cancelar'}
                                                </button>
                                            )}
                                        </div>
                                        <span className={`status-tag ${key.pending_info ? 'status-pending' : key.status === 'available' ? 'status-available' : 'status-inuse'}`} style={{ flexShrink: 0, marginTop: '2px' }}>
                                            {key.pending_info ? 'AGUARDANDO' : (key.status === 'available' ? 'DISPONÍVEL' : 'EM USO')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* Modo Lista */
                    effectiveViewMode === 'list' && (
                        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
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
                                    }} className={`list-row-hover dashboard-list-row ${key.pending_info ? 'row-pending' : key.status === 'available' ? 'row-available' : 'row-inuse'}`}>
                                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem', textAlign: 'left' }}>
                                            {key.name}
                                        </div>
                                        <div data-label="Sala / Local" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'left' }}>
                                            {key.room || '-'}
                                        </div>
                                        <div data-label="Status" style={{ display: 'flex', justifyContent: 'center' }}>
                                            <span className={`status-tag ${key.pending_info ? 'status-pending' : key.status === 'available' ? 'status-available' : 'status-inuse'}`}>
                                                {key.pending_info ? 'Aguardando' : (key.status === 'available' ? 'Disponível' : 'Em Uso')}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
                                            {key.status === 'in_use' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', textAlign: 'center', minWidth: 0 }}>
                                                    <div style={{ width: '32px', height: '32px', background: 'var(--accent-primary)', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 900, flexShrink: 0, border: '2px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                                                        {key.employee_name?.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{key.employee_name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{key.employee_role || 'Usuário'}</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', textAlign: 'center' }}>
                                                    {isPorteiroOrAdmin ? (
                                                        <>
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
                                            {key.pending_info ? (
                                                (isPorteiroOrAdmin || key.pending_info.user_id === userId) ? (
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        data-tooltip="Cancelar esta solicitação"
                                                        aria-label={`Cancelar solicitação da chave ${key.name}`}
                                                        style={{ padding: '0.4rem 1rem' }}
                                                        disabled={cancelLoading === key.pending_info.transaction_id}
                                                        onClick={() => handleCancel(key.pending_info!.transaction_id, key.name)}
                                                    >
                                                        {cancelLoading === key.pending_info.transaction_id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : 'Cancelar'}
                                                    </button>
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Aguardando</span>
                                                )
                                            ) : key.status === 'available' ? (
                                                <button
                                                    className="btn btn-green btn-sm"
                                                    disabled={actionLoading === key.id || (isPorteiroOrAdmin && !selectedEmployee[key.id])}
                                                    onClick={() => requestTransaction(key.id, 'withdraw')}
                                                    style={{ padding: '0.4rem 1.25rem' }}
                                                >
                                                    Solicitar
                                                </button>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        className="btn btn-blue btn-sm"
                                                        disabled={actionLoading === key.id}
                                                        onClick={() => requestTransaction(key.id, 'return')}
                                                        style={{ padding: '0.4rem 1.25rem' }}
                                                    >
                                                        Devolver
                                                    </button>
                                                    {isPorteiroOrAdmin && (
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            disabled={actionLoading === key.id}
                                                            onClick={() => {
                                                                setConfirmModal({
                                                                    open: true,
                                                                    keyId: key.id,
                                                                    keyName: key.name,
                                                                    type: 'transfer'
                                                                });
                                                            }}
                                                            style={{ padding: '0.4rem 1.25rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
                                                        >
                                                            Transferir
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
</div>
                    )
                )}
            </main>

            {/* Modal 100% Touch para Selecionar Usuário (Mobile/Porteiro) */}
            {touchSelectModal.open && (
                <div className="modal-overlay" onClick={() => setTouchSelectModal(prev => ({ ...prev, open: false }))}>
                    <div className="modal-box" onClick={e => e.stopPropagation()} style={{ padding: '1.25rem', height: '85vh', display: 'flex', flexDirection: 'column', gap: '1rem', width: '95%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h2 style={{ fontSize: '1.375rem', color: 'var(--text-primary)', margin: 0, fontWeight: 800 }}>Para quem?</h2>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>Chave <strong style={{color: 'var(--green-400)'}}>{touchSelectModal.keyName}</strong></p>
                            </div>
                            <button className="icon-btn" onClick={() => setTouchSelectModal(prev => ({ ...prev, open: false }))} style={{ margin: '-0.5rem -0.5rem 0 0', padding: '0.5rem' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        
                        <div className="search-bar" style={{ maxWidth: '100%', flexShrink: 0, margin: '0.5rem 0' }}>
                            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input 
                                className="input" 
                                placeholder="Busque pelo nome se quiser..." 
                                style={{ paddingLeft: '2.75rem', minHeight: '48px' }}
                                value={touchSelectModal.searchStr}
                                onChange={e => setTouchSelectModal(prev => ({ ...prev, searchStr: e.target.value }))}
                            />
                        </div>
                        
                        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 -1.25rem', padding: '0 0.5rem' }}>
                            {touchSelectModal.suggestions.filter(u => normalize(u.name).includes(normalize(touchSelectModal.searchStr))).map((u, i) => (
                                <div 
                                    key={u.id}
                                    className="touch-contact-item"
                                    onClick={() => {
                                        setTouchSelectModal(prev => ({ ...prev, open: false }));
                                        requestTransaction(touchSelectModal.keyId, 'withdraw', u.id);
                                    }}
                                >
                                    <div className="touch-contact-avatar">
                                        {u.name[0]?.toUpperCase()}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                                        <span className="touch-contact-name">{u.name}</span>
                                        <span className="touch-contact-role">{u.role || 'Usuário'}</span>
                                    </div>
                                    <div style={{ color: 'var(--text-muted)' }}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Confirmação Premium */}
            {confirmModal.open && (
                <div className="modal-overlay" onClick={() => setConfirmModal(prev => ({ ...prev, open: false }))}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', width: '100%', maxWidth: '400px', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflowX: 'hidden', overflowY: 'auto', maxHeight: '90dvh', animation: 'slideUp 0.25s ease' }}>
                        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                            <div style={{ width: '48px', height: '48px', background: confirmModal.type === 'withdraw' ? 'var(--green-100)' : confirmModal.type === 'transfer' ? 'var(--purple-100)' : 'var(--blue-100)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                {confirmModal.type === 'withdraw' ? (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                                ) : confirmModal.type === 'transfer' ? (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--purple-600)" strokeWidth="2.5"><path d="M17 3l4 4-4 4 M3 17l4 4 4-4 M21 7H3 M3 17h18"/></svg>
                                ) : (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--blue-600)" strokeWidth="2.5"><path d="M12 2v20m-5-5l5 5 5-5"/></svg>
                                )}
                            </div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                                {confirmModal.type === 'transfer' ? 'Transferir Chave?' : `Solicitar ${confirmModal.type === 'withdraw' ? 'Retirada' : 'Devolução'}?`}
                            </h3>
                            
                            {confirmModal.type === 'transfer' ? (
                                <div style={{ textAlign: 'left', marginTop: '1rem' }}>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.25rem' }}>
                                        Transferir a chave <strong style={{ color: 'var(--text-primary)' }}>&quot;{confirmModal.keyName}&quot;</strong> diretamente para outro usuário.
                                    </p>
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>Para quem?</label>
                                        <UserSelector 
                                            users={employees} 
                                            selectedId={transferTargetId} 
                                            onSelect={(uid) => setTransferTargetId(uid)}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>Observação (opcional)</label>
                                        <input 
                                            type="text"
                                            value={customJustification}
                                            onChange={e => setCustomJustification(e.target.value)}
                                            placeholder="Ex: Passando a chave no corredor"
                                            className="input"
                                            style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', border: '1px solid var(--border-strong)' }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                                        Você está prestes a iniciar a {confirmModal.type === 'withdraw' ? 'retirada' : 'devolução'} da chave <strong style={{ color: 'var(--text-primary)' }}>&quot;{confirmModal.keyName}&quot;</strong>
                                        {confirmModal.type === 'withdraw' && (
                                            <span> para <strong style={{ color: 'var(--green-400)' }}>{confirmModal.employeeName}</strong></span>
                                        )}.
                                        <br/><span style={{ fontSize: '0.8rem', opacity: 0.85, display: 'inline-block', marginTop: '0.5rem' }}>Depois de enviar, a outra parte precisa confirmar na aba <strong style={{ color: 'var(--text-secondary)' }}>Confirmações</strong> para concluir. Você pode cancelar a solicitação enquanto ela estiver pendente.</span>
                                    </p>
                                    
                                    {/* Bypass UI */}
                                    {((confirmModal.type === 'withdraw' && isPorteiroOrAdmin) || 
                                      (confirmModal.type === 'return' && isPorteiroOrAdmin && confirmModal.withdrawJustification)) && (
                                        <div style={{ marginTop: '1rem', textAlign: 'left', background: 'var(--bg-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                        <input 
                                            type="checkbox" 
                                            checked={bypassConfirmation}
                                            onChange={(e) => {
                                                setBypassConfirmation(e.target.checked);
                                                if (!e.target.checked) setJustification('');
                                            }}
                                            style={{ accentColor: confirmModal.type === 'withdraw' ? 'var(--green-500)' : 'var(--blue-500)', width: '16px', height: '16px' }}
                                        />
                                        {confirmModal.type === 'withdraw' ? 'Atribuir chave imediatamente sem confirmação' : 'Confirmar devolução imediatamente (sem celular)'}
                                    </label>
                                    
                                    {bypassConfirmation && confirmModal.type === 'withdraw' && (
                                        <div className="animate-fade" style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Justificativa Obrigatória</label>
                                            <select 
                                                value={justification}
                                                onChange={e => setJustification(e.target.value)}
                                                className="input"
                                                style={{ padding: '0.5rem', fontSize: '0.8rem', border: '1px solid var(--border-strong)' }}
                                            >
                                                <option value="" disabled>Selecione um motivo...</option>
                                                {justificationOptions.map(opt => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                            </select>
                                            
                                            {justification === 'Outro' && (
                                                <input 
                                                    type="text"
                                                    value={customJustification}
                                                    onChange={e => setCustomJustification(e.target.value)}
                                                    placeholder="Descreva o motivo..."
                                                    className="input"
                                                    style={{ padding: '0.5rem', fontSize: '0.8rem', border: '1px solid var(--border-strong)' }}
                                                    autoFocus
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            </>
                        )}
                        </div>
                        <div style={{ padding: '1rem', background: 'var(--bg-elevated)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <button
                                className="btn btn-ghost"
                                style={{ border: '1px solid var(--border)' }}
                                onClick={() => setConfirmModal({ ...confirmModal, open: false })}
                            >
                                Voltar
                            </button>
                            <button
                                className={`btn ${confirmModal.type === 'withdraw' ? 'btn-green' : 'btn-blue'}`}
                                onClick={confirmAction}
                            >
                                Enviar solicitação
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
