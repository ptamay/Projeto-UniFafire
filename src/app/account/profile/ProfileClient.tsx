'use client';
import { useState } from 'react';
import Sidebar from '@/app/components/Sidebar';
import toast from 'react-hot-toast';

interface ProfileClientProps {
    userRole: string;
    username: string;
    initialData: { full_name?: string; matricula?: string; phone?: string };
}

export default function ProfileClient({ userRole, username, initialData }: ProfileClientProps) {
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        full_name: initialData.full_name || '',
        matricula: initialData.matricula || '',
        phone: initialData.phone || ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch('/api/account/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Erro ao atualizar perfil');
            } else {
                toast.success('Perfil atualizado com sucesso!');
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
                        <h1 className="page-title">Meu Perfil</h1>
                        <p className="page-subtitle">Gerencie suas informações pessoais</p>
                    </div>
                </header>

                <div className="content-grid" style={{ maxWidth: '600px' }}>
                    <div className="glass-card" style={{ padding: '2rem' }}>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            
                            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label className="form-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Nome Completo</label>
                                <input 
                                    className="form-input" 
                                    name="full_name"
                                    value={formData.full_name} 
                                    onChange={handleChange} 
                                    placeholder="Digite seu nome completo"
                                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                                />
                            </div>
                            
                            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label className="form-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Telefone de Contato</label>
                                <input 
                                    className="form-input" 
                                    name="phone"
                                    value={formData.phone} 
                                    onChange={handleChange} 
                                    placeholder="(00) 00000-0000"
                                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
                                />
                            </div>
                            
                            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label className="form-label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Matrícula</label>
                                <input 
                                    className="form-input" 
                                    name="matricula"
                                    value={formData.matricula} 
                                    onChange={handleChange} 
                                    placeholder="Nº de Matrícula (opcional)"
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
                                    {loading ? 'Salvando...' : 'Salvar Alterações'}
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
