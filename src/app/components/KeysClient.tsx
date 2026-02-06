'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from './Navbar';

type Key = { id: number; name: string; room: string; status: 'available' | 'in_use'; employee_name?: string };

export default function KeysClient({
    initialKeys = [],
    isAdmin
}: {
    initialKeys: Key[],
    isAdmin: boolean
}) {
    const [keys, setKeys] = useState<Key[]>(initialKeys);
    const router = useRouter();

    // Redirect if not admin
    useEffect(() => {
        if (!isAdmin) {
            router.push('/');
        }
    }, [isAdmin, router]);

    // Add Modal States
    const [showAddKeyModal, setShowAddKeyModal] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyRoom, setNewKeyRoom] = useState('');

    // Edit Modal States
    const [showEditKeyModal, setShowEditKeyModal] = useState(false);
    const [editingKeyId, setEditingKeyId] = useState<number | null>(null);
    const [editKeyName, setEditKeyName] = useState('');
    const [editKeyRoom, setEditKeyRoom] = useState('');

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

    if (!isAdmin) return null; // Avoid flicker

    return (
        <div className="flex flex-col min-h-screen">
            <Navbar isAdmin={isAdmin} />

            {/* Main Content */}
            <main className="container w-full max-w-7xl mx-auto min-h-content flex-1 mt-4 md:mt-8">
                <div className="card w-full">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h2 className="text-navy text-xl font-bold m-0">Gerenciar Chaves</h2>
                        <button className="btn btn-gold shadow-md" onClick={() => setShowAddKeyModal(true)}>+ Nova Chave</button>
                    </div>

                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th className="text-navy">Nome</th>
                                    <th className="text-navy">Sala/Local</th>
                                    <th className="text-navy">Status</th>
                                    <th className="text-navy" style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {keys.map(key => (
                                    <tr key={key.id}>
                                        <td style={{ fontWeight: 600, color: '#334155' }}>{key.name}</td>
                                        <td style={{ color: '#64748b' }}>{key.room}</td>
                                        <td>
                                            <span className={`status-badge ${key.status === 'available' ? 'status-available' : 'status-in-use'}`}>
                                                {key.status === 'available' ? 'Disponível' : 'Em Uso'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn btn-outline-navy"
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
                                    </tr>
                                ))}
                                {keys.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#999' }}>Nenhuma chave cadastrada.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Add Key Modal */}
            {showAddKeyModal && (
                <div className="modal-overlay" onClick={() => setShowAddKeyModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3 className="text-navy" style={{ marginBottom: '1.5rem' }}>Nova Chave</h3>
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
                                <button type="button" className="btn btn-outline-navy" onClick={() => setShowAddKeyModal(false)}>Cancelar</button>
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
                        <h3 className="text-navy" style={{ marginBottom: '1.5rem' }}>Editar Chave</h3>
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
                                <button type="button" className="btn btn-outline-navy" onClick={() => setShowEditKeyModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Salvar Alterações</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
