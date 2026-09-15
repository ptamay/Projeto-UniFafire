'use client';
import { useState } from 'react';
import ConfirmModal from '@/app/components/ConfirmModal';
import { rotuloDoPapel } from '@/lib/papeis';
import type { UsuarioAtivo } from '@/lib/usuarios';
import toast from 'react-hot-toast';
import { SEM_CONEXAO, naoDeuPara } from '@/lib/mensagens';

type User = { 
    id: number; 
    username: string; 
    role: string; 
    full_name?: string;
    matricula?: string;
    phone?: string;
};

const ROLES = [
    { value: 'ADMIN', label: 'Administrador', desc: 'Acesso total ao sistema' },
    { value: 'GESTOR', label: 'Gestor', desc: 'Gerencia o sistema' },
    { value: 'PORTEIRO', label: 'Porteiro', desc: 'Operação de chaves' },
    { value: 'FUNCIONARIO', label: 'Funcionário', desc: 'Confirma retirada/devolução' },
    { value: 'ALUNO', label: 'Aluno', desc: 'Confirma retirada/devolução' },
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

/** TASK-131: a lista vem do servidor — a tela abre com ela, sem spinner. */
export default function UsersClient({ usuariosIniciais }: { usuariosIniciais: UsuarioAtivo[] }) {
    const [users, setUsers] = useState<User[]>(usuariosIniciais as User[]);
    const [showForm, setShowForm] = useState(false);
    const [editUser, setEditUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({ username: '', role: 'FUNCIONARIO', full_name: '', matricula: '', phone: '' });
    const [saving, setSaving] = useState(false);
    const [deleteModal, setDeleteModal] = useState<User | null>(null);
    const [resetModal, setResetModal] = useState<User | null>(null);
    // TASK-093 (ADR-017) — o que se revela aqui e um CODIGO DE USO UNICO, nao
    // uma senha. Mesmo modal para criar, reativar e resetar: os tres passaram a
    // produzir a mesma coisa, e o ADMIN precisa ver o valor UMA vez para
    // entregar em maos.
    const [codigoRevelado, setCodigoRevelado] = useState<{username: string, codigo?: string, validadeMinutos?: number, motivo: 'criado' | 'reativado' | 'resetado'} | null>(null);
    const [filterRole, setFilterRole] = useState('all');
    const [search, setSearch] = useState('');

    // TASK-131: a busca na montagem saiu — a lista chegou pelo servidor, junto com a tela.

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
                } else { toast.error(data.error || naoDeuPara('salvar o usuário')); }
            } else {
                // Create new user — omite username quando vazio (gerado automaticamente pelo servidor)
                const { username, ...rest } = formData;
                const payload = username ? { username, ...rest } : rest;


                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok) {
                    setUsers(prev => [...prev, { id: data.id, ...formData, username: data.username }]);
                    setCodigoRevelado({ username: data.username, codigo: data.codigoDeAcesso,
                        validadeMinutos: data.validadeMinutos, motivo: data.reactivated ? 'reativado' : 'criado' });
                    setShowForm(false);
                } else { toast.error(data.error || naoDeuPara('criar o usuário')); }
            }
        } catch { toast.error(SEM_CONEXAO); }
        setSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteModal) return;
        try {
            const res = await fetch('/api/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteModal.id }) });
            const data = await res.json();
            if (res.ok) { setUsers(prev => prev.filter(u => u.id !== deleteModal.id)); toast.success('Usuário removido.'); }
            else { toast.error(data.error || naoDeuPara('remover o usuário')); }
        } catch { toast.error(SEM_CONEXAO); }
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
            if (res.ok) {
                // Antes: toast dizendo "Senha redefinida para o padrão!". Agora ha um
                // valor que so existe nesta resposta — engoli-lo num toast deixaria o
                // ADMIN sem o que entregar, e a pessoa sem como entrar.
                setCodigoRevelado({
                    username: resetModal.username, codigo: data.codigoDeAcesso,
                    validadeMinutos: data.validadeMinutos, motivo: 'resetado',
                });
            }
            else { toast.error(data.error || naoDeuPara('gerar o código')); }
        } catch { toast.error(SEM_CONEXAO); }
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
        <>
            <main className="main-content animate-fade">
                <div className="page-header cabecalho-enxuto">
                    <div>
                        <h1 className="page-title">Usuários do Sistema</h1>
                        <p className="page-subtitle">Gerencie acessos e perfis de todos os usuários</p>
                    </div>
                    <button className="btn btn-principal desktop-only" onClick={openNew}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Novo usuário
                    </button>
                </div>

                {/* TASK-137: a busca é o primeiro controle. No celular, o "+ Novo" fica na linha
                    dela (o botão do cabeçalho é do desktop) e os filtros por papel vêm embaixo —
                    antes eram três faixas (botão, filtros, busca) antes do primeiro usuário. */}
                <div className="barra-usuarios">
                    <div className="search-bar">
                        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input type="search" aria-label="Buscar usuário por nome, usuário ou matrícula" className="input" style={{ paddingLeft: '2.5rem' }} placeholder="Buscar" enterKeyHint="search" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <button type="button" className="btn btn-principal btn-novo-compacto mobile-only" onClick={openNew} aria-label="Novo usuário">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Novo
                    </button>
                </div>

                {/* TASK-136: os filtros por papel são BOTÕES com estado (aria-pressed) e a contagem
                    dentro — como os filtros do Dashboard. Antes eram caixas clicáveis que não eram
                    botão: sem teclado, e o leitor de tela não sabia qual estava ligado. */}
                <div className="filtros-papel" role="group" aria-label="Filtrar por perfil">
                    {ROLES.map(r => {
                        const count = users.filter(u => u.role === r.value).length;
                        return (
                            <button
                                key={r.value}
                                type="button"
                                className="btn btn-sm filtro-papel"
                                aria-pressed={filterRole === r.value}
                                onClick={() => setFilterRole(filterRole === r.value ? 'all' : r.value)}
                            >
                                {r.label} <span className="filtro-conta">{count}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="usuarios-resumo">
                    <span>{filteredUsers.length} usuário{filteredUsers.length !== 1 ? 's' : ''}</span>
                    {filterRole !== 'all' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setFilterRole('all')}>
                            Limpar filtro
                        </button>
                    )}
                </div>

                {/* TASK-136 (ADR-031): no celular, cada usuário é uma LINHA — nome, "@usuário ·
                    papel" — com as ações embaixo, secundárias; remover pede confirmação. */}
                <div className="mobile-only">
                    <ul className="lista-linhas" aria-label="Usuários">
                        {filteredUsers.map(u => (
                            <li key={u.id} className="linha-lista linha-lista--acoes-embaixo">
                                <div className="linha-texto">
                                    <div className="linha-nome">{u.full_name || u.username}</div>
                                    <div className="linha-apoio">@{u.username} · {rotuloDoPapel(u.role)}{u.matricula ? ` · ${u.matricula}` : ''}</div>
                                </div>
                                <div className="linha-acoes">
                                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>Editar</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setResetModal(u)}>Novo código</button>
                                    <button className="btn btn-ghost btn-sm btn-remover" onClick={() => setDeleteModal(u)}>Remover</button>
                                </div>
                            </li>
                        ))}
                        {filteredUsers.length === 0 && <li className="linha-vazia">Nenhum usuário encontrado.</li>}
                    </ul>
                </div>

                {(
                    <div className="table-wrapper card desktop-only">
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
                                        <td data-label="Usuário">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-2)', fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>
                                                    {(u.full_name || u.username)[0].toUpperCase()}
                                                </div>
                                                <span style={{ fontWeight: 600 }}>@{u.username}</span>
                                            </div>
                                        </td>
                                        <td data-label="Nome" style={{ color: 'var(--text-secondary)' }}>{u.full_name || '—'}</td>
                                        <td data-label="Matrícula" style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 'var(--fs-2)' }}>{u.matricula || '—'}</td>
                                        <td data-label="Perfil"><span className={`badge ${ROLE_BADGE_CLASS[u.role] || 'badge-user'}`}>{ROLES.find(r => r.value === u.role)?.label || u.role}</span></td>
                                        <td className="td-actions">
                                            <div className="action-row" style={{ justifyContent: 'flex-end' }}>
                                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                    Editar
                                                </button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => setResetModal(u)}>
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                                    Novo código
                                                </button>
                                                <button className="btn btn-ghost btn-sm btn-remover" onClick={() => setDeleteModal(u)}>
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
                                    <span style={{ fontSize: 'var(--fs-2)', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
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
                                <div style={{ padding: '0.75rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-2)', color: 'var(--text-secondary)' }}>
                                    <strong style={{ color: 'var(--text-primary)' }}>{selectedRole.label}:</strong> {selectedRole.desc}
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-principal" disabled={saving}>
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
                    title="Gerar Código de Acesso" 
                    message={`O acesso de "${resetModal.full_name || resetModal.username}" será invalidado e um código de uso único será gerado. Você verá o código UMA vez e deverá entregá-lo em mãos; com ele, a pessoa define a própria senha no primeiro acesso.`} 
                    confirmText="Gerar código" 
                    onConfirm={handleResetPass} 
                    onCancel={() => setResetModal(null)} 
                />
            )}
            
            {/* Codigo de acesso — unica vez que este valor aparece (TASK-093) */}
            {codigoRevelado && (
                <div className="modal-overlay" onClick={() => setCodigoRevelado(null)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
                        <div style={{ width: '48px', height: '48px', background: 'var(--livre-bg)', color: 'var(--livre-fg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        </div>
                        <h2 style={{ fontSize: 'var(--fs-4)', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                            Código de Acesso Gerado
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: 'var(--fs-3)' }}>
                            O usuário <strong>@{codigoRevelado.username}</strong> foi {codigoRevelado.motivo} com sucesso.
                        </p>

                        {codigoRevelado.codigo && (
                            <div style={{ background: 'var(--bg-input)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px dashed var(--border-strong)' }}>
                                <div style={{ fontSize: 'var(--fs-2)', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 600 }}>Código de uso único</div>
                                {/* Fonte monoespaçada e espaçamento largo: este valor é
                                    DITADO e transcrito à mão. O alfabeto já exclui os
                                    caracteres ambíguos; a tipografia faz a outra metade. */}
                                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 'var(--fs-5)', color: 'var(--text-primary)', fontWeight: 700, letterSpacing: '4px' }}>{codigoRevelado.codigo}</div>
                            </div>
                        )}

                        <div style={{ padding: '0.75rem', background: 'var(--pendente-bg)', color: 'var(--pendente-fg)', borderRadius: 'var(--radius-md)', fontSize: 'var(--fs-2)', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', textAlign: 'left', alignItems: 'flex-start' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            <span>
                                Anote agora: <strong>este código não será exibido de novo</strong>.
                                Vale por <strong>{codigoRevelado.validadeMinutos ?? 30} minutos</strong> e serve
                                <strong> uma vez só</strong>. Com ele, a pessoa cadastra a própria senha no primeiro acesso.
                            </span>
                        </div>

                        <button className="btn btn-principal w-full" onClick={() => setCodigoRevelado(null)}>
                            Concluído
                        </button>
                    </div>
                </div>
            )}

            <ConfirmModal isOpen={!!deleteModal} title="Remover Usuário" message={`Remover o usuário "${deleteModal?.full_name || deleteModal?.username}"? O acesso será revogado imediatamente.`} confirmText="Remover" cancelText="Cancelar" onConfirm={handleDelete} onCancel={() => setDeleteModal(null)} danger={true} />
        </>
    );
}
