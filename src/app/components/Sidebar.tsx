'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';

interface SidebarProps {
    userRole: string;
    username?: string;
    onMobileClose?: () => void;
    isOpen?: boolean;
}

const navItems = [
    {
        section: 'Principal',
        items: [
            { href: '/', label: 'Dashboard', icon: 'grid', roles: ['ADMIN','GESTOR','PORTEIRO','FUNCIONARIO','ALUNO'] },
            { href: '/confirm', label: 'Confirmações', icon: 'check-circle', roles: ['ADMIN','GESTOR','PORTEIRO','FUNCIONARIO','ALUNO'] },
            { href: '/keys', label: 'Chaves', icon: 'key', roles: ['ADMIN','GESTOR','PORTEIRO'] },
        ]
    },
    {
        section: 'Registros',
        items: [
            { href: '/history', label: 'Histórico', icon: 'clock', roles: ['ADMIN','GESTOR','PORTEIRO'] },
        ]
    },
    {
        section: 'Administração',
        items: [
            { href: '/users', label: 'Usuários', icon: 'shield', roles: ['ADMIN','GESTOR'] },
            { href: '/logs', label: 'Logs', icon: 'file-text', roles: ['ADMIN','GESTOR'] },
            { href: '/settings', label: 'Configurações', icon: 'settings', roles: ['ADMIN','GESTOR'] },
        ]
    },
];

function Icon({ name, size = 20 }: { name: string; size?: number }) {
    const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    switch (name) {
        case 'grid': return <svg {...props}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
        case 'check-circle': return <svg {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
        case 'key': return <svg {...props}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>;
        case 'users': return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
        case 'user': return <svg {...props}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
        case 'clock': return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
        case 'shield': return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
        case 'file-text': return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
        case 'settings': return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
        case 'log-out': return <svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
        case 'sun': return <svg {...props}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
        case 'moon': return <svg {...props}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
        case 'more': return <svg {...props}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>;
        default: return null;
    }
}

export default function Sidebar({ userRole, username, onMobileClose, isOpen }: SidebarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    // TASK-023: o Sidebar é dono do próprio estado de drawer mobile — o botão da
    // topbar funciona em TODAS as telas, mesmo nas que não passam isOpen/onMobileClose.
    const [mobileOpen, setMobileOpen] = useState(false);
    const drawerOpen = Boolean(isOpen) || mobileOpen;
    const closeMobile = () => {
        setMobileOpen(false);
        onMobileClose?.();
    };

    useEffect(() => {
        // Sincronização única com localStorage (estado externo) na montagem —
        // intencional para evitar mismatch de hidratação SSR (tema só existe no cliente).
        const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
        if (savedTheme) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setTheme(savedTheme);
            if (savedTheme === 'light') document.documentElement.classList.add('light-mode');
        }
        const savedCollapse = localStorage.getItem('sidebar-collapsed') === 'true';
        setIsCollapsed(savedCollapse);
        if (savedCollapse) document.documentElement.classList.add('sidebar-collapsed');
        setMounted(true);
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        if (newTheme === 'light') {
            document.documentElement.classList.add('light-mode');
        } else {
            document.documentElement.classList.remove('light-mode');
        }
    };

    const toggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem('sidebar-collapsed', String(newState));
        if (newState) {
            document.documentElement.classList.add('sidebar-collapsed');
        } else {
            document.documentElement.classList.remove('sidebar-collapsed');
        }
    };

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
    };

    useEffect(() => {
        const checkAutoLogout = async () => {
            try {
                const res = await fetch('/api/settings');
                if (!res.ok) return;
                const data = await res.json();
                if (data.autoLogoutTime) {
                    const checkInterval = setInterval(() => {
                        const now = new Date();
                        const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                        if (currentHHMM === data.autoLogoutTime) {
                            handleLogout();
                        }
                    }, 60000);
                    return () => clearInterval(checkInterval);
                }
            } catch {
                // Silently ignore if settings fetch fails or is blocked (e.g. USER role without permission)
            }
        };
        checkAutoLogout();
    }, []);

    const navigate = (href: string) => {
        router.push(href);
        closeMobile();
    };

    const roleBadgeMap: Record<string, string> = {
        ADMIN: 'badge-admin',
        GESTOR: 'badge-gestor',
        PORTEIRO: 'badge-porteiro',
        FUNCIONARIO: 'badge-funcionario',
        ALUNO: 'badge-aluno',
    };
    const roleLabelMap: Record<string, string> = {
        ADMIN: 'Administrador',
        GESTOR: 'Gestor',
        PORTEIRO: 'Porteiro',
        FUNCIONARIO: 'Funcionário',
        ALUNO: 'Aluno',
    };
    const roleBadge = roleBadgeMap[userRole] || 'badge-user';
    const roleLabel = roleLabelMap[userRole] || userRole;

    useEffect(() => {
        const fetchPendingCount = async () => {
            try {
                const res = await fetch('/api/transactions/pending');
                if (res.ok) {
                    const data = await res.json();
                    setPendingCount(Array.isArray(data) ? data.length : 0);
                }
            } catch { /* silencioso — badge de pendências é best-effort */ }
        };
        fetchPendingCount();
        const handleUpdate = () => fetchPendingCount();
        window.addEventListener('pending-transactions-updated', handleUpdate);
        // Mesmo ritmo do Dashboard/Confirmações (3s) — o evento cobre a mesma aba,
        // mas o badge também precisa refletir rápido pedidos/devoluções feitos
        // por OUTRO dispositivo, que só chegam via polling.
        const interval = setInterval(fetchPendingCount, 3000);
        return () => {
            clearInterval(interval);
            window.removeEventListener('pending-transactions-updated', handleUpdate);
        };
    }, []);

    // Itens visíveis por papel
    const allVisibleItems = navItems.flatMap(s => s.items).filter(i => i.roles.includes(userRole));

    // Barra inferior mobile: as 3 ações mais usadas + botão "Mais" (abre o drawer completo).
    const primaryItems = allVisibleItems.slice(0, 3);

    const currentPageTitle = allVisibleItems.find(i => i.href === pathname)?.label || 'Sistema de Gestão de Chaves';

    return (
        <>
            {/* ── MOBILE SIDEBAR DRAWER OVERLAY ── */}
            {drawerOpen && <div className="sidebar-overlay active" onClick={closeMobile} />}

            {/* ── SIDEBAR LATERAL (Desktop + Drawer Mobile) ── */}
            <aside className={`sidebar${drawerOpen ? ' open' : ''}`}>
                {/* Logo Header */}
                <div className="sidebar-logo" style={{ justifyContent: isCollapsed ? 'center' : 'space-between' }}>
                    {!isCollapsed && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1, overflow: 'hidden' }}>
                            <Image src="/logo/unifafire_logo.png" alt="UniFAFIRE" width={44} height={44} style={{ objectFit: 'contain', flexShrink: 0 }} />
                            <div className="sidebar-logo-text">
                                <div style={{ whiteSpace: 'nowrap', fontWeight: 800, letterSpacing: '-0.01em' }}>Sistema de</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--green-200)', whiteSpace: 'nowrap', marginTop: '2px', opacity: 0.8 }}>Gestão de Chaves</div>
                            </div>
                        </div>
                    )}
                    <button
                        className="btn-toggle-sidebar"
                        onClick={toggleCollapse}
                        aria-label={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
                        aria-expanded={!isCollapsed}
                        style={{ background: 'transparent', border: 'none', color: '#5b7ab8', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none', transition: '0.3s' }}>
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                    </button>
                </div>

                {/* Nav Items */}
                <nav className="sidebar-nav">
                    {navItems.map(section => {
                        const visible = section.items.filter(i => i.roles.includes(userRole));
                        if (!visible.length) return null;
                        return (
                            <div key={section.section}>
                                <div className="nav-section-title">{section.section}</div>
                                {visible.map(item => (
                                    <button
                                        key={item.href}
                                        className={`nav-item${pathname === item.href ? ' active' : ''}`}
                                        onClick={() => navigate(item.href)}
                                        title={isCollapsed ? item.label : ''}
                                    >
                                        <span className="nav-icon" style={{ position: 'relative' }}>
                                            <Icon name={item.icon} size={18} />
                                            {item.href === '/confirm' && pendingCount > 0 && (
                                                <span style={{
                                                    position: 'absolute', top: -2, right: -2,
                                                    width: 10, height: 10,
                                                    background: 'var(--danger)', borderRadius: '50%',
                                                    border: '2px solid var(--blue-900)',
                                                    boxShadow: '0 0 8px var(--danger-bg)'
                                                }} />
                                            )}
                                        </span>
                                        <span className="nav-item-text" style={{ marginLeft: '0.125rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                                            {item.label}
                                            {item.href === '/confirm' && pendingCount > 0 && !isCollapsed && (
                                                <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', borderRadius: '10px', marginLeft: 'auto' }}>
                                                    {pendingCount}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        );
                    })}
                </nav>

                {/* Footer: tema + perfil + logout */}
                <div className="sidebar-footer">
                    <button className="nav-item" onClick={toggleTheme} style={{ marginBottom: '0.5rem' }}>
                        <span className="nav-icon" style={{ width: 32, display: 'flex', justifyContent: 'center' }}>
                            {theme === 'dark' ? <Icon name="sun" size={18} /> : <Icon name="moon" size={18} />}
                        </span>
                        {!isCollapsed && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, marginLeft: '0.75rem' }}>
                                <span className="nav-item-text">Modo {theme === 'dark' ? 'Claro' : 'Escuro'}</span>
                                <div style={{ width: 32, height: 16, background: theme === 'light' ? 'var(--green-500)' : 'var(--blue-700)', borderRadius: 99, position: 'relative' }}>
                                    <div style={{ width: 12, height: 12, background: '#fff', borderRadius: '50%', position: 'absolute', top: 2, left: theme === 'light' ? 18 : 2, transition: mounted ? '0.3s' : 'none' }} />
                                </div>
                            </div>
                        )}
                    </button>

                    {/* Seção de Perfil e Menu do Usuário */}
                    <div style={{ position: 'relative' }}>
                        <button 
                            className="user-profile-compact" 
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                            style={{ 
                                width: '100%', display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.75rem 0.875rem', 
                                marginBottom: '0.625rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', 
                                justifyContent: isCollapsed ? 'center' : 'flex-start', cursor: 'pointer', border: 'none', textAlign: 'left'
                            }}
                        >
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--green-600), var(--green-300))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 700, color: '#ffffff', flexShrink: 0 }}>
                                {username?.[0]?.toUpperCase() || 'U'}
                            </div>
                            {!isCollapsed && (
                                <div style={{ flex: 1, minWidth: 0 }} className="user-info-text">
                                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: '0.625rem' }}>{username || 'Usuário'}</div>
                                    <span className={`badge ${roleBadge}`} style={{ marginTop: '2px', display: 'inline-flex' }}>{roleLabel}</span>
                                </div>
                            )}
                            {!isCollapsed && (
                                <div style={{ color: 'var(--text-muted)' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isUserMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </div>
                            )}
                        </button>

                        {/* Dropdown Menu */}
                        {isUserMenuOpen && (
                            <div style={{ 
                                background: 'rgba(15, 29, 87, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-sm)', 
                                padding: '0.5rem', marginBottom: '0.5rem',
                                position: isCollapsed ? 'absolute' : 'static',
                                bottom: isCollapsed ? '100%' : 'auto',
                                left: isCollapsed ? 0 : 'auto',
                                width: isCollapsed ? '200px' : '100%',
                                zIndex: 50
                            }}>
                                <button className="nav-item" onClick={() => navigate('/account/profile')} style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', marginBottom: '2px' }}>
                                    <span className="nav-icon"><Icon name="user" size={16} /></span>
                                    <span className="nav-item-text" style={{ fontSize: '0.8125rem' }}>Meu Perfil</span>
                                </button>
                                <button className="nav-item" onClick={() => navigate('/account/security')} style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem', marginBottom: '2px' }}>
                                    <span className="nav-icon"><Icon name="shield" size={16} /></span>
                                    <span className="nav-item-text" style={{ fontSize: '0.8125rem' }}>Segurança</span>
                                </button>
                                <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                                <button className="nav-item" onClick={handleLogout} style={{ color: 'var(--danger-text)', width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem' }}>
                                    <span className="nav-icon"><Icon name="log-out" size={16} /></span>
                                    <span className="nav-item-text" style={{ fontSize: '0.8125rem' }}>Sair</span>
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {!isUserMenuOpen && (
                        <button className="nav-item" onClick={handleLogout} style={{ color: 'var(--danger-text)', width: '100%', justifyContent: isCollapsed ? 'center' : 'flex-start', marginTop: isCollapsed ? '0' : '0.5rem' }}>
                            <span className="nav-icon"><Icon name="log-out" size={18} /></span>
                            <span className="nav-item-text">Sair</span>
                        </button>
                    )}
                </div>
            </aside>

            {/* ── MOBILE TOP BAR ── */}
            <div className="mobile-topbar">
                <button
                    onClick={() => setMobileOpen(true)}
                    id="mobile-menu-btn"
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', minWidth: 44, minHeight: 44, WebkitTapHighlightColor: 'transparent' }}
                    aria-label="Abrir menu"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="3" y1="6" x2="21" y2="6"/>
                        <line x1="3" y1="12" x2="21" y2="12"/>
                        <line x1="3" y1="18" x2="21" y2="18"/>
                    </svg>
                </button>

                <div className="mobile-topbar-brand">
                    <span className="mobile-topbar-title">{currentPageTitle}</span>
                </div>

                <button
                    onClick={toggleTheme}
                    data-tooltip={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
                    data-tooltip-pos="bottom"
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', minWidth: 44, minHeight: 44, WebkitTapHighlightColor: 'transparent' }}
                    aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
                >
                    {theme === 'dark' ? <Icon name="sun" size={20} /> : <Icon name="moon" size={20} />}
                </button>
            </div>

            {/* ── BARRA DE NAVEGAÇÃO INFERIOR (Mobile) ──
                Acesso 1-toque às ações mais usadas da portaria, sem abrir o drawer.
                O botão "Mais" abre o drawer com o menu completo (perfil, admin, sair). */}
            <nav className="mobile-bottom-nav" aria-label="Navegação rápida">
                {primaryItems.map(item => {
                    const isActive = pathname === item.href;
                    const showBadge = item.href === '/confirm' && pendingCount > 0;
                    return (
                        <button
                            key={item.href}
                            className={`bottom-nav-item${isActive ? ' active' : ''}`}
                            onClick={() => navigate(item.href)}
                            aria-current={isActive ? 'page' : undefined}
                            aria-label={showBadge ? `${item.label}, ${pendingCount} pendente${pendingCount > 1 ? 's' : ''}` : item.label}
                        >
                            <Icon name={item.icon} size={22} />
                            {showBadge && (
                                <span className="bottom-nav-badge" aria-hidden="true">
                                    {pendingCount > 9 ? '9+' : pendingCount}
                                </span>
                            )}
                            <span className="bottom-nav-label">{item.label}</span>
                        </button>
                    );
                })}
                <button
                    className={`bottom-nav-item${drawerOpen ? ' active' : ''}`}
                    onClick={() => setMobileOpen(true)}
                    aria-label="Abrir menu completo"
                    aria-haspopup="menu"
                    aria-expanded={drawerOpen}
                >
                    <Icon name="more" size={22} />
                    <span className="bottom-nav-label">Mais</span>
                </button>
            </nav>

        </>
    );
}
