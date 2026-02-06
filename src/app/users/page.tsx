'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
        <div className="container">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Gestão de Usuários</h1>
                    <p style={{ color: '#666' }}>Adicionar e remover administradores</p>
                </div>
                <button className="btn btn-outline" onClick={() => router.push('/')}>Voltar ao Dashboard</button>
            </header>

            <div className="card" style={{ marginBottom: '2rem' }}>
                <h3>Novo Usuário</h3>
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
                    <button type="submit" className="btn btn-primary" style={{ marginBottom: '1rem' }}>Criar Usuário</button>
                </form>
            </div>

            <div className="card">
                <h3>Usuários Cadastrados</h3>
                {loading ? <p>Carregando...</p> : (
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Usuário</th>
                                    <th>Cargo</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.id}>
                                        <td>{user.id}</td>
                                        <td><strong>{user.username}</strong></td>
                                        <td>
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '0.2rem 0.6rem',
                                                borderRadius: '4px',
                                                backgroundColor: '#eee',
                                                color: '#333',
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
                                                    style={{ backgroundColor: '#2ecc71', color: '#fff', border: 'none', fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
                                                >
                                                    Promover
                                                </button>
                                            ) : (
                                                <button
                                                    className="btn"
                                                    onClick={() => handleRoleChange(user.id, user.role)}
                                                    style={{ backgroundColor: '#f1c40f', color: '#fff', border: 'none', fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
                                                >
                                                    Rebaixar
                                                </button>
                                            )}
                                            <button
                                                className="btn btn-outline"
                                                onClick={() => handleDelete(user.id)}
                                                style={{ borderColor: '#d63031', color: '#d63031', fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
                                            >
                                                Apagar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
