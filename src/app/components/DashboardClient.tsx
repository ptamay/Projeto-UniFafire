'use client';
import { useState, useMemo, useEffect, useRef, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import PendingInline from './PendingInline';
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
    pending_info?: { transaction_id: number; action: 'withdraw' | 'return' | 'transfer'; user_confirmed: boolean; porteiro_confirmed: boolean; user_name: string; user_role: string; user_id: number; porteiro_id?: number | null; };
    in_use_since?: string;
    withdraw_justification?: string;
    user_id?: number;
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
    // Navegação por teclado (padrão combobox WAI-ARIA): índice da opção ativa,
    // ids únicos por instância (o seletor repete por linha na tabela) e retorno
    // de foco ao gatilho ao fechar — antes as opções eram inalcançáveis por teclado.
    const [highlight, setHighlight] = useState(-1);
    const listboxId = useId();
    const triggerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const selectedUser = users.find(u => u.id === selectedId);

    const filtered = users.filter(u =>
        normalize(u.name).includes(normalize(search)) ||
        normalize(u.username || '').includes(normalize(search))
    ).slice(0, 10);

    const closeAndRefocus = () => {
        setOpen(false);
        setSearch('');
        setHighlight(-1);
        triggerRef.current?.focus();
    };
    const selectAndClose = (id: number) => {
        onSelect(id);
        closeAndRefocus();
    };

    useEffect(() => {
        if (highlight >= 0 && listRef.current) {
            (listRef.current.children[highlight] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
        }
    }, [highlight]);

    return (
        <div style={{ position: 'relative', width: '100%', maxWidth: '240px', minWidth: '160px' }}>
            <div
                ref={triggerRef}
                role="button"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-controls={listboxId}
                tabIndex={0}
                onClick={() => setOpen(!open)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                        e.preventDefault();
                        setOpen(true);
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
                    <div style={{ position: 'fixed', inset: 0, zIndex: 'calc(var(--z-dropdown) - 1)' }} onClick={() => setOpen(false)} />
                    <div className="animate-fade" style={{ 
                        position: 'absolute', 
                        top: 'calc(100% + 5px)', 
                        left: 0, 
                        right: 0, 
                        background: 'var(--bg-card)', 
                        border: '1px solid var(--border-strong)', 
                        borderRadius: 'var(--radius-md)', 
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 'var(--z-dropdown)',
                        overflow: 'hidden',
                        animation: 'slideUp 0.2s ease-out'
                    }}>
                        <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                            <input
                                autoFocus
                                role="combobox"
                                aria-label="Filtrar usuário"
                                aria-expanded={open}
                                aria-controls={listboxId}
                                aria-autocomplete="list"
                                aria-activedescendant={highlight >= 0 && filtered[highlight] ? `${listboxId}-opt-${filtered[highlight].id}` : undefined}
                                style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.6rem', fontSize: '0.75rem', color: 'var(--text-primary)', outline: 'none', minHeight: '44px' }}
                                placeholder="Filtrar usuário..."
                                value={search}
                                onChange={e => { setSearch(e.target.value); setHighlight(-1); }}
                                onClick={e => e.stopPropagation()}
                                onKeyDown={(e) => {
                                    if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        setHighlight(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
                                    } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        setHighlight(prev => (prev > 0 ? prev - 1 : 0));
                                    } else if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const pick = highlight >= 0 ? filtered[highlight] : filtered[0];
                                        if (pick) selectAndClose(pick.id);
                                    } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        closeAndRefocus();
                                    }
                                }}
                            />
                        </div>
                        <div role="listbox" id={listboxId} ref={listRef} aria-label="Usuários" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            {filtered.length > 0 ? filtered.map((u, index) => (
                                <div
                                    key={u.id}
                                    id={`${listboxId}-opt-${u.id}`}
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
                                        background: selectedId === u.id ? 'var(--bg-selection)' : highlight === index ? 'var(--bg-selection-light)' : 'transparent',
                                        color: 'var(--text-primary)',
                                        transition: 'background 0.1s'
                                    }}
                                    onClick={() => selectAndClose(u.id)}
                                    onMouseEnter={() => setHighlight(index)}
                                >
                                    <div>
                                        <div style={{ fontWeight: selectedId === u.id ? 700 : 500 }}>{u.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1px' }}>{u.role || 'Usuário'}</div>
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

// Descreve, em uma linha, o que est\u00e1 pendente na chave \u2014 para o card comunicar
// claramente a situa\u00e7\u00e3o (REQ-028): quem est\u00e1 com ela, quem pediu, o que falta confirmar.
const describePending = (pi: NonNullable<Key['pending_info']>): string => {
    const who = pi.user_name || 'Usu\u00e1rio';
    if (pi.action === 'withdraw') return 'Retirada \u2014 aguardando confirma\u00e7\u00e3o';
    if (pi.action === 'return') return 'Devolu\u00e7\u00e3o \u2014 aguardando confirma\u00e7\u00e3o';
    if (pi.action === 'transfer') {
        // Pull (solicita\u00e7\u00e3o): o solicitante j\u00e1 confirmou; falta o portador aceitar.
        return pi.user_confirmed && !pi.porteiro_confirmed
            ? `${who} solicitou esta chave`
            : `Transfer\u00eancia para ${who}`;
    }
    return 'Aguardando confirma\u00e7\u00e3o';
};

export default function DashboardClient({ initialKeys, initialUsers, userRole, userId, username }: Props) {
    const router = useRouter();
    const [keys, setKeys] = useState<Key[]>(initialKeys || []);
    // Map initialUsers so it has a 'name' property (falling back to full_name or username)
    const mappedUsers = useMemo(() => (initialUsers || []).map(u => ({ ...u, name: u.full_name || u.username || '' })), [initialUsers]);
    const [employees, setEmployees] = useState<User[]>(mappedUsers);
    
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'available' | 'in_use'>('all');
    // O layout responsivo agora é tratado puramente por CSS (.mobile-only e .desktop-only)

    // Explicação da dupla confirmação — contextual e dispensável (não é tour forçado).
    const [showIntro, setShowIntro] = useState(false);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [selectedEmployee, setSelectedEmployee] = useState<Record<number, number>>({});

    const isPorteiroOrAdmin = ['ADMIN', 'GESTOR', 'PORTEIRO'].includes(userRole);

    const [frequentKeys, setFrequentKeys] = useState<number[]>([]);
    
    // Chaves frequentes (REQ-029c): o endpoint decide a semântica por papel —
    // portaria recebe as mais movimentadas globalmente, usuário comum as próprias.
    useEffect(() => {
        fetch('/api/metrics/frequent-keys')
            .then(r => r.ok ? r.json() : [])
            .then(ids => {
                if (Array.isArray(ids)) setFrequentKeys(ids);
            })
            .catch(() => {});
    }, []);

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
        type: 'withdraw' | 'return' | 'transfer' | 'request';
        employeeId?: number;
        employeeName?: string;
        holderName?: string;
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
    const handleTransaction = async (keyId: number, type: 'withdraw' | 'return' | 'transfer' | 'request', employeeId?: number) => {
        setActionLoading(keyId);
        try {
            // 'request' (pull, REQ-027) é uma transferência cujo destino é o próprio solicitante.
            // 'transfer' (push): destino é o usuário selecionado (employeeId).
            // 'withdraw'/'return': usuários normais usam o próprio ID; porteiros, o selecionado.
            const apiAction = type === 'request' ? 'transfer' : type;
            const empId = type === 'transfer' ? employeeId
                : type === 'request' ? userId
                : (isPorteiroOrAdmin ? employeeId : userId);
            const finalJustification = justification === 'Outro' ? customJustification : justification;
            const res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: apiAction,
                    key_id: keyId,
                    user_id: empId,
                    bypassConfirmation: bypassConfirmation,
                    justification: finalJustification,
                    observation: (type === 'transfer' || type === 'request') ? customJustification : undefined
                }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || (type === 'withdraw' ? 'Solicitação de retirada enviada!' : type === 'transfer' ? 'Solicitação de transferência enviada!' : type === 'request' ? 'Solicitação enviada ao portador!' : 'Solicitação de devolução enviada!'));
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
    };

    // Abre o modal de solicitação (pull, REQ-027): um não-portador pede a chave ao portador atual.
    const openRequestModal = (k: Key) => {
        setConfirmModal({
            open: true,
            keyId: k.id,
            keyName: k.name,
            type: 'request',
            holderName: k.employee_name,
        });
    };

    const confirmAction = () => {
        const empId = confirmModal.type === 'transfer' ? transferTargetId : confirmModal.employeeId;
        if (confirmModal.type === 'transfer' && !empId) {
            toast.error('Selecione o usuário de destino.');
            return;
        }
        // Força (bypass) exige justificativa antes de enviar — evita 400 do servidor.
        if (bypassConfirmation && (confirmModal.type === 'withdraw' || confirmModal.type === 'return')) {
            const effective = justification === 'Outro' ? customJustification : justification;
            if (!effective || effective.trim() === '') {
                toast.error('Selecione uma justificativa.');
                return;
            }
        }
        handleTransaction(confirmModal.keyId, confirmModal.type, empId);
        // Limpa a barra unificada via estado (o render cuida do resto) —
        // inclusive o filtro da lista, que volta a mostrar todas as chaves.
        setKeySuggestions([]);
        setEmpSuggestions([]);
        setQaKey('');
        setQaEmp('');
        setSearch('');
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
        } else if (isPorteiroOrAdmin || k.user_id === userId) {
            requestTransaction(k.id, 'return');
        } else if (k.pending_info) {
            toast('Esta chave já tem uma solicitação em andamento.');
        } else {
            // Chave de outro usuário: solicitar diretamente ao portador (pull, REQ-027).
            openRequestModal(k);
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

    // Foco gerenciado do modal (antes: listener GLOBAL de Enter que confirmava a
    // partir de qualquer campo, contido por uma guarda de 150ms). Agora o botão
    // primário recebe o foco ao abrir — Enter confirma porque o botão está focado,
    // não porque a tecla foi sequestrada. Escape fecha e Tab circula dentro do modal.
    const confirmBtnRef = useRef<HTMLButtonElement>(null);
    const modalBoxRef = useRef<HTMLDivElement>(null);
    // Guarda quem abriu o modal e devolve o foco ao fechar (padrão APG) —
    // sem isso o foco morria no <body> e a sequência de registros do porteiro
    // exigia voltar ao mouse a cada operação.
    const lastFocusRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (confirmModal.open) {
            lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            confirmBtnRef.current?.focus();
        } else {
            lastFocusRef.current?.focus();
            lastFocusRef.current = null;
        }
    }, [confirmModal.open]);

    const handleModalKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setConfirmModal(prev => ({ ...prev, open: false }));
            return;
        }
        if (e.key === 'Tab' && modalBoxRef.current) {
            const focusables = Array.from(
                modalBoxRef.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
            ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };

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
        ? (qaResolvedKey.status === 'available' ? 'withdraw' : (isPorteiroOrAdmin || qaResolvedKey.user_id === userId ? 'return' : null))
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
    // REQ-029a: texto no campo unificado é FILTRO (a lista deve continuar viva);
    // o polling só pausa durante interação ativa — dropdown aberto, passo 2
    // visível, modal ou ação em andamento.
    interactingRef.current = showKeyDrops || showEmpDrops || confirmModal.open || qaStep !== null || actionLoading !== null;

    return (
        <div className="page-wrapper">
            <Sidebar userRole={userRole} username={username} isOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

            <main className="main-content">
                {/* Header */}
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Monitoramento de Chaves</h1>
                        <p className="page-subtitle">Retiradas, devoluções e transferências em tempo real</p>
                    </div>
                    <div className="dashboard-stats" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div className="stat-chip">
                            <span className="stat-chip-label">Disponíveis</span>
                            <span className="stat-chip-value" style={{ color: 'var(--status-available-text)' }}>{stats.available}</span>
                        </div>
                        <div className="stat-chip">
                            <span className="stat-chip-label">Em Uso</span>
                            <span className="stat-chip-value" style={{ color: 'var(--status-inuse-text)' }}>{stats.inUse}</span>
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

                {/* Pendências inline (REQ-029b): a operação inicia E conclui aqui,
                    sem trocar para /confirm — que permanece como visão completa. */}
                <PendingInline userRole={userRole} userId={userId} />

                {/* Explicação da dupla confirmação (dispensável, contextual) */}
                {showIntro && (
                    <div className="animate-fade" style={{ marginBottom: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.875rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--blue-300)" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
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

                {/* Unified Control Bar — REQ-029a: a busca É a Ação Rápida. Um único
                    campo filtra a lista em tempo real (setSearch no onChange) e age no
                    Enter (sugestões + fluxo de retirada/devolução). O input de busca
                    separado foi removido. */}
                <div className="unified-control-bar" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', background: 'var(--bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', alignItems: 'center' }}>
                    <div className="control-actions" style={{ flex: '1', minWidth: '300px', display: 'flex', alignItems: 'center', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', paddingLeft: '1rem' }}>
                        <div style={{ color: 'var(--accent-primary)', flexShrink: 0 }} aria-hidden="true">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                        </div>

                        {/* Passo 1 — qual a chave */}
                        <div style={{ position: 'relative', flex: 1 }}>
                            <input
                                className="input"
                                placeholder="Buscar ou registrar: qual a chave?"
                                id="unified-key-input"
                                autoComplete="off"
                                role="combobox"
                                aria-label="Buscar ou registrar chave"
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
                                    // REQ-029a: o mesmo campo filtra a lista abaixo em tempo real
                                    // (sincroniza só na digitação — selecionar uma sugestão não
                                    // deve estreitar a lista para a chave escolhida).
                                    setSearch(raw);
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
                                    <div className="dropdown-hint">
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
                                                <div className="dropdown-hint">
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

                    {frequentKeys.length > 0 && (
                        <div className="mobile-quick-chips" role="list" aria-label={isPorteiroOrAdmin ? 'Chaves mais movimentadas' : 'Chaves que você usa com frequência'}>
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
                                <button className="btn btn-ghost btn-sm" style={{ marginTop: '1.25rem' }} onClick={() => { setSearch(''); setQaKey(''); setFilter('all'); }}>
                                    Limpar busca e filtros
                                </button>
                            )}
                        </div>
                    )
                ) : (
                    <>
                        {/* Modo Mobile (Grid Cards) */}
                        <div className="mobile-only">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {filtered.map(key => (
                                    <div
                                        key={key.id}
                                        className={`key-card ${key.pending_info ? 'pending' : key.status === 'in_use' ? 'inuse' : 'available'}`}
                                        onClick={() => selectQaKey(key)}
                                        // Chave disponível não tem botão interno: o card É o alvo — então
                                        // precisa de semântica e teclado (role=button + Enter/Espaço). Nos
                                        // demais estados os botões internos já dão o acesso, e um role=button
                                        // com botões aninhados violaria o ARIA.
                                        {...(key.status === 'available' && !key.pending_info ? {
                                            role: 'button' as const,
                                            tabIndex: 0,
                                            'aria-label': `Retirar chave ${key.name}${key.room ? `, ${key.room}` : ''}`,
                                            onKeyDown: (e: React.KeyboardEvent) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    selectQaKey(key);
                                                }
                                            }
                                        } : {})}
                                    >
                                        <div className="key-card-icon-wrapper">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                                        </div>
                                        
                                        <div className="key-card-content-wrapper">
                                            <div className="key-card-header-row">
                                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, alignItems: 'flex-start', width: '100%' }}>
                                                    {/* Slot FIXO do estado: título + tag na primeira linha, sempre —
                                                        antes a tag caía depois dos botões no card "em uso" (flex-wrap),
                                                        e o dado mais escaneável do produto virava rodapé. */}
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', width: '100%' }}>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div className="key-card-title">{key.name}</div>
                                                            {key.room && <div className="key-card-room">{key.room}</div>}
                                                        </div>
                                                        <span className={`status-tag ${key.pending_info ? 'status-pending' : key.status === 'available' ? 'status-available' : 'status-inuse'}`} style={{ flexShrink: 0, marginTop: '2px' }}>
                                                            {key.pending_info ? 'AGUARDANDO' : (key.status === 'available' ? 'DISPONÍVEL' : 'EM USO')}
                                                        </span>
                                                    </div>

                                                    {key.status === 'in_use' && key.employee_name && !key.pending_info && (
                                                        <div className="key-card-holder animate-fade" style={{ width: '100%' }}>
                                                            <div className="key-card-avatar">
                                                                {key.employee_name[0].toUpperCase()}
                                                            </div>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key.employee_name}</div>
                                                                {key.employee_role && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{key.employee_role}</div>}
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
                                                                <div style={{ fontSize: '0.7rem', color: 'var(--warning-text)', fontWeight: 700 }}>{describePending(key.pending_info)}</div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Cada grupo de ações é uma faixa full-width que absorve o toque
                                                        (stopPropagation no wrapper): errar o botão por poucos px não
                                                        dispara a ação do card — os alvos têm 44px (REQ-016). */}
                                                    {key.pending_info && (isPorteiroOrAdmin || key.pending_info.user_id === userId || key.pending_info.porteiro_id === userId) && (
                                                        <div style={{ display: 'flex', width: '100%' }} onClick={(e) => e.stopPropagation()}>
                                                            <button
                                                                className="key-card-action-btn"
                                                                disabled={cancelLoading === key.pending_info.transaction_id}
                                                                style={{ flex: 1 }}
                                                                onClick={() => handleCancel(key.pending_info!.transaction_id, key.name)}
                                                            >
                                                                {cancelLoading === key.pending_info.transaction_id ? <div className="spinner" style={{ width: 12, height: 12 }} /> : 'Cancelar'}
                                                            </button>
                                                        </div>
                                                    )}
                                                    {key.status === 'in_use' && !key.pending_info && (isPorteiroOrAdmin || key.user_id === userId) && (
                                                        <div style={{ display: 'flex', gap: '0.625rem', width: '100%' }} onClick={(e) => e.stopPropagation()}>
                                                            {/* Devolver carrega a identidade azul da devolução (btn-blue no
                                                                desktop) — antes era ghost neutro só no mobile. */}
                                                            <button
                                                                className="key-card-action-btn"
                                                                onClick={() => requestTransaction(key.id, 'return')}
                                                                style={{ flex: 1, border: '1px solid var(--blue-500)', background: 'var(--blue-700)', color: '#fff' }}
                                                            >
                                                                Devolver
                                                            </button>
                                                            <button
                                                                className="key-card-action-btn"
                                                                onClick={() => {
                                                                    setConfirmModal({
                                                                        open: true,
                                                                        keyId: key.id,
                                                                        keyName: key.name,
                                                                        type: 'transfer'
                                                                    });
                                                                }}
                                                                style={{ flex: 1, border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
                                                            >
                                                                Transferir
                                                            </button>
                                                        </div>
                                                    )}
                                                    {key.status === 'in_use' && !key.pending_info && !isPorteiroOrAdmin && key.user_id !== userId && (
                                                        <div style={{ display: 'flex', width: '100%' }} onClick={(e) => e.stopPropagation()}>
                                                            <button
                                                                className="key-card-action-btn"
                                                                onClick={() => openRequestModal(key)}
                                                                style={{ flex: 1, border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
                                                            >
                                                                Solicitar
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Modo Desktop (Lista) */}
                        <div className="desktop-only">
                        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                            {/* Grid do cabeçalho e das linhas vem da classe (globals) — uma definição só */}
                            <div className="dashboard-list-header">
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
                                    <div key={key.id} className={`list-row-hover dashboard-list-row ${key.pending_info ? 'row-pending' : key.status === 'available' ? 'row-available' : 'row-inuse'}`}>
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
                                                    {/* Azul institucional p/ "pessoa" (One Voice Rule) — o verde sólido media 3,2:1 com o branco */}
                                                    <div style={{ width: '32px', height: '32px', background: 'var(--blue-700)', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 900, flexShrink: 0, border: '2px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                                                        {key.employee_name?.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{key.employee_name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{key.employee_role || 'Usuário'}</div>
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
                                                (isPorteiroOrAdmin || key.pending_info.user_id === userId || key.pending_info.porteiro_id === userId) ? (
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
                                                // A coluna "Ações" tem largura fixa (120px). Com dois botões
                                                // (Devolver + Transferir), a linha ultrapassava a coluna e gerava
                                                // scroll horizontal na visão porteiro (REQ-016). flexWrap permite
                                                // que os botões empilhem quando não cabem lado a lado, sem estourar.
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                    {(isPorteiroOrAdmin || key.user_id === userId) && (
                                                        <>
                                                            <button
                                                                className="btn btn-blue btn-sm"
                                                                disabled={actionLoading === key.id}
                                                                onClick={() => requestTransaction(key.id, 'return')}
                                                                style={{ padding: '0.4rem 1.25rem' }}
                                                            >
                                                                Devolver
                                                            </button>
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
                                                        </>
                                                    )}
                                                    {!isPorteiroOrAdmin && key.user_id !== userId && (
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            disabled={actionLoading === key.id}
                                                            onClick={() => openRequestModal(key)}
                                                            style={{ padding: '0.4rem 1.25rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
                                                        >
                                                            Solicitar
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        </div>
                    </>
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
                            {touchSelectModal.suggestions.filter(u => normalize(u.name).includes(normalize(touchSelectModal.searchStr))).map(u => (
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
                    <div ref={modalBoxRef} role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" onClick={e => e.stopPropagation()} onKeyDown={handleModalKeyDown} style={{ background: 'var(--bg-card)', width: '100%', maxWidth: '400px', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflowX: 'hidden', overflowY: 'auto', maxHeight: '90dvh', animation: 'slideUp 0.25s ease' }}>
                        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                            {/* Chips de ícone: tokens --chip-* (par fundo+traço com override light) —
                                antes usavam pastéis claros fixos e --purple-* inexistentes (ícone invisível). */}
                            <div style={{ width: '48px', height: '48px', background: confirmModal.type === 'withdraw' ? 'var(--chip-green-bg)' : (confirmModal.type === 'transfer' || confirmModal.type === 'request') ? 'var(--chip-purple-bg)' : 'var(--chip-blue-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                {confirmModal.type === 'withdraw' ? (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--chip-green-fg)" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                                ) : confirmModal.type === 'transfer' ? (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--chip-purple-fg)" strokeWidth="2.5"><path d="M17 3l4 4-4 4 M3 17l4 4 4-4 M21 7H3 M3 17h18"/></svg>
                                ) : confirmModal.type === 'request' ? (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--chip-purple-fg)" strokeWidth="2.5"><path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
                                ) : (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--chip-blue-fg)" strokeWidth="2.5"><path d="M12 2v20m-5-5l5 5 5-5"/></svg>
                                )}
                            </div>
                            <h3 id="confirm-modal-title" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                                {confirmModal.type === 'transfer' ? 'Transferir Chave?'
                                    : confirmModal.type === 'request' ? 'Solicitar esta Chave?'
                                    : `Solicitar ${confirmModal.type === 'withdraw' ? 'Retirada' : 'Devolução'}?`}
                            </h3>

                            {confirmModal.type === 'request' ? (
                                <div style={{ textAlign: 'left', marginTop: '1rem' }}>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.25rem' }}>
                                        Solicitar a chave <strong style={{ color: 'var(--text-primary)' }}>&quot;{confirmModal.keyName}&quot;</strong>
                                        {confirmModal.holderName && <span> que está com <strong style={{ color: 'var(--chip-purple-fg)' }}>{confirmModal.holderName}</strong></span>}.
                                        <br/><span style={{ fontSize: '0.8rem', opacity: 0.85, display: 'inline-block', marginTop: '0.5rem' }}>O portador precisa aceitar na aba <strong style={{ color: 'var(--text-secondary)' }}>Confirmações</strong> para a chave passar para você.</span>
                                    </p>
                                    <div>
                                        <label className="field-label">Observação (opcional)</label>
                                        <input
                                            type="text"
                                            value={customJustification}
                                            onChange={e => setCustomJustification(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAction(); } }}
                                            placeholder="Ex: Preciso usar a sala agora"
                                            className="input"
                                            style={{ width: '100%', padding: '0.6rem', fontSize: '0.85rem', border: '1px solid var(--border-strong)' }}
                                        />
                                    </div>
                                </div>
                            ) : confirmModal.type === 'transfer' ? (
                                <div style={{ textAlign: 'left', marginTop: '1rem' }}>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.25rem' }}>
                                        Transferir a chave <strong style={{ color: 'var(--text-primary)' }}>&quot;{confirmModal.keyName}&quot;</strong> diretamente para outro usuário.
                                    </p>
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <label className="field-label">Para quem?</label>
                                        <UserSelector 
                                            users={employees} 
                                            selectedId={transferTargetId} 
                                            onSelect={(uid) => setTransferTargetId(uid)}
                                        />
                                    </div>
                                    <div>
                                        <label className="field-label">Observação (opcional)</label>
                                        <input
                                            type="text"
                                            value={customJustification}
                                            onChange={e => setCustomJustification(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAction(); } }}
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
                                    
                                    {/* Bypass UI — força a atribuição (withdraw) ou a devolução (return) de qualquer chave em uso (REQ-028) */}
                                    {((confirmModal.type === 'withdraw' || confirmModal.type === 'return') && isPorteiroOrAdmin) && (
                                        <div style={{ marginTop: '1rem', textAlign: 'left', background: 'var(--bg-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>

                                    {/* minHeight 44: o label inteiro é o alvo de toque do controle mais
                                        sensível do modal (o checkbox sozinho tinha ~16px). */}
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, minHeight: 'var(--touch-target)' }}>
                                        <input
                                            type="checkbox"
                                            checked={bypassConfirmation}
                                            onChange={(e) => {
                                                setBypassConfirmation(e.target.checked);
                                                if (!e.target.checked) setJustification('');
                                            }}
                                            style={{ accentColor: confirmModal.type === 'withdraw' ? 'var(--green-500)' : 'var(--blue-500)', width: '18px', height: '18px', flexShrink: 0 }}
                                        />
                                        {confirmModal.type === 'withdraw' ? 'Atribuir chave imediatamente sem confirmação' : 'Confirmar devolução imediatamente (sem celular)'}
                                    </label>
                                    
                                    {bypassConfirmation && (confirmModal.type === 'withdraw' || confirmModal.type === 'return') && (
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
                                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAction(); } }}
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
                                ref={confirmBtnRef}
                                className={`btn ${confirmModal.type === 'withdraw' ? 'btn-green' : 'btn-blue'}`}
                                onClick={confirmAction}
                            >
                                {bypassConfirmation ? 'Confirmar agora' : 'Enviar solicitação'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
