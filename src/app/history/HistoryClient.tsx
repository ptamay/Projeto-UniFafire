'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PrintButton from '../components/PrintButton';
import Navbar from '../components/Navbar';

interface HistoryItem {
    id: number;
    action: string;
    timestamp: string;
    key_name: string;
    room: string;
    employee_name: string;
}

interface HistoryClientProps {
    history: HistoryItem[];
    isAdmin: boolean;
}

export default function HistoryClient({ history, isAdmin }: HistoryClientProps) {
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const router = useRouter();

    const handleClearHistory = async () => {
        try {
            const res = await fetch('/api/history/clear', { method: 'POST' });
            if (res.ok) {
                setShowClearConfirm(false);
                router.refresh();
                alert('Histórico limpo com sucesso.');
            } else {
                alert('Erro ao limpar histórico.');
            }
        } catch (error) {
            console.error('Failed to clear history', error);
            alert('Erro ao limpar histórico.');
        }
    };

    return (
        <div className="flex flex-col min-h-screen">
            <div className="no-print">
                <Navbar isAdmin={isAdmin} />
            </div>

            <main className="container w-full max-w-7xl mx-auto min-h-content flex-1 mt-4 md:mt-8">

                {/* Print Header (Only visible when printing) */}
                <div className="print-header" style={{ display: 'none', marginBottom: '2rem', textAlign: 'center' }}>
                    <h2>Relatório de Movimentações de Chaves</h2>
                    <p>Gerado em: {new Date().toLocaleString('pt-BR')}</p>
                </div>

                <div className="card full-width-print w-full">
                    <style jsx global>{`
                        @media print {
                            .no-print, .btn, header, nav { 
                                display: none !important; 
                            }
                            .print-header {
                                display: block !important;
                            }
                            .card {
                                box-shadow: none !important;
                                border: none !important;
                                padding: 0 !important;
                            }
                            .container {
                                max-width: 100% !important;
                                margin: 0 !important;
                                padding: 0 !important;
                            }
                            body {
                                background: white !important;
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }
                            table {
                                font-size: 12px;
                                width: 100%;
                                border-collapse: collapse;
                            }
                            th, td {
                                border: 1px solid #ddd;
                                padding: 8px;
                            }
                        }
                    `}</style>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }} className="no-print">
                        <h2 className="text-navy text-xl font-bold m-0">Histórico de Movimentações</h2>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            {isAdmin && (
                                <button
                                    className="btn btn-danger"
                                    onClick={() => setShowClearConfirm(true)}
                                    style={{ backgroundColor: '#ef4444', color: 'white', border: 'none', fontSize: '0.9rem' }}
                                >
                                    Limpar Histórico
                                </button>
                            )}
                            <PrintButton />
                        </div>
                    </div>

                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th className="text-navy">Data/Hora</th>
                                    <th className="text-navy">Ação</th>
                                    <th className="text-navy">Chave</th>
                                    <th className="text-navy">Funcionário</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((item) => (
                                    <tr key={item.id}>
                                        <td style={{ color: '#334155' }}>{new Date(item.timestamp).toLocaleString('pt-BR')}</td>
                                        <td>
                                            <span className={`status-badge ${item.action === 'withdraw' ? 'status-in-use' : 'status-available'}`}>
                                                {item.action === 'withdraw' ? 'Retirada' : 'Devolução'}
                                            </span>
                                        </td>
                                        <td><strong>{item.key_name}</strong> <small style={{ color: '#64748b' }}>({item.room})</small></td>
                                        <td>{item.employee_name || '-'}</td>
                                    </tr>
                                ))}
                                {history.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Nenhum histórico registrado.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Clear History Confirmation Modal */}
            {showClearConfirm && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h3 className="text-navy" style={{ marginBottom: '1rem' }}>Atenção</h3>
                        <p>Esta ação apagará todos os registros de movimentação. Deseja realmente limpar o histórico?</p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                            <button className="btn btn-outline-navy" onClick={() => setShowClearConfirm(false)}>Cancelar</button>
                            <button
                                className="btn btn-danger"
                                onClick={handleClearHistory}
                                style={{ backgroundColor: '#ef4444', color: 'white', border: 'none' }}
                            >
                                Confirmar Limpeza
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
