'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import ConfirmModal from './ConfirmModal';

type Key = { id: number; name: string; room: string; status: 'available' | 'in_use'; employee_name?: string };

export default function KeysClient({
    initialKeys = [],
    userRole,
    username
}: {
    initialKeys: Key[],
    userRole: string,
    username: string
}) {
    const [keys, setKeys] = useState<Key[]>(initialKeys);
    const router = useRouter();

    // Redirect if not admin or gestor or porteiro
    useEffect(() => {
        if (userRole !== 'ADMIN' && userRole !== 'GESTOR' && userRole !== 'PORTEIRO') {
            router.push('/');
        }
    }, [userRole, router]);

    // Add Modal States
    const [showAddKeyModal, setShowAddKeyModal] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyRoom, setNewKeyRoom] = useState('');

    // Edit Modal States
    const [showEditKeyModal, setShowEditKeyModal] = useState(false);
    const [editingKeyId, setEditingKeyId] = useState<number | null>(null);
    const [editKeyName, setEditKeyName] = useState('');
    const [editKeyRoom, setEditKeyRoom] = useState('');

    // Confirmação de remoção via ConfirmModal compartilhado (antes: confirm() nativo)
    const [keyToDelete, setKeyToDelete] = useState<Key | null>(null);

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
            toast.success('Chave criada com sucesso!');
        } else {
            const err = await res.json();
            toast.error(err.error || 'Erro ao criar chave.');
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
            toast.success('Chave atualizada com sucesso!');
        } else {
            toast.error('Erro ao atualizar chave.');
        }
    };

    const handleDeleteKey = (key: Key) => {
        if (key.status === 'in_use') {
            toast.error('Não é possível remover uma chave que está em uso no momento.');
            return;
        }
        setKeyToDelete(key);
    };

    const confirmDeleteKey = async () => {
        if (!keyToDelete) return;
        const res = await fetch('/api/keys', {
            method: 'DELETE',
            body: JSON.stringify({ id: keyToDelete.id }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            toast.success('Chave removida com sucesso!');
            refreshData();
        } else {
            const err = await res.json();
            toast.error(err.error || 'Erro ao remover chave.');
        }
    };

    if (userRole !== 'ADMIN' && userRole !== 'GESTOR' && userRole !== 'PORTEIRO') return null; // Avoid flicker

    return (
        <div className="page-wrapper">
            <Sidebar userRole={userRole} username={username} />

            {/* Main Content */}
            <main className="main-content animate-fade">
                <div className="card w-full">
                    <div className="page-header mb-6">
                        <h2 className="page-title m-0">Gerenciar Chaves</h2>
                        <button className="btn btn-green" onClick={() => setShowAddKeyModal(true)}>+ Nova Chave</button>
                    </div>

                    <div className="table-wrapper table-cards">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Sala/Local</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {keys.map(key => (
                                    <tr key={key.id}>
                                        <td data-label="Nome" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{key.name}</td>
                                        <td data-label="Sala/Local" style={{ color: 'var(--text-secondary)' }}>{key.room}</td>
                                        <td data-label="Status">
                                            <span className={`status-tag ${key.status === 'available' ? 'status-available' : 'status-inuse'}`}>
                                                {key.status === 'available' ? 'Disponível' : 'Em Uso'}
                                            </span>
                                        </td>
                                        <td className="td-actions" style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => handleEditKey(key)}
                                            >
                                                Editar
                                            </button>
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() => handleDeleteKey(key)}
                                            >
                                                Remover
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {keys.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma chave cadastrada.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Add Key Modal */}
            {showAddKeyModal && (
                <div className="modal-overlay" onClick={() => setShowAddKeyModal(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Nova Chave</h3>
                        </div>
                        <form onSubmit={handleAddKey}>
                            <div className="input-group mb-4">
                                <label className="input-label">Nome da Chave</label>
                                <input className="input" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} required placeholder="Ex: Chave 101" />
                            </div>
                            <div className="input-group mb-4">
                                <label className="input-label">Sala/Local</label>
                                <input className="input" value={newKeyRoom} onChange={e => setNewKeyRoom(e.target.value)} placeholder="Ex: Laboratório Informática" />
                            </div>
                            <div className="action-row mt-6">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAddKeyModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-green">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Key Modal */}
            {showEditKeyModal && (
                <div className="modal-overlay" onClick={() => setShowEditKeyModal(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Editar Chave</h3>
                        </div>
                        <form onSubmit={handleSaveEdit}>
                            <div className="input-group mb-4">
                                <label className="input-label">Nome da Chave</label>
                                <input
                                    className="input"
                                    value={editKeyName}
                                    onChange={e => setEditKeyName(e.target.value)}
                                    required
                                    disabled={keys.find(k => k.id === editingKeyId)?.status === 'in_use'}
                                    title={keys.find(k => k.id === editingKeyId)?.status === 'in_use' ? "Não é possível editar nome de chave em uso" : ""}
                                />
                            </div>
                            <div className="input-group mb-4">
                                <label className="input-label">Sala/Local</label>
                                <input className="input" value={editKeyRoom} onChange={e => setEditKeyRoom(e.target.value)} />
                            </div>
                            <div className="action-row mt-6">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowEditKeyModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-green">Salvar Alterações</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirmação de remoção — mesmo vocabulário de modal do resto do app */}
            <ConfirmModal
                isOpen={keyToDelete !== null}
                title="Remover chave"
                message={keyToDelete ? `Remover a chave "${keyToDelete.name}"${keyToDelete.room ? ` (${keyToDelete.room})` : ''}? Esta ação não pode ser desfeita.` : ''}
                confirmText="Remover"
                onConfirm={confirmDeleteKey}
                onCancel={() => setKeyToDelete(null)}
            />
        </div>
    );
}
