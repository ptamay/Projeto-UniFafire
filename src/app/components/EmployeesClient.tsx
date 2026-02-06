'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Employee = { id: number; name: string; role: string };

export default function EmployeesClient({
    initialEmployees = [],
    isAdmin
}: {
    initialEmployees: Employee[],
    isAdmin: boolean
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
        <div className="container">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Funcionários</h1>
                    <p style={{ color: '#666' }}>Gestão de equipe</p>
                </div>
                <button className="btn btn-outline" onClick={() => router.push('/')}>Voltar ao Dashboard</button>
            </header>

            <div className="card">
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Lista de Funcionários</h3>
                        {isAdmin && (
                            <button className="btn btn-primary" onClick={() => setShowAddEmployeeModal(true)}>+ Funcionário</button>
                        )}
                    </div>

                    <input
                        type="text"
                        placeholder="Filtrar por nome ou cargo..."
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

                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Cargo</th>
                                {isAdmin && <th style={{ textAlign: 'right' }}>Ações</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEmployees.map(emp => (
                                <tr key={emp.id}>
                                    <td><strong>{emp.name}</strong></td>
                                    <td>{emp.role}</td>
                                    {isAdmin && (
                                        <td style={{ textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn btn-outline"
                                                onClick={() => handleEditEmployee(emp)}
                                                style={{ fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
                                            >
                                                Editar
                                            </button>
                                            <button
                                                className="btn btn-outline"
                                                onClick={() => handleDelete(emp.id)}
                                                style={{ borderColor: '#d63031', color: '#d63031', fontSize: '0.9rem', padding: '0.4rem 0.8rem' }}
                                            >
                                                Remover
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {filteredEmployees.length === 0 && <tr><td colSpan={isAdmin ? 3 : 2} style={{ textAlign: 'center' }}>Nenhum funcionário encontrado.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Employee Modal */}
            {showAddEmployeeModal && (
                <div className="modal-overlay" onClick={() => setShowAddEmployeeModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>Novo Funcionário</h3>
                        <form onSubmit={handleAddEmployee}>
                            <div className="form-group">
                                <label>Nome Completo</label>
                                <input value={newEmpName} onChange={e => setNewEmpName(e.target.value)} required placeholder="Ex: João Silva" />
                            </div>
                            <div className="form-group">
                                <label>Cargo/Função</label>
                                <input value={newEmpRole} onChange={e => setNewEmpRole(e.target.value)} placeholder="Ex: Professor" />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                                <button type="button" className="btn btn-outline" onClick={() => setShowAddEmployeeModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Edit Employee Modal */}
            {showEditEmployeeModal && (
                <div className="modal-overlay" onClick={() => setShowEditEmployeeModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3>Editar Funcionário</h3>
                        <form onSubmit={handleSaveEdit}>
                            <div className="form-group">
                                <label>Nome Completo</label>
                                <input value={editEmpName} onChange={e => setEditEmpName(e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label>Cargo/Função</label>
                                <input value={editEmpRole} onChange={e => setEditEmpRole(e.target.value)} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                                <button type="button" className="btn btn-outline" onClick={() => setShowEditEmployeeModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Salvar Alterações</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
