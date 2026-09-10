'use client';

import { useEffect, useState, useRef } from 'react';

// TASK-098 (ADR-018) — o tutorial de primeiro acesso.
//
// ## Por que por papel
//
// O PORTEIRO precisa aprender o balcão: escolher a pessoa, solicitar, e que a
// entrega só se completa com a confirmação dela. O ALUNO precisa saber onde vê as
// próprias chaves e que **é ele quem confirma**.
//
// O mesmo tutorial para os dois ensina a pessoa errada — e um tutorial que ensina
// errado é pior que nenhum, porque consome a única vez que alguém presta atenção.
//
// ## Por que ele é dispensável
//
// A primeira retirada de chave pode ser urgente. Um tutorial que impede de
// trabalhar é um obstáculo com cara de ajuda: sai com Escape, com o botão, ou
// clicando fora — e sair já conta como visto, porque insistir com quem dispensou é
// a mesma falta de respeito, repetida.

type Passo = { titulo: string; texto: string };

/** Onde a pessoa realmente vai clicar, na ordem em que vai precisar. Nada de
 *  "bem-vindo ao sistema": cada passo aponta uma tela e diz o que fazer nela. */
function passosDoBalcao(): Passo[] {
    return [
        {
            titulo: 'O balcão fica no Dashboard',
            texto: 'A lista mostra todas as chaves e quem está com cada uma. Os filtros no topo separam '
                + 'o que está disponível do que está em uso.',
        },
        {
            titulo: 'Para entregar uma chave',
            texto: 'Na linha da chave, escolha a pessoa no campo "Usuário" e clique em Solicitar. '
                + 'A chave sai do disponível e fica aguardando.',
        },
        {
            titulo: 'A entrega só se completa quando a pessoa confirma',
            texto: 'Isto é a dupla confirmação, e é o que mais gera dúvida: a chave NÃO passa para o nome '
                + 'dela até que ela confirme, na própria conta, em Confirmações. Enquanto isso, aparece '
                + 'como aguardando — não é travamento.',
        },
        {
            titulo: 'A devolução funciona igual',
            texto: 'Você registra a devolução e a outra parte confirma. Em Histórico ficam todas as '
                + 'movimentações, com data e responsável.',
        },
    ];
}

function passosDoUsuario(): Passo[] {
    return [
        {
            titulo: 'Suas chaves ficam no Dashboard',
            texto: 'A tela abre já filtrada nas chaves que estão com você. Nada aqui exige procurar.',
        },
        {
            titulo: 'Você confirma o que recebe',
            texto: 'Quando a portaria registrar a entrega de uma chave para você, aparece um aviso em '
                + 'Confirmações. **Enquanto você não confirmar, a chave não passa para o seu nome** — '
                + 'e é assim que se evita chave registrada para quem não a pegou.',
        },
        {
            titulo: 'A devolução também é confirmada',
            texto: 'Ao devolver, a portaria registra e você confirma do mesmo jeito. O sino no menu '
                + 'mostra quando há algo esperando por você.',
        },
    ];
}

interface Props {
    papel: string;
    /** Primeiro acesso: abre sozinho. Em "rever tutorial", vem `false` e quem abre
     *  é o botão. */
    abrirAoMontar?: boolean;
    aberto?: boolean;
    aoFechar?: () => void;
}

export default function Tutorial({ papel, abrirAoMontar = false, aberto, aoFechar }: Props) {
    const controlado = aberto !== undefined;
    const [abertoInterno, setAbertoInterno] = useState(abrirAoMontar);
    const estaAberto = controlado ? aberto : abertoInterno;

    const [passo, setPasso] = useState(0);
    const fechaRef = useRef<HTMLButtonElement>(null);

    const operaBalcao = ['ADMIN', 'GESTOR', 'PORTEIRO'].includes(papel);
    const passos = operaBalcao ? passosDoBalcao() : passosDoUsuario();
    const ultimo = passo === passos.length - 1;

    function fechar() {
        // Marcar como visto é melhor-esforço: se a rede falhar, a pessoa vê o
        // tutorial de novo no próximo acesso — incômodo, e melhor do que prender
        // alguém numa tela porque uma requisição não voltou.
        void fetch('/api/account/onboarding', { method: 'POST' }).catch(() => {});
        setPasso(0);
        if (controlado) aoFechar?.();
        else setAbertoInterno(false);
    }

    // Escape fecha. Sem isto, quem navega por teclado fica preso — e o overlay
    // cobre a tela inteira.
    useEffect(() => {
        if (!estaAberto) return;
        const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
        window.addEventListener('keydown', aoTeclar);
        fechaRef.current?.focus();
        return () => window.removeEventListener('keydown', aoTeclar);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [estaAberto]);

    if (!estaAberto) return null;

    const atual = passos[passo];

    return (
        <div className="modal-overlay" onClick={fechar}>
            <div
                className="modal-box"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tutorial-titulo"
                style={{ maxWidth: 460 }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                        Passo {passo + 1} de {passos.length}
                    </span>
                    <button
                        ref={fechaRef}
                        onClick={fechar}
                        className="btn-icon"
                        aria-label="Fechar tutorial"
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}
                    >
                        Pular
                    </button>
                </div>

                <h2 id="tutorial-titulo" style={{ fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.2, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                    {atual.titulo}
                </h2>
                <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                    {atual.texto.split('**').map((parte, i) =>
                        i % 2 === 1 ? <strong key={i} style={{ color: 'var(--text-primary)' }}>{parte}</strong> : parte,
                    )}
                </p>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.35rem', flex: 1 }} aria-hidden="true">
                        {passos.map((_, i) => (
                            <span
                                key={i}
                                style={{
                                    width: i === passo ? 20 : 7, height: 7, borderRadius: 4,
                                    background: i === passo ? 'var(--green-400)' : 'var(--border-strong)',
                                    transition: 'width .2s',
                                }}
                            />
                        ))}
                    </div>
                    {passo > 0 && (
                        <button className="btn" onClick={() => setPasso(p => p - 1)}>
                            Voltar
                        </button>
                    )}
                    <button
                        className="btn btn-green"
                        onClick={() => (ultimo ? fechar() : setPasso(p => p + 1))}
                    >
                        {ultimo ? 'Entendi' : 'Próximo'}
                    </button>
                </div>
            </div>
        </div>
    );
}
