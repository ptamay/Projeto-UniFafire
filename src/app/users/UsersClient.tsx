'use client';
import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import ConfirmModal from '../components/ConfirmModal';
import toast from 'react-hot-toast';

type User = { 
    id: number; 
    username: string; 
    role: string; 
    full_name?: string;
    matricula?: string;
    phone?: string;
};

const ROLES = [
    { value: 'ADMIN', label: 'Administrador', color: '#ef4444', desc: 'Acesso total ao sistema' },
    { value: 'GESTOR', label: 'Gestor', color: '#8b5cf6', desc: 'Gerencia o sistema' },
    { value: 'PORTEIRO', label: 'Porteiro', color: '#3b82f6', desc: 'Operação de chaves' },
    { value: 'FUNCIONARIO', label: 'Funcionário', color: '#f59e0b', desc: 'Confirma retirada/devolução' },
    { value: 'ALUNO', label: 'Aluno', color: '#10b981', desc: 'Confirma retirada/devolução' },
];

const ROLE_BADGE_CLASS: Record<string, string> = {
    ADMIN: 'badge-admin',
    GESTOR: 'badge-gestor',
    PORTEIRO: 'badge-porteiro',
    FUNCIONARIO: 'badge-funcionario',
    ALUNO: 'badge-aluno',
};

const maskMatricula = (v: string) => v.replace(/\D/g, '').slice(0, 9);

const maskPhone = (v: string) => {
    v = v.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10) return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    if (v.length > 6) return v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    if (v.length > 2) return v.replace(/(\d{2})(\d{0,4})/, '($1) $2');
    if (v.length > 0) return `(${v}`;
    return v;
};

interface Props {
    userRole: string;
    username: string;
}

export default function UsersClient({ userRole, username }: Props) {
    const [users, setUsers] = useState<User[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editUser, setEditUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({ username: '', role: 'FUNCIONARIO', full_name: '', matricula: '', phone: '' });
    const [saving, setSaving] = useState(false);
    const [deleteModal, setDeleteModal] = useState<User | null>(null);
    const [resetModal, setResetModal] = useState<User | null>(null);
    const [resetPass, setResetPass] = useState('');
    const [sysDefaultPass, setSysDefaultPass] = useState('unifafire123');
    const [filterRole, setFilterRole] = useState('all');
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetch('/api/users').then(r => r.json()).then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false); });
        fetch('/api/settings').then(r => r.json()).then(d => {
            if (d.defaultResetPassword) setSysDefaultPass(d.defaultResetPassword);
        });
    }, []);

    const openNew = () => {
        setEditUser(null);
        setFormData({ username: '', role: 'FUNCIONARIO', full_name: '', matricula: '', phone: '' });
        setShowForm(true);
    };

    const openEdit = (u: User) => {
        setEditUser(u);
        setFormData({ username: u.username, role: u.role, full_name: u.full_name || '', matricula: u.matricula || '', phone: u.phone || '' });
        setShowForm(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (editUser) {
                // Update user info
                const res = await fetch('/api/users', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: editUser.id, full_name: formData.full_name, matricula: formData.matricula, phone: formData.phone, role: formData.role })
                });
                const data = await res.json();
                if (res.ok) {
                    setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, ...formData } : u));
                    toast.success('Usuário atualizado!');
                    setShowForm(false);
                } else { toast.error(data.error || 'Erro ao atualizar.'); }
            } else {
                // Create new user
                const payload = { ...formData };
                if (!payload.username) delete (payload as any).username;
                
                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok) {
                    setUsers(prev => [...prev, { id: data.id, ...formData, username: data.username }]);
                    toast.success(data.reactivated ? `Usuário reativado: @${data.username}` : `Usuário criado: @${data.username}`);
                    setShowForm(false);
                } else { toast.error(data.error || 'Erro ao criar usuário.'); }
            }
        } catch { toast.error('Erro de conexão.'); }
        setSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteModal) return;
        try {
            const res = await fetch('/api/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteModal.id }) });
            const data = await res.json();
            if (res.ok) { setUsers(prev => prev.filter(u => u.id !== deleteModal.id)); toast.success('Usuário removido.'); }
            else { toast.error(data.error || 'Erro ao remover.'); }
        } catch { toast.error('Erro de conexão.'); }
        setDeleteModal(null);
    };

    const handleResetPass = async () => {
        if (!resetModal) return;

        try {
            const res = await fetch('/api/users/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: resetModal.id })
            });
            const data = await res.json();
            if (res.ok) { toast.success('Senha redefinida para o padrão!'); }
            else { toast.error(data.error || 'Erro.'); }
        } catch { toast.error('Erro de conexao.'); }
        setResetModal(null);
    };

    const filteredUsers = users.filter(u => {
        const matchRole = filterRole === 'all' || u.role === filterRole;
        const matchSearch = !search || 
            u.username.toLowerCase().includes(search.toLowerCase()) ||
            (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
            (u.matricula || '').toLowerCase().includes(search.toLowerCase());
        return matchRole && matchSearch;
    });

    const selectedRole = ROLES.find(r => r.value === formData.role);

    return (
        <div className="page-wrapper">
            <Sidebar userRole={userRole} username={username} isOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
            

            <main className="main-content animate-fade">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Usuários do Sistema</h1>
                        <p className="page-subtitle">Gerencie acessos e perfis de todos os usuários</p>
                    </div>
                    <button className="btn btn-green" onClick={openNew}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Novo Usuário
                    </button>
                </div>

                {/* Role Stats */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    {ROLES.map(r => {
                        const count = users.filter(u => u.role === r.value).length;
                        return (
                            <div key={r.value} style={{
                                background: 'var(--bg-card)',
                                border: `1px solid ${filterRole === r.value ? r.color : 'var(--border)'}`,
                                borderRadius: 'var(--radius-md)',
                                padding: '0.75rem 1.25rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: filterRole === r.value ? `0 0 0 2px ${r.color}33` : 'none',
                                display: 'flex', alignItems: 'center', gap: '0.75rem'
                            }} onClick={() => setFilterRole(filterRole === r.value ? 'all' : r.value)}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                                <div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.label}</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{count}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Search bar */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center' }}>
                    <div className="search-bar" style={{ maxWidth: 360 }}>
                        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input className="input" style={{ paddingLeft: '2.5rem' }} placeholder="Buscar por nome, usuário ou matrícula..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    {filterRole !== 'all' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setFilterRole('all')}>
                            Limpar filtro
                        </button>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{filteredUsers.length} usuário{filteredUsers.length !== 1 ? 's' : ''}</span>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>
                ) : (
                    <div className="table-wrapper card">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Usuário</th>
                                    <th>Nome Completo</th>
                                    <th>Matrícula</th>
                                    <th>Perfil</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Nenhum usuário encontrado.</td></tr>
                                ) : filteredUsers.map(u => (
                                    <tr key={u.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--blue-700), var(--blue-400))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 700, color: '#ffffff', flexShrink: 0 }}>
                                                    {(u.full_name || u.username)[0].toUpperCase()}
                                                </div>
                                                <span style={{ fontWeight: 600 }}>@{u.username}</span>
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{u.full_name || '—'}</td>
                                        <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.85rem' }}>{u.matricula || '—'}</td>
                                        <td><span className={`badge ${ROLE_BADGE_CLASS[u.role] || 'badge-user'}`}>{ROLES.find(r => r.value === u.role)?.label || u.role}</span></td>
                                        <td>
                                            <div className="action-row" style={{ justifyContent: 'flex-end' }}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                    Editar
                                                </button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => { setResetModal(u); setResetPass(''); }}>
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                                    Redefinir
                                                </button>
                                                <button className="btn btn-danger btn-sm" onClick={() => setDeleteModal(u)}>
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                                                    Remover
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>

            {/* Create / Edit Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editUser ? `Editar — @${editUser.username}` : 'Novo Usuário'}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowForm(false)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">Nome e Sobrenome {editUser ? '' : '*'}</label>
                                <input className="input" value={formData.full_name} onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))} placeholder="ex: João da Silva Pereira" required={!editUser} />
                                {!editUser && formData.full_name.trim().length > 2 && (
                                    <span style={{ fontSize: '0.8rem', color: 'var(--blue-400)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                        O nome de usuário gerado será algo parecido com: <strong>@{(() => {
                                            const parts = formData.full_name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").split(/\s+/);
                                            const first = parts[0] || '';
                                            const last = parts.length > 1 ? parts[parts.length - 1] : '';
                                            return `${first[0]}${last}`;
                                        })()}</strong>
                                    </span>
                                )}
                            </div>
                            {editUser && (
                                <div className="input-group">
                                    <label className="input-label">Nome de Usuário (somente leitura)</label>
                                    <input className="input" value={formData.username} disabled />
                                </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="input-group">
                                    <label className="input-label">Matrícula {formData.role === 'ALUNO' ? '*' : '(opcional)'}</label>
                                    <input className="input" value={formData.matricula} onChange={e => setFormData(p => ({ ...p, matricula: maskMatricula(e.target.value) }))} placeholder="ex: 202400123" required={formData.role === 'ALUNO'} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Telefone (WhatsApp)</label>
                                    <input className="input" value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: maskPhone(e.target.value) }))} placeholder="ex: (81) 99999-9999" />
                                </div>
                            </div>
                            <div className="input-group">
                                <label className="input-label">Perfil de Acesso *</label>
                                <select className="input" value={formData.role} onChange={e => setFormData(p => ({ ...p, role: e.target.value }))}>
                                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
                                </select>
                            </div>
                            {selectedRole && (
                                <div style={{ padding: '0.75rem', background: `${selectedRole.color}15`, border: `1px solid ${selectedRole.color}40`, borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    <strong style={{ color: selectedRole.color }}>⬤ {selectedRole.label}:</strong> {selectedRole.desc}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-green" disabled={saving}>
                                    {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : (editUser ? 'Salvar Alterações' : 'Criar Usuário')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {resetModal && (
                <ConfirmModal 
                    isOpen={true} 
                    title="Redefinir Senha" 
                    message={`A senha do usuário "${resetModal.full_name || resetModal.username}" será redefinida para a senha padrão do sistema (${sysDefaultPass}). O usuário precisará criar uma nãova senha não próximo acesso.`} 
                    confirmText="Redefinir" 
                    onConfirm={handleResetPass} 
                    onCancel={() => setResetModal(null)} 
                />
            )}

            <ConfirmModal isOpen={!!deleteModal} title="Remover Usuário" message={`Remover o usuário "${deleteModal?.full_name || deleteModal?.username}"? O acesso será revogado imediatamente.`} confirmText="Remover" onConfirm={handleDelete} onCancel={() => setDeleteModal(null)} />
        </div>
    );
}
