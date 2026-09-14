'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// TASK-135 (ADR-031) — as ações de uma tela num menu "⋯".
//
// No Histórico, "Exportar PDF" e "Imprimir / Gerar PDF" ocupavam dois botões de largura
// cheia no topo do celular e faziam quase a mesma coisa. Ação de relatório é de menos uso
// que ler a lista: vai para o menu, e o que sobra é um PDF só.

export interface Acao {
    rotulo: string;
    aoEscolher: () => void;
    desabilitada?: boolean;
    icone?: ReactNode;
}

export default function MenuDeAcoes({ acoes }: { acoes: Acao[] }) {
    const [aberto, setAberto] = useState(false);
    const raiz = useRef<HTMLDivElement>(null);

    // Fecha ao tocar fora e com Escape — o menu não pode ficar preso aberto.
    useEffect(() => {
        if (!aberto) return;
        const fora = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
        const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
        document.addEventListener('pointerdown', fora);
        window.addEventListener('keydown', aoTeclar);
        return () => {
            document.removeEventListener('pointerdown', fora);
            window.removeEventListener('keydown', aoTeclar);
        };
    }, [aberto]);

    return (
        <div className="menu-acoes" ref={raiz}>
            <button
                type="button"
                className="btn btn-ghost btn-icon menu-acoes-botao"
                aria-label="Mais ações"
                aria-haspopup="menu"
                aria-expanded={aberto}
                onClick={() => setAberto(a => !a)}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                </svg>
            </button>
            {aberto && (
                <div className="menu-acoes-lista" role="menu">
                    {acoes.map(a => (
                        <button
                            key={a.rotulo}
                            type="button"
                            role="menuitem"
                            className="menu-acoes-item"
                            disabled={a.desabilitada}
                            onClick={() => { setAberto(false); a.aoEscolher(); }}
                        >
                            {a.icone}
                            {a.rotulo}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
