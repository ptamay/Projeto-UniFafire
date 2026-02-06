'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function Navbar({ isAdmin }: { isAdmin: boolean }) {
    const router = useRouter();
    const pathname = usePathname();
    const [userId, setUserId] = useState<number | null>(null);
    const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

    // Password Form States
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    useEffect(() => {
        // Fetch current user info to enable Password Change
        fetch('/api/auth/me')
            .then(res => {
                if (res.ok) return res.json();
                return null;
            })
            .then(data => {
                if (data && data.id) {
                    setUserId(data.id);
                }
            })
            .catch(console.error);
    }, []);

    const logout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId) return;

        if (newPassword !== confirmPassword) {
            alert('A nova senha e a confirmação não coincidem.');
            return;
        }

        const res = await fetch('/api/users/change-password', {
            method: 'POST',
            body: JSON.stringify({ userId, currentPassword, newPassword }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            alert('Senha alterada com sucesso!');
            setShowChangePasswordModal(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } else {
            const data = await res.json();
            alert(data.error || 'Erro ao alterar senha.');
        }
    };

    return (
        <header style={{ backgroundColor: 'var(--color-navy)', padding: '1rem 0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
            <div className="container header-content">

                {/* Brand */}
                <div
                    className="flex flex-col justify-between md:mb-0 cursor-pointer"
                    onClick={() => router.push('/')}
                    title="Ir para Dashboard"
                >
                    <h1 className="text-white text-xl md:text-2xl" style={{ margin: 0, whiteSpace: 'nowrap' }}>Gestão de Chaves</h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: 0 }}>
                        {isAdmin ? 'Painel Administrativo' : 'Painel do Usuário'}
                    </p>
                </div>

                {/* Navigation - Scrollable on Mobile */}
                <nav className="nav-scroll">
                    <button
                        className={`btn btn-ghost ${pathname === '/' ? 'active' : ''}`}
                        onClick={() => router.push('/')}
                    >
                        Dashboard
                    </button>

                    {isAdmin && (
                        <button
                            className={`btn btn-ghost ${pathname === '/keys' ? 'active' : ''}`}
                            onClick={() => router.push('/keys')}
                        >
                            Chaves
                        </button>
                    )}

                    <button
                        className={`btn btn-ghost ${pathname === '/employees' ? 'active' : ''}`}
                        onClick={() => router.push('/employees')}
                    >
                        Funcionários
                    </button>

                    {isAdmin && (
                        <button
                            className={`btn btn-ghost ${pathname === '/users' ? 'active' : ''}`}
                            onClick={() => router.push('/users')}
                        >
                            Usuários
                        </button>
                    )}

                    {isAdmin && (
                        <button
                            className={`btn btn-ghost ${pathname === '/logs' ? 'active' : ''}`}
                            onClick={() => router.push('/logs')}
                        >
                            Logs
                        </button>
                    )}

                    <button
                        className={`btn btn-ghost ${pathname === '/history' ? 'active' : ''}`}
                        onClick={() => router.push('/history')}
                    >
                        Histórico
                    </button>

                    <div className="hidden md:block" style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255,255,255,0.2)', margin: '0 0.5rem' }}></div>

                    <button
                        className="btn btn-ghost"
                        onClick={() => setShowChangePasswordModal(true)}
                        disabled={!userId}
                        title={!userId ? "Carregando informações..." : "Alterar Senha"}
                    >
                        Senha
                    </button>

                    <button className="btn btn-ghost" onClick={logout} style={{ color: '#fca5a5' }}>
                        Sair
                    </button>
                </nav>
            </div>

            {/* Global Change Password Modal (Managed by Navbar) */}
            {showChangePasswordModal && (
                <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setShowChangePasswordModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3 className="text-navy" style={{ marginBottom: '1.5rem' }}>Alterar Senha</h3>
                        <form onSubmit={handleChangePassword}>
                            <div className="form-group">
                                <label>Senha Atual</label>
                                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label>Nova Senha</label>
                                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label>Confirmar Nova Senha</label>
                                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
                            </div>
                            <div className="flex justify-end gap-4 mt-6">
                                <button type="button" className="btn btn-outline-navy justify-center" onClick={() => setShowChangePasswordModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary justify-center">Alterar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </header>
    );
}
