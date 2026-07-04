'use client';
import { useState } from 'react';
import Image from 'next/image';
import './login.css';

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
        </div>
    );
}
