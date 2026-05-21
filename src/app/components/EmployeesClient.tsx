'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';

type Employee = { id: number; name: string; role: string };

export default function EmployeesClient({
    initialEmployees = [],
    userRole,
    username
}: {
    initialEmployees: Employee[],
    userRole: string,
    username: string
}) {
    const [employees, setEmployees] = useState<Employee[]>(initialEmployees);

    // Add Employee States
    const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
    const [newEmpName, setNewEmpName] = useState('');
    const [newEmpRole, setNewEmpRole] = useState('');

    // Edit Employee States
    const [showEditEmployeeModal, setShowEditEmployeeModal] = useState(false);
    const [editingEmpId, setEditingEmpId] = useState<number | null>(null);
    const [editEmpName, setEditEmpName] = useState('');
    const [editEmpRole, setEditEmpRole] = useState('');

    const router = useRouter();

    const refreshData = async () => {
        const res = await fetch('/api/employees');
        if (res.ok) {
            setEmployees(await res.json());
        }
        router.refresh();
    };

    const handleAddEmployee = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/employees', {
            method: 'POST',
            body: JSON.stringify({ name: newEmpName, role: newEmpRole }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            setShowAddEmployeeModal(false);
            setNewEmpName('');
            setNewEmpRole('');
            refreshData();
            alert('Funcionário cadastrado com sucesso!');
        } else {
            alert('Erro ao cadastrar funcionário.');
        }
    };

    const handleEditEmployee = (emp: Employee) => {
        setEditingEmpId(emp.id);
        setEditEmpName(emp.name);
        setEditEmpRole(emp.role);
        setShowEditEmployeeModal(true);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/employees', {
            method: 'PUT',
            body: JSON.stringify({ id: editingEmpId, name: editEmpName, role: editEmpRole }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            setShowEditEmployeeModal(false);
            setEditingEmpId(null);
            refreshData();
            alert('Funcionário atualizado com sucesso!');
        } else {
            alert('Erro ao atualizar funcionário.');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Deseja realmente confirmar esta ação? (Excluir funcionário)')) return;

        const res = await fetch('/api/employees', {
            method: 'DELETE',
            body: JSON.stringify({ id }),
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            refreshData();
            alert('Funcionário removido com sucesso!');
        } else {
            const err = await res.json();
            alert(err.error || 'Falha ao remover funcionário');
        }
    };

    const [searchTerm, setSearchTerm] = useState('');

    const filteredEmployees = employees
        .filter(emp =>
            emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            emp.role.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => a.role.localeCompare(b.role));

    return (
        <div className="page-wrapper">
            <Sidebar userRole={userRole} username={username} />

            <main className="main-content animate-fade">
                <div className="card w-full">
                    <div className="page-header mb-6">
                        <h2 className="page-title m-0">Lista de Funcionários</h2>
                        {(userRole === 'ADMIN' || userRole === 'GESTOR') && (
                            <button className="btn btn-green" onClick={() => setShowAddEmployeeModal(true)}>+ Funcionário</button>
                        )}
                    </div>

                        <div className="search-bar w-full mb-6">
                            <input
                                type="text"
                                className="input"
                                placeholder="Filtrar por nome ou cargo..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <span className="search-icon">🔍</span>
                        </div>
                    <div className="table-wrapper">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Cargo</th>
                                    {(userRole === 'ADMIN' || userRole === 'GESTOR') && <th style={{ textAlign: 'right' }}>Ações</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmployees.map(emp => (
                                    <tr key={emp.id}>
                                        <td style={{ fontWeight: 600, color: '#334155' }}>{emp.name}</td>
                                        <td style={{ color: '#64748b' }}>{emp.role}</td>
                                        {(userRole === 'ADMIN' || userRole === 'GESTOR') && (
                                            <td style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleEditEmployee(emp)}
                                                >
                                                    Editar
                                                </button>
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    onClick={() => handleDelete(emp.id)}
                                                >
                                                    Remover
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {filteredEmployees.length === 0 && <tr><td colSpan={(userRole === 'ADMIN' || userRole === 'GESTOR') ? 3 : 2} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Nenhum funcionário encontrado.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Add Employee Modal */}
            {showAddEmployeeModal && (
                <div className="modal-overlay" onClick={() => setShowAddEmployeeModal(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Novo Funcionário</h3>
                        </div>
                        <form onSubmit={handleAddEmployee}>
                            <div className="input-group mb-4">
                                <label className="input-label">Nome Completo</label>
                                <input className="input" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} required placeholder="Ex: João Silva" />
                            </div>
                            <div className="input-group mb-4">
                                <label className="input-label">Cargo/Função</label>
                                <input className="input" value={newEmpRole} onChange={e => setNewEmpRole(e.target.value)} placeholder="Ex: Professor" />
                            </div>
                            <div className="action-row mt-6">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAddEmployeeModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-green">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Edit Employee Modal */}
            {showEditEmployeeModal && (
                <div className="modal-overlay" onClick={() => setShowEditEmployeeModal(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Editar Funcionário</h3>
                        </div>
                        <form onSubmit={handleSaveEdit}>
                            <div className="input-group mb-4">
                                <label className="input-label">Nome Completo</label>
                                <input className="input" value={editEmpName} onChange={e => setEditEmpName(e.target.value)} required />
                            </div>
                            <div className="input-group mb-4">
                                <label className="input-label">Cargo/Função</label>
                                <input className="input" value={editEmpRole} onChange={e => setEditEmpRole(e.target.value)} />
                            </div>
                            <div className="action-row mt-6">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowEditEmployeeModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-green">Salvar Alterações</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
