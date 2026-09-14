'use client';

import { useLinkStatus } from 'next/link';
import { createPortal } from 'react-dom';

// TASK-128 (CR Tipo C · ADR-029) — o clique responde na hora, sem apagar a tela.
//
// Sem `loading.tsx`, a tela atual fica visível até a próxima estar pronta — é o que tira o
// corte seco. Mas então o clique precisa de resposta própria, senão volta o problema que a
// TASK-096 resolveu: tela parada, sem sinal, e a pessoa clica de novo.
//
// Vai DENTRO de um `<Link>`: `useLinkStatus()` diz se a navegação DAQUELE link está pendente.
// Enquanto está:
//   - `.nav-pendente` marca o item (o CSS dá a ele o estilo de ativo, por `:has()`);
//   - `.barra-navegacao` corre no topo da tela. Por portal, porque no celular o menu é uma
//     gaveta com `transform`, e um `position: fixed` lá dentro ficaria preso à caixa dela.
//     O CSS só a revela depois de ~100 ms: navegação rápida não pisca nada.
export default function IndicadorDeNavegacao() {
    const { pending } = useLinkStatus();
    if (!pending) return null;
    return (
        <>
            <span className="nav-pendente" aria-hidden="true" />
            {createPortal(
                <div className="barra-navegacao" role="progressbar" aria-label="Carregando a tela" />,
                document.body,
            )}
        </>
    );
}
