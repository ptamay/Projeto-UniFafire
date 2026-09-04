import React from 'react';

type Props = {
    isOpen: boolean;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
    danger?: boolean;
};

export default function ConfirmModal({ isOpen, title = 'Confirmação', message, confirmText = 'Confirmar', cancelText = 'Cancelar', onConfirm, onCancel, danger = true }: Props) {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: danger ? 'var(--danger-bg)' : 'var(--bg-selection)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={danger ? 'var(--danger-text)' : 'var(--green-400)'} strokeWidth="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                        </div>
                        <h3 className="modal-title">{title}</h3>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={onCancel}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6, fontSize: '0.9375rem' }}>{message}</p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={onCancel}>{cancelText}</button>
                    <button className={`btn ${danger ? 'btn-danger' : 'btn-green'}`} onClick={() => { onConfirm(); onCancel(); }}>{confirmText}</button>
                </div>
            </div>
        </div>
    );
}
