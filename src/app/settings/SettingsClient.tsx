'use client';
import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/ConfirmModal';
import { descreverConfiabilidade, type BackupReliability } from '@/lib/backup-reliability';
import { formatTimestamp } from '@/lib/time-filters';

// TASK-075: a tela deixou de listar arquivos `.db` em disco. Os dumps vivem num
// repositorio privado (TASK-078); o que a aplicacao conhece e o REGISTRO de cada
// execucao.
interface BackupRun {
    id: number;
    ranAt: string;
    succeeded: boolean;
    sizeBytes: number | null;
    error: string | null;
    destination: string | null;
}

function formatBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

interface Props {
    userRole: string;
    username: string;
}

export default function SettingsClient({ userRole, username }: Props) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [autoLogoutTime, setAutoLogoutTime] = useState('18:30');
    const [defaultResetPassword, setDefaultResetPassword] = useState('unifafire123');
    const [runs, setRuns] = useState<BackupRun[]>([]);
    const [loadingBkp, setLoadingBkp] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    const [isClearingDb, setIsClearingDb] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const [bkpReliability, setBkpReliability] = useState<BackupReliability | null>(null);
    // Falha de LEITURA da metrica nao pode virar "nenhuma execucao": as duas
    // aparecem iguais na tela e so uma delas significa que o backup parou.
    const [bkpIndisponivel, setBkpIndisponivel] = useState(false);

    const fetchBackups = () => {
        fetch('/api/backups')
            .then(r => r.ok ? r.json() : [])
            .then(d => { setRuns(Array.isArray(d) ? d : []); setLoadingBkp(false); })
            .catch(() => { setRuns([]); setLoadingBkp(false); });
        // TASK-032/TASK-075: confiabilidade do backup (spec §5, alvo 100%),
        // lida de `backup_runs`.
        fetch('/api/backups/reliability')
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d && typeof d.totalDays === 'number') { setBkpReliability(d); setBkpIndisponivel(false); }
                else { setBkpReliability(null); setBkpIndisponivel(true); }
            })
            .catch(() => { setBkpReliability(null); setBkpIndisponivel(true); });
    };

    useEffect(() => {
        fetch('/api/settings').then(r => r.json()).then(d => {
            if (d.autoLogoutTime) setAutoLogoutTime(d.autoLogoutTime);
            if (d.defaultResetPassword) setDefaultResetPassword(d.defaultResetPassword);
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
                    autoLogoutTime, 
                    defaultResetPassword 
                }) 
            });
            if (res.ok) toast.success('Configurações salvas!');
            else { const d = await res.json(); toast.error(d.error || 'Erro ao salvar.'); }
        } catch { toast.error('Erro de conexão.'); }
        setSavingSettings(false);
    };

    // Saíram nesta task (TASK-082) três coisas que a tela oferecia e o sistema não
    // fazia — `generateBackup` (POST que sempre 503 desde a TASK-070) e
    // `handleImportFile` (importar `.db`, formato fora do runtime desde a Sprint
    // 21) —, somadas a `deleteBackup` e `restoreBackup`, que já haviam saído na
    // TASK-075.
    //
    // O que sobrou nesta tela sobre backup é leitura: confiabilidade e histórico
    // de execuções, vindos de `backup_runs`. Gerar e restaurar são operações com
    // credencial, e vivem no runbook.


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
                    {/* O card "Informacoes do Servidor (Rede Interna)" saiu na TASK-079.
                        Ele listava os IPs da maquina para acesso pela rede da instituicao —
                        uma topologia que deixou de existir com o deploy na Vercel. Endereco
                        de acesso agora e uma URL so, e ela nao vem de `os.networkInterfaces()`. */}
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

                    {/* Limpeza de dados — ONLY ADMIN. O bloco de importar .db saiu na
                        TASK-082: `.db` e SQLite, formato fora do runtime desde a Sprint 21. */}
                    {userRole === 'ADMIN' && (
                    <div className="card">
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green-400)" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Gestão de Banco de Dados
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                            Backup
                        </h2>

                        {/* TASK-075: o bloco aparece SEMPRE. Antes ele era
                            condicionado a existir dado na janela, e com isso o
                            unico estado que precisava gritar — nenhum backup
                            rodou — era o unico que sumia da tela. */}
                        {(() => {
                            if (bkpIndisponivel) {
                                return (
                                    <div className="bkp-status bkp-status--alerta">
                                        <strong>Não foi possível ler as execuções de backup</strong>
                                        <span>Isto não quer dizer que o backup falhou — quer dizer que não sabemos. Verifique a conexão com o banco.</span>
                                    </div>
                                );
                            }
                            if (!bkpReliability) {
                                return <div className="bkp-status"><span>Carregando confiabilidade…</span></div>;
                            }
                            const d = descreverConfiabilidade(bkpReliability);
                            return (
                                <div className={`bkp-status bkp-status--${d.tom}`}>
                                    <strong>{d.titulo}</strong>
                                    <span>{d.detalhe}</span>
                                </div>
                            );
                        })()}

                        {/* No lugar do botão que sempre recusava e dos campos que
                            ninguém lia: o arranjo real, verificável. */}
                        <div className="bkp-como">
                            <strong>Como o backup funciona</strong>
                            <ul>
                                <li>Diário, às <strong>03:00</strong> (horário de Recife), executado pelo <strong>GitHub Actions</strong>.</li>
                                <li>Cada dump é <strong>verificado por restauração</strong> num banco descartável antes de ser guardado — contagens e estrutura conferidas contra a origem.</li>
                                <li>Guardado num <strong>repositório privado separado</strong>; a retenção é o histórico dele.</li>
                                <li>Para gerar fora de hora ou restaurar, veja <code>docs/runbook-deploy.md</code> — são operações com credencial, fora desta tela.</li>
                            </ul>
                        </div>

                        <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Últimas execuções</h3>
                        {loadingBkp ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}><div className="spinner" /></div>
                        ) : runs.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem' }}>
                                Nenhuma execução registrada ainda.
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {runs.map(r => (
                                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.75rem', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {formatTimestamp(r.ranAt)}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem', overflowWrap: 'anywhere' }}>
                                                {r.succeeded
                                                    ? `${r.sizeBytes !== null ? formatBytes(r.sizeBytes) : 'tamanho não registrado'}${r.destination ? ` — ${r.destination}` : ''}`
                                                    : (r.error || 'falhou sem mensagem registrada')}
                                            </div>
                                        </div>
                                        <span style={{ flexShrink: 0, fontSize: '0.75rem', fontWeight: 700, color: r.succeeded ? 'var(--green-400)' : 'var(--danger-text)' }}>
                                            {r.succeeded ? 'verificado' : 'FALHOU'}
                                        </span>
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
