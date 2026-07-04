'use client';
import { useState } from 'react';
import Image from 'next/image';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [requireNewPassword, setRequireNewPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPass, setShowPass] = useState(false);
    const [showForgotPopup, setShowForgotPopup] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requireNewPassword ? { username, password, newPassword } : { username, password }),
            });
            const data = await res.json();
            if (res.ok) {
                window.location.href = '/';
            } else {
                if (data.error === 'REQUIRE_PASSWORD_CHANGE') {
                    setRequireNewPassword(true);
                    setError('');
                } else {
                    setError(data.error || 'Credenciais inválidas. Tente novamente.');
                }
            }
        } catch {
            setError('Erro de conexão. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-bg-orb login-bg-orb-1" />
            <div className="login-bg-orb login-bg-orb-2" />

            <div className="login-container animate-slide light-mode">
                <div className="login-brand">
                    <div className="login-logo-wrap">
                        <Image
                            src="/logo/unifafire_logo.png"
                            alt="UniFAFIRE"
                            width={88}
                            height={88}
                            className="login-logo"
                            priority
                        />
                    </div>

                    <p className="login-subtitle">Sistema de Gestão de Chaves</p>
                </div>

                <div className="login-divider">
                    <span>Acesso Restrito</span>
                </div>

                <form onSubmit={handleLogin} className="login-form">
                    {error && (
                        <div className="login-error animate-fade">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {error}
                        </div>
                    )}

                    {requireNewPassword ? (
                        <>
                            <div className="login-divider" style={{ marginTop: '-1rem' }}>
                                <span>Criar Nova Senha</span>
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '0.5rem' }}>
                                É necessário redefinir a senha padrão do sistema.
                            </p>
                            <div className="input-group">
                                <label className="input-label" htmlFor="newPassword">Nova Senha</label>
                                <div className="input-icon-wrap">
                                    <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                    <input
                                        id="newPassword"
                                        type={showPass ? 'text' : 'password'}
                                        className="input input-with-icon input-with-action"
                                        placeholder="Mínimo de 8 caracteres"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        minLength={8}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="input-action-btn"
                                        onClick={() => setShowPass(v => !v)}
                                        tabIndex={-1}
                                        aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                                    >
                                        {showPass ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="input-group">
                                <label className="input-label" htmlFor="username">Usuário</label>
                                <div className="input-icon-wrap">
                                    <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                    </svg>
                                    <input
                                        id="username"
                                        type="text"
                                        className="input input-with-icon"
                                        placeholder="Digite seu usuário"
                                        value={username}
                                        onChange={e => setUsername(e.target.value)}
                                        autoComplete="username"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label" htmlFor="password">Senha</label>
                                <div className="input-icon-wrap">
                                    <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                    <input
                                        id="password"
                                        type={showPass ? 'text' : 'password'}
                                        className="input input-with-icon input-with-action"
                                        placeholder="Digite sua senha"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        autoComplete="current-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="input-action-btn"
                                        onClick={() => setShowPass(v => !v)}
                                        tabIndex={-1}
                                        aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                                    >
                                        {showPass ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                                <line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    <button
                        id="btn-login"
                        type="submit"
                        className="btn btn-green btn-lg login-submit"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <div className="spinner" style={{ width: 18, height: 18 }} />
                                Entrando...
                            </>
                        ) : (
                            <>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                    <polyline points="10 17 15 12 10 7" />
                                    <line x1="15" y1="12" x2="3" y2="12" />
                                </svg>
                                Entrar no Sistema
                            </>
                        )}
                    </button>
                    
                    {!requireNewPassword && (
                        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                            <button
                                type="button"
                                className="btn-link"
                                onClick={() => setShowForgotPopup(true)}
                                style={{ background: 'none', border: 'none', color: 'var(--green-500)', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                                Esqueci minha senha
                            </button>
                        </div>
                    )}
                </form>

                <p className="login-footer-text">Acesso Institucional Protegido</p>
            </div>

            {showForgotPopup && (
                <div className="modal-overlay" onClick={() => setShowForgotPopup(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Recuperação de Acesso</h3>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                            Para garantir a segurança do sistema institucional, a recuperação de senhas é realizada diretamente pelo setor de Administração.
                            <br /><br />
                            Por favor, <strong>entre em contato com um Administrador ou Gestor</strong> para que sua senha seja redefinida no painel de controle.
                        </p>
                        <div className="action-row mt-6" style={{ justifyContent: 'center' }}>
                            <button className="btn btn-green w-full" onClick={() => setShowForgotPopup(false)}>Entendido</button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .login-page {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--blue-950);
                    position: relative;
                    overflow: hidden;
                    padding: 1rem;
                }
                .login-bg-orb { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
                .login-bg-orb-1 {
                    width: 520px; height: 520px;
                    background: radial-gradient(circle, var(--blue-800) 0%, transparent 70%);
                    top: -120px; left: -120px;
                }
                .login-bg-orb-2 {
                    width: 420px; height: 420px;
                    background: radial-gradient(circle, rgba(29,128,70,0.18) 0%, transparent 70%);
                    bottom: -90px; right: -90px;
                }
                .login-container {
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: 20px;
                    padding: 2.5rem 2rem;
                    width: 100%;
                    max-width: 420px;
                    box-shadow: var(--shadow-lg);
                    position: relative;
                    z-index: 1;
                }
                .login-container::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 10%; right: 10%;
                    height: 1px;
                    background: linear-gradient(90deg, transparent, var(--green-400), transparent);
                }
                .login-brand { text-align: center; margin-bottom: 1.75rem; }
                .login-logo-wrap {
                    display: inline-flex;
                    margin-bottom: 1.25rem;
                }
                .login-logo { border-radius: 50%; display: block; }
                .login-title { font-size: 1.625rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.25rem; }
                .login-subtitle { font-size: 0.875rem; color: var(--text-muted); letter-spacing: 0.02em; }
                .login-divider {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin-bottom: 1.75rem;
                    color: var(--text-muted);
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    font-weight: 600;
                }
                .login-divider::before, .login-divider::after {
                    content: ''; flex: 1; height: 1px; background: var(--border);
                }
                .login-form { display: flex; flex-direction: column; gap: 1.25rem; }
                .login-error {
                    display: flex; align-items: center; gap: 0.5rem;
                    padding: 0.75rem 1rem;
                    background: var(--status-inuse-bg);
                    border: 1px solid var(--border-strong);
                    border-radius: var(--radius-sm);
                    color: var(--text-primary); font-size: 0.875rem;
                }
                .input-icon-wrap { position: relative; }
                .input-icon {
                    position: absolute; left: 0.875rem; top: 50%;
                    transform: translateY(-50%); color: var(--text-muted);
                    pointer-events: none; z-index: 1;
                }
                .input-with-icon { padding-left: 2.75rem; }
                .input-with-action { padding-right: 2.75rem; }
                .input-action-btn {
                    position: absolute; right: 0.75rem; top: 50%;
                    transform: translateY(-50%);
                    background: none; border: none; color: var(--text-muted);
                    cursor: pointer; padding: 4px; border-radius: var(--radius-sm);
                    transition: color 0.15s; display: flex; align-items: center;
                }
                .input-action-btn:hover { color: var(--text-accent); }
                .login-submit { width: 100%; margin-top: 0.25rem; min-height: 48px; }
                .login-footer-text {
                    text-align: center; font-size: 0.7rem;
                    color: var(--text-muted); margin-top: 1.5rem; letter-spacing: 0.03em;
                }
                /* TASK-024 (REQ-016): mobile-first — 100dvh acomoda o teclado virtual
                   e o container usa toda a largura útil a partir de 360px */
                @media (max-width: 768px) {
                    .login-page {
                        min-height: 100dvh;
                        align-items: flex-start;
                        padding-top: max(1.5rem, 6dvh);
                    }
                    .login-container { padding: 2rem 1.25rem; }
                    .login-bg-orb-1 { width: 320px; height: 320px; }
                    .login-bg-orb-2 { width: 260px; height: 260px; }
                }
            `}</style>
        </div>
    );
}
