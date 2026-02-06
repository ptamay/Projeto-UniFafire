'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';

type User = { id: number; username: string; role: string };

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [newUserUser, setNewUserUser] = useState('');
    const [newUserPass, setNewUserPass] = useState('');
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        const res = await fetch('/api/users');
        if (res.ok) {
            setUsers(await res.json());
        } else {
            // If unauthorized, redirect might happen or we handle it
        }
        setLoading(false);
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/users', {
            method: 'POST',
            body: JSON.stringify({ username: newUserUser, password: newUserPass }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            setNewUserUser('');
            setNewUserPass('');
            fetchUsers();
            alert('Usuário criado com sucesso!');
        } else {
            const err = await res.json();
            alert(err.error || 'Falha ao criar usuário');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Deseja realmente confirmar esta ação? (Excluir usuário)')) return;

        const res = await fetch('/api/users', {
            method: 'DELETE',
            body: JSON.stringify({ id }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            fetchUsers();
            alert('Usuário removido com sucesso!');
        } else {
            const err = await res.json();
            alert(err.error || 'Falha ao remover usuário');
        }
    };

    const handleRoleChange = async (userId: number, currentRole: string) => {
        const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
        const actionName = newRole === 'ADMIN' ? 'Promover' : 'Rebaixar';

        if (!confirm(`Deseja realmente confirmar esta ação? (${actionName} usuário)`)) return;

        const res = await fetch('/api/users/role', {
            method: 'POST',
            body: JSON.stringify({ targetUserId: userId, newRole }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            const data = await res.json();
            alert(data.message || 'Cargo alterado com sucesso!');
            fetchUsers();
        } else {
            const err = await res.json();
            alert(err.error || 'Erro ao alterar cargo');
        }
    };

    return (
        <div className="flex flex-col min-h-screen">
            <Navbar isAdmin={true} /> {/* Users Page is Admin Only */}

            <main className="container w-full max-w-7xl mx-auto min-h-content flex-1 mt-4 md:mt-8">

                {/* Create User Card */}
                <div className="card w-full mb-6">
                    <h3 className="text-navy text-xl font-bold mb-4">Novo Usuário</h3>
                    <form onSubmit={handleAddUser} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                            <label>Usuário</label>
                            <input
                                type="text"
                                value={newUserUser}
                                onChange={(e) => setNewUserUser(e.target.value)}
                                required
                                placeholder="Email ou nome de usuário"
                            />
                        </div>
                        <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                            <label>Senha</label>
                            <input
                                type="password"
                                value={newUserPass}
                                onChange={(e) => setNewUserPass(e.target.value)}
                                required
                                placeholder="Mínimo 6 caracteres"
                            />
                        </div>
                        <button type="submit" className="btn btn-gold shadow-md" style={{ marginBottom: '0.2rem', height: '42px' }}>Criar Usuário</button>
                    </form>
                </div>

                {/* Users List */}
                <div className="card w-full">
                    <h3 className="text-navy text-xl font-bold mb-4">Usuários Cadastrados</h3>
                    {loading ? <p style={{ color: '#64748b' }}>Carregando...</p> : (
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th className="text-navy">ID</th>
                                        <th className="text-navy">Usuário</th>
                                        <th className="text-navy">Cargo</th>
                                        <th className="text-navy" style={{ textAlign: 'right' }}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(user => (
                                        <tr key={user.id}>
                                            <td style={{ color: '#64748b' }}>{user.id}</td>
                                            <td><strong style={{ color: '#334155' }}>{user.username}</strong></td>
                                            <td>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '0.2rem 0.6rem',
                                                    borderRadius: '4px',
                                                    backgroundColor: user.role === 'ADMIN' ? '#fef3c7' : '#e2e8f0',
                                                    color: user.role === 'ADMIN' ? '#d97706' : '#475569',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 500
                                                }}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                {user.role === 'USER' ? (
                                                    <button
                                                        className="btn"
                                                        onClick={() => handleRoleChange(user.id, user.role)}
                                                        style={{ backgroundColor: '#22c55e', color: '#fff', border: 'none', fontSize: '0.85rem', padding: '0.3rem 0.6rem' }}
                                                    >
                                                        Promover
                                                    </button>
                                                ) : (
                                                    <button
                                                        className="btn"
                                                        onClick={() => handleRoleChange(user.id, user.role)}
                                                        style={{ backgroundColor: '#f59e0b', color: '#fff', border: 'none', fontSize: '0.85rem', padding: '0.3rem 0.6rem' }}
                                                    >
                                                        Rebaixar
                                                    </button>
                                                )}
                                                <button
                                                    className="btn btn-outline"
                                                    onClick={() => handleDelete(user.id)}
                                                    style={{ borderColor: '#ef4444', color: '#ef4444', fontSize: '0.85rem', padding: '0.3rem 0.6rem' }}
                                                >
                                                    Apagar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {users.length === 0 && (
                                        <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Nenhum usuário encontrado.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
