'use client';
import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/ConfirmModal';
import { descreverConfiabilidade, type BackupReliability } from '@/lib/backup-reliability';
import { formatTimestamp } from '@/lib/time-filters';
import { AUTO_LOGOUT_PADRAO } from '@/lib/settings-policy';
import { AGENDA_PADRAO, LIMITES, descreverHorarios } from '@/lib/agenda-backup.mjs';

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

// TASK-111 (ADR-025): o card "Atualização em Tempo Real" (TASK-097) saiu desta tela.
// O estado virou um ponto discreto no rodapé do shell (`Sidebar`), presente em toda
// página — e continua lendo a assinatura compartilhada, sem abrir outra.

interface Props {
    userRole: string;
    username: string;
}

export default function SettingsClient({ userRole, username }: Props) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [autoLogoutTime, setAutoLogoutTime] = useState(AUTO_LOGOUT_PADRAO);
    const [runs, setRuns] = useState<BackupRun[]>([]);
    const [loadingBkp, setLoadingBkp] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    const [isClearingDb, setIsClearingDb] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const [bkpReliability, setBkpReliability] = useState<BackupReliability | null>(null);
    // Falha de LEITURA da metrica nao pode virar "nenhuma execucao": as duas
    // aparecem iguais na tela e so uma delas significa que o backup parou.
    const [bkpIndisponivel, setBkpIndisponivel] = useState(false);
    // TASK-112 (ADR-024) — a agenda do backup. O workflow a lê de hora em hora
    // (`db/agenda-backup.mjs`), com a mesma política que valida aqui.
    const [agenda, setAgenda] = useState(AGENDA_PADRAO);
    const [salvandoAgenda, setSalvandoAgenda] = useState(false);

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
        });
        // loadingBkp já inicia true — busca direta evita setState síncrono no effect
        fetchBackups();
        // A agenda é só de ADMIN (a rota devolve 403 para os outros papéis).
        if (userRole === 'ADMIN') {
            fetch('/api/backups/agenda')
                .then(r => (r.ok ? r.json() : null))
                .then(d => { if (d && typeof d.hora === 'number') setAgenda({ hora: d.hora, vezes: d.vezes, dias: d.dias }); })
                .catch(() => {});
        }
    }, [userRole]);

    const salvarAgenda = async () => {
        setSalvandoAgenda(true);
        try {
            const res = await fetch('/api/backups/agenda', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(agenda),
            });
            const d = await res.json();
            if (res.ok) toast.success(`Backup agendado para ${descreverHorarios(d)}, guardado por ${d.dias} dias.`);
            else toast.error(d.error || 'Erro ao salvar a agenda.');
        } catch { toast.error('Erro de conexão.'); }
        setSalvandoAgenda(false);
    };

    const saveSettings = async () => {
        setSavingSettings(true);
        try {
            const res = await fetch('/api/settings', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ autoLogoutTime }) 
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
                        <p className="page-subtitle">Parâmetros do sistema e estado do backup</p>
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
                            {/* TASK-094 (ADR-017) — o campo "Senha Padrao de Reset" saiu, e
                                NADA ocupou o lugar. Cheguei a por aqui um card explicando
                                que nao existe senha padrao; saiu por decisao do usuario, e
                                a razao e a mesma do ADR-013: a tela reflete o sistema que
                                EXISTE, nao narra o que foi removido. Um aviso sobre a
                                ausencia mantem o assunto vivo numa tela onde ele acabou.
                                Onde o codigo de uso unico precisa ser explicado e em
                                Usuarios, no momento do reset — e la o modal ja explica. */}
                            {/* TASK-111 (ADR-025): o "Rever tutorial" que morava aqui
                                virou o "?" do shell — alcançável de toda tela e por todos
                                os papéis, e não só por quem abre Configurações. */}
                            <div>
                                <button className="btn btn-green" onClick={saveSettings} disabled={savingSettings}>
                                    {savingSettings ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Salvar Sistema'}
                                </button>
                            </div>
                        </div>
                    </div>


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

                        {/* TASK-111 (ADR-025): só o estado. A lista de execuções —
                            uma por dia — fazia a página rolar, e o que o ADMIN precisa
                            aqui é saber se o backup está em dia. O fato que a lista
                            protegia (TASK-082: é aqui que se descobre que o backup
                            PAROU) sobrevive no último backup, dito com o resultado. */}
                        {(() => {
                            if (loadingBkp) return <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><div className="spinner" /></div>;
                            const ultimo = runs[0];
                            if (!ultimo) {
                                return <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: '1rem' }}>Nenhuma execução registrada ainda.</p>;
                            }
                            return (
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1rem' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Último backup</div>
                                        <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {formatTimestamp(ultimo.ranAt)}
                                            {ultimo.succeeded && ultimo.sizeBytes !== null && (
                                                <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {formatBytes(ultimo.sizeBytes)}</span>
                                            )}
                                        </div>
                                        {!ultimo.succeeded && (
                                            <div style={{ fontSize: '0.8125rem', color: 'var(--danger-text)', overflowWrap: 'anywhere' }}>
                                                {ultimo.error || 'falhou sem mensagem registrada'}
                                            </div>
                                        )}
                                    </div>
                                    <span style={{ flexShrink: 0, fontSize: '0.8125rem', fontWeight: 700, color: ultimo.succeeded ? 'var(--green-400)' : 'var(--danger-text)' }}>
                                        {ultimo.succeeded ? 'verificado' : 'FALHOU'}
                                    </span>
                                </div>
                            );
                        })()}

                        {/* TASK-112 (ADR-024) — a agenda VOLTA à tela porque agora é
                            obedecida: o workflow roda de hora em hora e consulta estas
                            linhas. TASK-113: a retenção entra junto com a poda que a
                            aplica (`db/enviar-backup.mjs`) — antes dela, seria o controle
                            inerte do ADR-013. */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(6.5rem, 1fr))', gap: '0.75rem', marginTop: '1.25rem' }}>
                            <div className="input-group">
                                <label className="input-label" htmlFor="bkp-hora">Horário</label>
                                <select id="bkp-hora" className="input" value={agenda.hora}
                                    onChange={e => setAgenda(a => ({ ...a, hora: Number(e.target.value) }))}>
                                    {Array.from({ length: LIMITES.hora[1] + 1 }, (_, h) => (
                                        <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                                    ))}
                                </select>
                            </div>
                            <div className="input-group">
                                <label className="input-label" htmlFor="bkp-vezes">Vezes por dia</label>
                                <select id="bkp-vezes" className="input" value={agenda.vezes}
                                    onChange={e => setAgenda(a => ({ ...a, vezes: Number(e.target.value) }))}>
                                    {Array.from({ length: LIMITES.vezes[1] - LIMITES.vezes[0] + 1 }, (_, i) => i + LIMITES.vezes[0]).map(v => (
                                        <option key={v} value={v}>{v}× por dia</option>
                                    ))}
                                </select>
                            </div>
                            <div className="input-group">
                                <label className="input-label" htmlFor="bkp-dias">Guardar por</label>
                                <select id="bkp-dias" className="input" value={agenda.dias}
                                    onChange={e => setAgenda(a => ({ ...a, dias: Number(e.target.value) }))}>
                                    {Array.from({ length: LIMITES.dias[1] - LIMITES.dias[0] + 1 }, (_, i) => i + LIMITES.dias[0]).map(d => (
                                        <option key={d} value={d}>{d} dias</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '0.75rem' }}>
                            Pelo GitHub Actions, por volta de <strong style={{ color: 'var(--text-secondary)' }}>{descreverHorarios(agenda)}</strong> (horário
                            de Recife) — o GitHub pode atrasar alguns minutos. Cada dump é verificado por restauração antes de ser guardado.
                        </p>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '0.5rem' }}>
                            Ficam os backups dos últimos <strong style={{ color: 'var(--text-secondary)' }}>{agenda.dias} dias</strong>, contando
                            hoje. Os mais antigos são apagados do repositório privado a cada novo backup, inclusive do histórico — não há como
                            recuperá-los depois.
                        </p>
                        <div style={{ marginTop: '0.75rem' }}>
                            <button className="btn btn-green" onClick={salvarAgenda} disabled={salvandoAgenda}>
                                {salvandoAgenda ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Salvar agenda'}
                            </button>
                        </div>
                    </div>
                    )}
                </div>

                
                {/* ── ZONA DE PERIGO (TASK-097) ──
                    Fora da grade, no fim da pagina, com moldura propria.
                    Antes, "Limpar Banco de Dados" era um cartao como os outros: um
                    botao vermelho com o MESMO PESO VISUAL de um campo de horario, ao
                    lado de preferencias. Acao irreversivel nao divide espaco com
                    preferencia — quem chega aqui tem de saber que mudou de assunto. */}
                {userRole === 'ADMIN' && (
                <section
                    aria-labelledby="zona-perigo"
                    style={{
                        marginTop: '2.5rem', padding: '1.25rem',
                        border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)',
                        background: 'var(--danger-bg, transparent)',
                    }}
                >
                    <h2 id="zona-perigo" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        Zona de Perigo
                    </h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <div style={{ maxWidth: 520 }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Limpar Banco de Dados</div>
                            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '0.25rem' }}>
                                Exclui chaves, funcionários, históricos e logs. Mantém usuários e configurações.{' '}
                                <strong>Não há desfazer</strong> — a recuperação depende do backup diário.
                            </p>
                        </div>
                        <button
                            className="btn btn-danger"
                            onClick={() => setShowClearModal(true)}
                            disabled={isClearingDb}
                            style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', flexShrink: 0 }}
                        >
                            {isClearingDb ? <div className="spinner" style={{ width: 16, height: 16 }} /> : (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                                    Limpar Banco de Dados
                                </>
                            )}
                        </button>
                    </div>
                </section>
                )}

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
