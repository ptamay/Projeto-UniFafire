'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from './Navbar';

type Key = { id: number; name: string; room: string; status: 'available' | 'in_use'; employee_name?: string; employee_role?: string };
type Employee = { id: number; name: string; role: string };

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

    // Selection States
    const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

    const refreshData = async () => {
        const kRes = await fetch('/api/keys');
        const eRes = await fetch('/api/employees');
        if (kRes.ok) setKeys(await kRes.json());
        if (eRes.ok) setEmployees(await eRes.json());
        router.refresh();
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
        <div className="flex flex-col min-h-screen">
            <Navbar isAdmin={isAdmin} />

            <main className="container w-full max-w-7xl mx-auto min-h-content flex-1 mt-4 md:mt-8">

                {/* Mobile Heading & Search (Hidden on Desktop) */}
                <div className="md:hidden flex flex-col gap-4 mb-4">
                    <h2 className="text-navy text-xl font-bold">Status das Chaves</h2>
                    <div className="search-wrapper w-full relative">
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full"
                            style={{
                                padding: '0.75rem 1rem',
                                paddingLeft: '2.5rem',
                                borderRadius: '9999px',
                                border: '1px solid #e2e8f0',
                                outline: 'none',
                                transition: 'all 0.2s',
                                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                            }}
                        />
                        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>🔍</span>
                    </div>
                </div>

                {/* Desktop Table View (Hidden on Mobile) */}
                <div className="card w-full hidden md:block">
                    {/* Desktop Header inside Card */}
                    <div className="flex justify-between items-center mb-6 pl-2 pr-2">
                        <h2 className="text-navy text-xl font-bold m-0">Status das Chaves</h2>
                        <div className="search-wrapper max-w-md relative w-auto">
                            <input
                                type="text"
                                placeholder="Buscar por nome, sala ou funcionário..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    width: '300px',
                                    padding: '0.6rem 1rem',
                                    paddingLeft: '2.5rem',
                                    borderRadius: '9999px',
                                    border: '1px solid #e2e8f0',
                                    outline: 'none',
                                    transition: 'all 0.2s',
                                    backgroundColor: '#f8fafc'
                                }}
                            />
                            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>🔍</span>
                        </div>
                    </div>

                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th className="text-navy">Nome</th>
                                    <th className="text-navy">Sala/Local</th>
                                    <th className="text-navy">Funcionário</th>
                                    <th className="text-navy">Cargo</th>
                                    <th className="text-navy">Status</th>
                                    <th className="text-navy" style={{ textAlign: 'right' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredKeys.map(key => (
                                    <tr key={key.id}>
                                        <td style={{ fontWeight: 600, color: '#334155' }}>{key.name}</td>
                                        <td style={{ color: '#64748b' }}>{key.room}</td>
                                        <td>
                                            {key.status === 'in_use' ? (
                                                <span style={{ fontWeight: 500, color: '#1e293b' }}>{key.employee_name || 'Desconhecido'}</span>
                                            ) : (
                                                <span style={{ color: '#cbd5e1' }}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            {key.status === 'in_use' && key.employee_role ? (
                                                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{key.employee_role}</span>
                                            ) : (
                                                <span style={{ color: '#cbd5e1' }}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`status-badge ${key.status === 'available' ? 'status-available' : 'status-in-use'}`}>
                                                {key.status === 'available' ? 'Disponível' : 'Em Uso'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {key.status === 'available' ? (
                                                <button
                                                    className="btn btn-gold shadow-md"
                                                    onClick={() => { setSelectedKeyId(key.id); setShowWithdrawModal(true); }}
                                                >
                                                    Retirar
                                                </button>
                                            ) : (
                                                <button
                                                    className="btn btn-outline-navy"
                                                    onClick={() => handleReturn(key.id)}
                                                >
                                                    Devolver
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {filteredKeys.length === 0 && (
                                    <tr>
                                        <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                            Nenhuma chave encontrada com esses termos.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Mobile Cards View (Visible on Mobile Only) */}
                <div className="md:hidden">
                    {filteredKeys.map(key => (
                        <div key={key.id} className="mobile-card">
                            <div className="mobile-card-row">
                                <span className="mobile-card-label">Chave</span>
                                <span className="mobile-card-value text-lg text-navy">{key.name}</span>
                            </div>
                            <div className="mobile-card-row">
                                <span className="mobile-card-label">Local</span>
                                <span className="mobile-card-value">{key.room}</span>
                            </div>
                            <div className="mobile-card-row">
                                <span className="mobile-card-label">Status</span>
                                <span className={`status-badge ${key.status === 'available' ? 'status-available' : 'status-in-use'}`}>
                                    {key.status === 'available' ? 'Disponível' : 'Em Uso'}
                                </span>
                            </div>

                            {key.status === 'in_use' && (
                                <>
                                    <div className="mobile-card-row">
                                        <span className="mobile-card-label">Funcionário</span>
                                        <span className="mobile-card-value">{key.employee_name || 'Desconhecido'}</span>
                                    </div>
                                    <div className="mobile-card-row">
                                        <span className="mobile-card-label">Cargo</span>
                                        <span className="mobile-card-value text-sm">{key.employee_role || '-'}</span>
                                    </div>
                                </>
                            )}

                            <div className="mobile-actions">
                                {key.status === 'available' ? (
                                    <button
                                        className="btn btn-gold w-full justify-center shadow-md"
                                        onClick={() => { setSelectedKeyId(key.id); setShowWithdrawModal(true); }}
                                    >
                                        Retirar Chave
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-outline-navy w-full justify-center"
                                        onClick={() => handleReturn(key.id)}
                                    >
                                        Devolver Chave
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {filteredKeys.length === 0 && (
                        <div className="text-center p-8 text-gray-400">
                            Nenhuma chave encontrada.
                        </div>
                    )}
                </div>

            </main>

            {/* Withdraw Modal */}
            {showWithdrawModal && (
                <div className="modal-overlay" onClick={() => setShowWithdrawModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.5rem', color: 'var(--color-navy)' }}>
                            Retirar Chave
                        </h3>
                        <div className="form-group">
                            <label>Selecione o Funcionário</label>
                            <select
                                value={selectedEmployeeId || ''}
                                onChange={e => setSelectedEmployeeId(Number(e.target.value))}
                                autoFocus
                            >
                                <option value="">-- Selecione --</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex justify-end gap-4 mt-8 flex-col-reverse md:flex-row">
                            <button className="btn btn-outline-navy justify-center" onClick={() => setShowWithdrawModal(false)}>
                                Cancelar
                            </button>
                            <button
                                className="btn btn-gold shadow-md justify-center"
                                onClick={handleWithdraw}
                                disabled={!selectedEmployeeId}
                                style={{ opacity: selectedEmployeeId ? 1 : 0.5 }}
                            >
                                Confirmar Retirada
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
