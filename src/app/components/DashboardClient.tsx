'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Key = { id: number; name: string; room: string; status: 'available' | 'in_use'; employee_name?: string; employee_role?: string };
type Employee = { id: number; name: string; role: string };
type HistoryItem = { id: number; employee_id: number; key_id: number; action: string; timestamp: string };

export default function DashboardClient({
    initialKeys = [],
    initialEmployees = [],
    userRole,
    userId
}: {
    initialKeys: Key[],
    initialEmployees: Employee[],
    userRole: string,
    userId: number
}) {
    const [keys, setKeys] = useState<Key[]>(initialKeys);
    const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
    const router = useRouter();
    const isAdmin = userRole === 'ADMIN';

    // Modal States
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

    // Selection States
    const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

    // Form States


    // Password Form States
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const refreshData = async () => {
        // For MVP, router.refresh() re-runs the server component, but state might stick.
        // Better to fetch fresh data or just invalidate.
        const kRes = await fetch('/api/keys');
        const eRes = await fetch('/api/employees');
        if (kRes.ok) setKeys(await kRes.json());
        if (eRes.ok) setEmployees(await eRes.json());
        router.refresh(); // To update history if it's passed from server
    };

    const handleWithdraw = async () => {
        if (!selectedKeyId || !selectedEmployeeId) return;

        const res = await fetch('/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'withdraw', keyId: selectedKeyId, employeeId: selectedEmployeeId }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            setShowWithdrawModal(false);
            setSelectedKeyId(null);
            setSelectedEmployeeId(null);
            refreshData();
        } else {
            alert('Falha ao retirar chave');
        }
    };

    const handleReturn = async (keyId: number) => {
        if (!confirm('Confirma a devolução desta chave?')) return;

        const res = await fetch('/api/transactions', {
            method: 'POST',
            body: JSON.stringify({ action: 'return', keyId }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            refreshData();
        } else {
            alert('Falha ao devolver chave');
        }
    };



    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
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

    const logout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/login');
    };

    const [searchTerm, setSearchTerm] = useState('');

    // Filter and Sort Keys
    const filteredKeys = keys
        .filter(key => {
            const term = searchTerm.toLowerCase();
            return (
                key.name.toLowerCase().includes(term) ||
                (key.room || '').toLowerCase().includes(term) ||
                (key.employee_name || '').toLowerCase().includes(term)
            );
        })
        .sort((a, b) => {
            if (a.status === 'in_use' && b.status !== 'in_use') return -1;
            if (a.status !== 'in_use' && b.status === 'in_use') return 1;
            return a.name.localeCompare(b.name);
        });

    return (
        <div className="container">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Gestão de Chaves</h1>
                    <p style={{ color: '#666' }}>{isAdmin ? 'Painel Administrativo' : 'Painel do Usuário'}</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-outline" onClick={() => router.push('/keys')}>Chaves</button>
                    <button className="btn btn-outline" onClick={() => router.push('/employees')}>Funcionários</button>
                    {isAdmin && <button className="btn btn-outline" onClick={() => router.push('/users')}>Usuários</button>}
                    {isAdmin && <button className="btn btn-outline" onClick={() => router.push('/logs')}>Log de Ações</button>}
                    <button className="btn btn-outline" onClick={() => router.push('/history')}>Histórico</button>

                    <button className="btn btn-outline" onClick={() => setShowChangePasswordModal(true)}>Alterar Senha</button>
                    <button className="btn btn-outline" onClick={logout} style={{ borderColor: '#fab1a0', color: '#d63031' }}>Sair</button>
                </div>
            </header>

            <div className="card">
                <div style={{ marginBottom: '1rem' }}>
                    <h2>Chaves</h2>
                    <input
                        type="text"
                        placeholder="Buscar por nome, sala ou funcionário..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            padding: '0.6rem 1rem',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            width: '100%',
                            maxWidth: '400px',
                            outline: 'none',
                            marginTop: '0.5rem',
                            fontSize: '0.95rem'
                        }}
                    />
                </div>
                <div className="table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                    <style jsx>{`
                        .table-wrapper::-webkit-scrollbar {
                            width: 8px;
                        }
                        .table-wrapper::-webkit-scrollbar-track {
                            background: #f1f1f1;
                            border-radius: 4px;
                        }
                        .table-wrapper::-webkit-scrollbar-thumb {
                            background: #ccc;
                            border-radius: 4px;
                        }
                        .table-wrapper::-webkit-scrollbar-thumb:hover {
                            background: #aaa;
                        }
                    `}</style>
                    <table>
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Sala/Local</th>
                                <th>Funcionário</th>
                                <th>Cargo</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredKeys.map(key => (
                                <tr key={key.id}>
                                    <td><strong>{key.name}</strong></td>
                                    <td>{key.room}</td>
                                    <td>
                                        {key.status === 'in_use' ? (
                                            <span style={{ fontWeight: 500 }}>{key.employee_name || 'Desconhecido'}</span>
                                        ) : (
                                            <span style={{ color: '#999' }}>—</span>
                                        )}
                                    </td>
                                    <td>
                                        {key.status === 'in_use' && key.employee_role ? (
                                            <span style={{ fontSize: '0.85rem', color: '#666' }}>{key.employee_role}</span>
                                        ) : (
                                            <span style={{ color: '#999' }}>—</span>
                                        )}
                                    </td>
                                    <td>
                                        <span className={`status-badge ${key.status === 'available' ? 'status-available' : 'status-in-use'}`}>
                                            {key.status === 'available' ? 'Disponível' : 'Em Uso'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                        {key.status === 'available' ? (
                                            <button className="btn btn-success" onClick={() => { setSelectedKeyId(key.id); setShowWithdrawModal(true); }}>
                                                Retirar
                                            </button>
                                        ) : (
                                            <button className="btn btn-warning" onClick={() => handleReturn(key.id)}>
                                                Devolver
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredKeys.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999' }}>Nenhuma chave encontrada.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Withdraw Modal */}
            {showWithdrawModal && (
                <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>Retirar Chave</h3>
                        <div className="form-group">
                            <label>Selecione o Funcionário</label>
                            <select
                                value={selectedEmployeeId || ''}
                                onChange={e => setSelectedEmployeeId(Number(e.target.value))}
                            >
                                <option value="">-- Selecione --</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                            <button className="btn btn-outline" onClick={() => setShowWithdrawModal(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={handleWithdraw} disabled={!selectedEmployeeId}>Confirmar Retirada</button>
                        </div>
                    </div>
                </div>
            )}



            {/* Change Password Modal */}
            {showChangePasswordModal && (
                <div className="modal-overlay" onClick={() => setShowChangePasswordModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>Alterar Senha</h3>
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
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                                <button type="button" className="btn btn-outline" onClick={() => setShowChangePasswordModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Alterar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
