'use client';
import { useState } from 'react';
import Sidebar from '@/app/components/Sidebar';
import toast from 'react-hot-toast';

interface SecurityClientProps {
    userRole: string;
    username: string;
}

export default function SecurityClient({ userRole, username }: SecurityClientProps) {
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (formData.newPassword !== formData.confirmPassword) {
            toast.error('A nova senha e a confirmação não coincidem');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/account/security/password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPassword: formData.currentPassword,
                    newPassword: formData.newPassword
                })
            });
            const data = await res.json();
            
            if (!res.ok) {
                toast.error(data.error || 'Erro ao trocar a senha');
            } else {
                toast.success('Senha atualizada com sucesso! Outros dispositivos foram desconectados.');
                setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                // Limpa o form após sucesso
            }
        } catch {
            toast.error('Erro de conexão');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="layout-container">
            <Sidebar 
                userRole={userRole} 
                username={username} 
                isOpen={isSidebarOpen} 
                onMobileClose={() => setSidebarOpen(false)} 
            />
            
            <div className="main-content">
                <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button 
                        className="mobile-menu-toggle"
                        onClick={() => setSidebarOpen(true)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'none' }}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
                        </svg>
                    </button>
                    <div>
                        <h1 className="page-title">Segurança</h1>
                        <p className="page-subtitle">Altere sua senha e gerencie a segurança da sua conta</p>
                    </div>
                </header>

                <div className="content-grid" style={{ maxWidth: '600px' }}>
                    <div className="glass-card" style={{ padding: '2rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Trocar Senha</h2>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            
                            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label className="form-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Senha Atual</label>
                                <input 
                                    type="password"
                                    className="form-input" 
                                    name="currentPassword"
                                    value={formData.currentPassword} 
                                    onChange={handleChange} 
                                    placeholder="Digite sua senha atual"
                                    required
                                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                                />
                            </div>
                            
                            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label className="form-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Nova Senha</label>
                                <input 
                                    type="password"
                                    className="form-input" 
                                    name="newPassword"
                                    value={formData.newPassword} 
                                    onChange={handleChange} 
                                    placeholder="No mínimo 8 caracteres"
                                    required
                                    minLength={8}
                                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                                />
                            </div>
                            
                            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label className="form-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Confirmar Nova Senha</label>
                                <input 
                                    type="password"
                                    className="form-input" 
                                    name="confirmPassword"
                                    value={formData.confirmPassword} 
                                    onChange={handleChange} 
                                    placeholder="Digite a nova senha novamente"
                                    required
                                    minLength={8}
                                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                                />
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                                <button 
                                    type="submit" 
                                    className="btn btn-primary" 
                                    disabled={loading}
                                    style={{ padding: '0.75rem 1.5rem', background: 'var(--blue-600)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600 }}
                                >
                                    {loading ? 'Atualizando...' : 'Atualizar Senha'}
                                </button>
                            </div>
                            
                        </form>
                    </div>
                </div>
            </div>
            <style jsx>{`
                @media (max-width: 768px) {
                    .mobile-menu-toggle { display: block !important; }
                }
            `}</style>
        </div>
    );
}
