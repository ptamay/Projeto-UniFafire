'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

// TASK-135 (ADR-031 · REQ-033b) — filtro que não ocupa a tela.
//
// No celular, Histórico e Logs abriam com a primeira tela INTEIRA de filtro: seis campos
// empilhados antes de qualquer registro. Agora a busca fica à vista, e os demais filtros
// moram numa folha que sobe de baixo para cima ao tocar em "Filtros (n)" — o n diz quantos
// estão valendo, para ninguém esquecer um filtro ligado e achar que sumiram registros.
// No desktop os campos continuam na página, como eram (decisão 8 do ADR-031): a folha é a
// mesma marcação, e só o CSS do celular a transforma.

interface Props {
    /** O campo de busca — sempre à vista, fora da folha. */
    busca: ReactNode;
    /** O menu "⋯" de ações da tela (MenuDeAcoes). */
    acoes?: ReactNode;
    /** Quantos filtros estão valendo agora (a busca não conta). */
    ativos: number;
    aoLimpar: () => void;
    /** Os campos de filtro. */
    children: ReactNode;
}

export default function FolhaDeFiltros({ busca, acoes, ativos, aoLimpar, children }: Props) {
    const [aberta, setAberta] = useState(false);
    const id = useId();
    const fecharRef = useRef<HTMLButtonElement>(null);
    const abrirRef = useRef<HTMLButtonElement>(null);

    // Escape fecha; o foco vai para o "fechar" ao abrir e volta ao "Filtros" ao fechar.
    useEffect(() => {
        if (!aberta) return;
        const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberta(false); };
        window.addEventListener('keydown', aoTeclar);
        fecharRef.current?.focus();
        const abrir = abrirRef.current;
        return () => {
            window.removeEventListener('keydown', aoTeclar);
            abrir?.focus();
        };
    }, [aberta]);

    return (
        <>
            <div className="barra-busca-filtros">
                <div className="barra-busca">{busca}</div>
                <button
                    ref={abrirRef}
                    type="button"
                    className="btn btn-ghost btn-filtros"
                    aria-expanded={aberta}
                    aria-controls={id}
                    onClick={() => setAberta(true)}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
                    </svg>
                    Filtros{ativos > 0 ? ` (${ativos})` : ''}
                </button>
                {acoes}
            </div>

            {aberta && <div className="folha-veu" onClick={() => setAberta(false)} aria-hidden="true" />}

            <div id={id} className={`folha-filtros${aberta ? ' is-aberta' : ''}`} role="group" aria-label="Filtros">
                <div className="folha-cabecalho">
                    <span className="folha-titulo">Filtros</span>
                    <button ref={fecharRef} type="button" className="icon-btn" aria-label="Fechar filtros" onClick={() => setAberta(false)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="folha-campos">{children}</div>
                <div className="folha-rodape">
                    <button type="button" className="btn btn-ghost" disabled={ativos === 0} onClick={aoLimpar}>
                        Limpar filtros
                    </button>
                    <button type="button" className="btn btn-principal btn-ver-resultados" onClick={() => setAberta(false)}>
                        Ver resultados
                    </button>
                </div>
            </div>
        </>
    );
}
