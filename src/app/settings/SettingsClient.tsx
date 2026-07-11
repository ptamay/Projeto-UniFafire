'use client';
import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/ConfirmModal';

interface Backup { filename: string; createdAt: string; size: number; }

function formatBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}
function formatDate(ts: string) {
    try { return new Date(ts).toLocaleString('pt-BR'); } catch { return ts; }
}

interface Props {
    userRole: string;
    username: string;
}

export default function SettingsClient({ userRole, username }: Props) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [backupTime, setBackupTime] = useState('03:00');
    const [backupCount, setBackupCount] = useState(3);
    const [autoLogoutTime, setAutoLogoutTime] = useState('18:30');
    const [defaultResetPassword, setDefaultResetPassword] = useState('unifafire123');
    const [backups, setBackups] = useState<Backup[]>([]);
    const [loadingBkp, setLoadingBkp] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    const [generatingBkp, setGeneratingBkp] = useState(false);
    const [restoringBkp, setRestoringBkp] = useState(false);
    const [importingDb, setImportingDb] = useState(false);
    const [isClearingDb, setIsClearingDb] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const [serverInfo, setServerInfo] = useState<{ ips: string[], hostname: string } | null>(null);
    const [bkpReliability, setBkpReliability] = useState<{ totalDays: number; successDays: number; percent: number | null } | null>(null);

    const fetchBackups = () => {
        fetch('/api/backups').then(r => r.json()).then(d => { setBackups(Array.isArray(d) ? d : []); setLoadingBkp(false); });
        // TASK-032: métrica de confiabilidade do backup (spec §5, alvo 100%)
        fetch('/api/backups/reliability').then(r => r.ok ? r.json() : null).then(d => {
            if (d && typeof d.totalDays === 'number') setBkpReliability(d);
        }).catch(() => {});
    };

    const loadBackups = () => {
        setLoadingBkp(true);
        fetchBackups();
    };

    useEffect(() => {
        fetch('/api/settings').then(r => r.json()).then(d => {
            if (d.backupTime) setBackupTime(d.backupTime);
            if (d.backupCount) setBackupCount(d.backupCount);
            if (d.autoLogoutTime) setAutoLogoutTime(d.autoLogoutTime);
            if (d.defaultResetPassword) setDefaultResetPassword(d.defaultResetPassword);
        });
        fetch('/api/server-info').then(r => r.json()).then(d => {
            if (d.ips) setServerInfo(d.ips ? d : null);
        });
        // loadingBkp já inicia true — busca direta evita setState síncrono no effect
        fetchBackups();
    }, []);

    const saveSettings = async () => {
        setSavingSettings(true);
        try {
            const res = await fetch('/api/settings', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ 
                    backupTime, 
                    backupCount, 
                    autoLogoutTime, 
                    defaultResetPassword 
                }) 
            });
            if (res.ok) toast.success('Configurações salvas!');
            else { const d = await res.json(); toast.error(d.error || 'Erro ao salvar.'); }
        } catch { toast.error('Erro de conexão.'); }
        setSavingSettings(false);
    };

    const generateBackup = async () => {
        setGeneratingBkp(true);
        try {
            const res = await fetch('/api/backups', { method: 'POST' });
            const d = await res.json();
            if (res.ok) { toast.success('Backup gerado!'); loadBackups(); }
            else { toast.error(d.error || 'Erro ao gerar backup.'); }
        } catch { toast.error('Erro de conexão.'); }
        setGeneratingBkp(false);
    };

    const deleteBackup = async (filename: string) => {
        try {
            const res = await fetch('/api/backups', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) });
            if (res.ok) { toast.success('Backup excluído.'); setBackups(prev => prev.filter(b => b.filename !== filename)); }
            else { const d = await res.json(); toast.error(d.error || 'Erro.'); }
        } catch { toast.error('Erro de conexão.'); }
    };

    const restoreBackup = async (filename: string) => {
        if (!confirm(`Deseja restaurar o backup ${filename}? Isso substituirá todos os dados atuais.`)) return;
        setRestoringBkp(true);
        try {
            const res = await fetch('/api/backups/restore', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ filename }) 
            });
            const d = await res.json();
            if (res.ok) {
                toast.success('Sistema restaurado com sucesso! Recarregando...');
                setTimeout(() => window.location.reload(), 1500);
            } else {
                toast.error(d.error || 'Erro ao restaurar.');
            }
        } catch {
            toast.error('Erro de conexão.');
        }
        setRestoringBkp(false);
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.db')) {
            toast.error('Por favor, selecione um arquivo .db');
            return;
        }

        if (!confirm('Deseja importar este banco de dados? Todos os dados atuais serão perdidos.')) {
            e.target.value = '';
            return;
        }

        setImportingDb(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/backups/import', {
                method: 'POST',
                body: formData
            });
            const d = await res.json();
            if (res.ok) {
                toast.success('Banco importado com sucesso! Recarregando...');
                setTimeout(() => window.location.reload(), 1500);
            } else {
                toast.error(d.error || 'Erro ao importar.');
            }
        } catch {
            toast.error('Erro de conexão.');
        }
        setImportingDb(false);
        e.target.value = '';
    };

    const clearDatabase = async () => {
        setIsClearingDb(true);
        try {
            const res = await fetch('/api/settings/clear-database', { method: 'POST' });
            const d = await res.json();
            if (res.ok) {
                toast.success('Banco de dados limpo com sucesso!');
                setTimeout(() => window.location.reload(), 1500);
            } else {
                toast.error(d.error || 'Erro ao limpar banco de dados.');
            }
        } catch {
            toast.error('Erro de conexão.');
        }
        setIsClearingDb(false);
        setShowClearModal(false);
    };

    return (
        <div className="page-wrapper">
            <Sidebar userRole={userRole} username={username} isOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
            

            <main className="main-content animate-fade">
                <div className="page-header">
                    <div>
                        <h1 className="page-title">Configurações</h1>
                        <p className="page-subtitle">Parmetros de backup e sistema</p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '1.5rem' }}>
                    {/* Server Info Card */}
                    <div className="card" style={{ background: 'linear-gradient(135deg, var(--blue-800), var(--blue-900))', border: '1px solid var(--green-500)', boxShadow: '0 0 15px rgba(29, 128, 70, 0.1)' }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--green-400)' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                            Informações do Servidor (Rede Interna)
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                                Para que outros usuários acessem o sistema na rede interna da UniFAFIRE, utilize um dos endereços abaixo:
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                {serverInfo?.ips.map(ip => (
                                    <div key={ip} style={{ background: 'var(--bg-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <code style={{ color: 'var(--green-300)', fontWeight: 700, fontSize: '0.9rem' }}>http://{ip}:3000</code>
                                        <button className="btn btn-ghost btn-sm" style={{ padding: '0.2rem 0.5rem', height: 'auto', fontSize: '0.65rem' }} onClick={() => {
                                            navigator.clipboard.writeText(`http://${ip}:3000`);
                                            toast.success('Endereço copiado!');
                                        }}>Copiar</button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                                Nome do Servidor: {serverInfo?.hostname || 'carregando...'}
                            </div>
                        </div>
                    </div>
                    {/* System & Security Settings */}
                    <div className="card">
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green-400)" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            Sistema e Segurança
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">Horário de Logout Automático</label>
                                <input className="input" type="time" value={autoLogoutTime} onChange={e => setAutoLogoutTime(e.target.value)} />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Horário em que o sistema força o logout de todos os usuários.</span>
                            </div>
                            <div className="input-group">
                                <label className="input-label">Senha Padrão de Reset</label>
                                <input className="input" type="text" value={defaultResetPassword} onChange={e => setDefaultResetPassword(e.target.value)} />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Senha utilizada ao resetar o acesso de um usuário.</span>
                            </div>
                            <button className="btn btn-green" onClick={saveSettings} disabled={savingSettings} style={{ alignSelf: 'flex-start' }}>
                                {savingSettings ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Salvar Sistema'}
                            </button>
                        </div>
                    </div>

                    {/* Backup Settings */}
                    <div className="card">
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green-400)" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            Backup Automático
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="input-group">
                                <label className="input-label">Horário do Backup</label>
                                <input className="input" type="time" value={backupTime} onChange={e => setBackupTime(e.target.value)} />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Retenção (quantidade de backups)</label>
                                <input className="input" type="number" min={1} max={50} value={backupCount} onChange={e => setBackupCount(Number(e.target.value))} />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Backups mais antigos serão removidos automaticamente.</span>
                            </div>
                            <button className="btn btn-green" onClick={saveSettings} disabled={savingSettings} style={{ alignSelf: 'flex-start' }}>
                                {savingSettings ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Salvar Backup'}
                            </button>
                        </div>
                    </div>

                    {/* Import Database - ONLY ADMIN */}
                    {userRole === 'ADMIN' && (
                    <div className="card">
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green-400)" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Gestão de Banco de Dados
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Import Part */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>Importar Banco (.db)</label>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Substitua o banco de dados atual por um arquivo externo (.db).
                                </p>
                                <label className={`btn btn-blue ${importingDb ? 'disabled' : ''}`} style={{ cursor: importingDb ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                                    {importingDb ? <div className="spinner" style={{ width: 16, height: 16 }} /> : (
                                        <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                            Selecionar e Importar
                                        </>
                                    )}
                                    <input type="file" accept=".db" style={{ display: 'none' }} onChange={handleImportFile} disabled={importingDb} />
                                </label>
                            </div>

                            <div style={{ height: '1px', background: 'var(--border)', opacity: 0.5 }} />

                            {/* Clear Part */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>Limpar Dados</label>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Exclui chaves, funcionários, históricos e logs. Mantém usuários e configurações.
                                </p>
                                <button 
                                    className="btn btn-danger" 
                                    onClick={() => setShowClearModal(true)} 
                                    disabled={isClearingDb}
                                    style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
                                >
                                    {isClearingDb ? <div className="spinner" style={{ width: 16, height: 16 }} /> : (
                                        <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                            Limpar Banco de Dados
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                    )}

                    {/* Manual Backup - ONLY ADMIN */}
                    {userRole === 'ADMIN' && (
                    <div className="card">
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green-400)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            Backups Disponíveis
                        </h2>
                        {bkpReliability && bkpReliability.totalDays > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.625rem 0.75rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.8125rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Confiabilidade (30 dias):</span>
                                <strong style={{ color: bkpReliability.percent === 100 ? 'var(--green-400)' : 'var(--red-500)' }}>
                                    {bkpReliability.percent}%
                                </strong>
                                <span style={{ color: 'var(--text-muted)' }}>({bkpReliability.successDays}/{bkpReliability.totalDays} dias com backup verificado)</span>
                            </div>
                        )}
                        <button className="btn btn-blue" onClick={generateBackup} disabled={generatingBkp} style={{ marginBottom: '1rem', width: '100%' }}>
                            {generatingBkp ? <div className="spinner" style={{ width: 16, height: 16 }} /> : (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                    Gerar Backup Agora
                                </>
                            )}
                        </button>
                        {loadingBkp ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}><div className="spinner" /></div>
                        ) : backups.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem' }}>Nenhum backup encontrado.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {backups.map(b => (
                                    <div key={b.filename} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                                        <div>
                                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>{b.filename}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>{formatDate(b.createdAt)} — {formatBytes(b.size)}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                                            <button className="btn btn-blue btn-icon btn-sm" onClick={() => restoreBackup(b.filename)} disabled={restoringBkp} title="Restaurar este backup">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                            </button>
                                            <button className="btn btn-danger btn-icon btn-sm" onClick={() => deleteBackup(b.filename)} title="Excluir">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    )}
                </div>

                <ConfirmModal 
                    isOpen={showClearModal}
                    title="Limpar Banco de Dados?"
                    message="Esta ação irá excluir permanentemente todas as chaves, funcionários, históricos e logs de atividades. Esta ação não pode ser desfeita. Deseja continuar?"
                    confirmText="Sim, Limpar Tudo"
                    cancelText="Cancelar"
                    onConfirm={clearDatabase}
                    onCancel={() => setShowClearModal(false)}
                    danger={true}
                />
            </main>
        </div>
    );
}
