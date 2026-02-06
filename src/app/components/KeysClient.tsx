'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Key = { id: number; name: string; room: string; status: 'available' | 'in_use'; employee_name?: string };

export default function KeysClient({
    initialKeys = [],
    isAdmin
}: {
    initialKeys: Key[],
    isAdmin: boolean
}) {
    const [keys, setKeys] = useState<Key[]>(initialKeys);

    // Add Modal States
    const [showAddKeyModal, setShowAddKeyModal] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyRoom, setNewKeyRoom] = useState('');

    // Edit Modal States
    const [showEditKeyModal, setShowEditKeyModal] = useState(false);
    const [editingKeyId, setEditingKeyId] = useState<number | null>(null);
    const [editKeyName, setEditKeyName] = useState('');
    const [editKeyRoom, setEditKeyRoom] = useState('');

    const router = useRouter();

    const refreshData = async () => {
        const kRes = await fetch('/api/keys');
        if (kRes.ok) {
            const data = await kRes.json();
            // Sort: Available first, then A-Z
            data.sort((a: Key, b: Key) => {
                if (a.status === 'available' && b.status !== 'available') return -1;
                if (a.status !== 'available' && b.status === 'available') return 1;
                return a.name.localeCompare(b.name);
            });
            setKeys(data);
        }
        router.refresh();
    };

    const handleAddKey = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/keys', {
            method: 'POST',
            body: JSON.stringify({ name: newKeyName, room: newKeyRoom }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            setShowAddKeyModal(false);
            setNewKeyName('');
            setNewKeyRoom('');
            refreshData();
            alert('Chave criada com sucesso!');
        } else {
            const err = await res.json();
            alert(err.error || 'Erro ao criar chave.');
        }
    };

    const handleEditKey = (key: Key) => {
        setEditingKeyId(key.id);
        setEditKeyName(key.name);
        setEditKeyRoom(key.room);
        setShowEditKeyModal(true);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/keys', {
            method: 'PUT',
            body: JSON.stringify({ id: editingKeyId, name: editKeyName, room: editKeyRoom }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            setShowEditKeyModal(false);
            setEditingKeyId(null);
            refreshData();
            alert('Chave atualizada com sucesso!');
        } else {
            alert('Erro ao atualizar chave.');
        }
    };

    const handleDeleteKey = async (key: Key) => {
        if (key.status === 'in_use') {
            alert('Não é possível remover uma chave que está em uso no momento.');
            return;
        }

        if (!confirm('Deseja realmente confirmar esta ação? (Remover chave)')) return;
        const res = await fetch('/api/keys', {
            method: 'DELETE',
            body: JSON.stringify({ id: key.id }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            alert('Chave removida com sucesso!');
            refreshData();
        } else {
            const err = await res.json();
            alert(err.error || 'Erro ao remover chave.');
        }
    };

    const logout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
    };

    return (
        <div className="container">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Gestão de Chaves</h1>
                    <p style={{ color: '#666' }}>Administração de Chaves</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-outline" onClick={() => router.push('/')}>Dashboard</button>
                    <button className="btn btn-outline" onClick={() => router.push('/employees')}>Funcionários</button>
                    {isAdmin && <button className="btn btn-outline" onClick={() => router.push('/users')}>Usuários</button>}
                    <button className="btn btn-outline" onClick={() => router.push('/history')}>Histórico</button>
                    <button className="btn btn-outline" onClick={logout} style={{ borderColor: '#fab1a0', color: '#d63031' }}>Sair</button>
                </div>
            </header>

            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2>Lista de Chaves</h2>
                    {isAdmin && (
                        <button className="btn btn-primary" onClick={() => setShowAddKeyModal(true)}>+ Nova Chave</button>
                    )}
                </div>

                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Sala/Local</th>
                                <th>Status</th>
                                {isAdmin && <th style={{ textAlign: 'right' }}>Ações</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map(key => (
                                <tr key={key.id}>
                                    <td><strong>{key.name}</strong></td>
                                    <td>{key.room}</td>
                                    <td>
                                        <span className={`status-badge ${key.status === 'available' ? 'status-available' : 'status-in-use'}`}>
                                            {key.status === 'available' ? 'Disponível' : 'Em Uso'}
                                        </span>
                                    </td>
                                    {isAdmin && (
                                        <td style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn btn-outline"
                                                onClick={() => handleEditKey(key)}
                                                style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
                                            >
                                                Editar
                                            </button>
                                            <button
                                                className="btn btn-outline"
                                                onClick={() => handleDeleteKey(key)}
                                                style={{ borderColor: '#d63031', color: '#d63031', padding: '0.4rem 0.8rem' }}
                                            >
                                                Remover
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {keys.length === 0 && <tr><td colSpan={isAdmin ? 4 : 3} style={{ textAlign: 'center', color: '#999' }}>Nenhuma chave cadastrada.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Key Modal */}
            {showAddKeyModal && (
                <div className="modal-overlay" onClick={() => setShowAddKeyModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>Nova Chave</h3>
                        <form onSubmit={handleAddKey}>
                            <div className="form-group">
                                <label>Nome da Chave</label>
                                <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} required placeholder="Ex: Chave 101" />
                            </div>
                            <div className="form-group">
                                <label>Sala/Local</label>
                                <input value={newKeyRoom} onChange={e => setNewKeyRoom(e.target.value)} placeholder="Ex: Laboratório Informática" />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                                <button type="button" className="btn btn-outline" onClick={() => setShowAddKeyModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Key Modal */}
            {showEditKeyModal && (
                <div className="modal-overlay" onClick={() => setShowEditKeyModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>Editar Chave</h3>
                        <form onSubmit={handleSaveEdit}>
                            <div className="form-group">
                                <label>Nome da Chave</label>
                                <input
                                    value={editKeyName}
                                    onChange={e => setEditKeyName(e.target.value)}
                                    required
                                    disabled={keys.find(k => k.id === editingKeyId)?.status === 'in_use'}
                                    title={keys.find(k => k.id === editingKeyId)?.status === 'in_use' ? "Não é possível editar nome de chave em uso" : ""}
                                />
                            </div>
                            <div className="form-group">
                                <label>Sala/Local</label>
                                <input value={editKeyRoom} onChange={e => setEditKeyRoom(e.target.value)} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                                <button type="button" className="btn btn-outline" onClick={() => setShowEditKeyModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Salvar Alterações</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
