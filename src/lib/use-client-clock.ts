'use client';

import { useSyncExternalStore } from 'react';

// TASK-058 — relógio que só existe no cliente.
//
// Componentes são renderizados duas vezes: no servidor e de novo na hidratação.
// Qualquer valor derivado do relógio diverge entre as duas, o React acusa
// "Hydration failed" e descarta a árvore vinda do servidor.
//
// useSyncExternalStore é o mecanismo do próprio React para fonte externa mutável:
// durante o SSR e a hidratação ele usa `getServerSnapshot` (nulo — servidor e
// cliente concordam em não ter hora), e só depois passa a `getSnapshot`. Evita
// tanto o mismatch quanto o `setState` dentro de efeito.

const REFRESH_MS = 60_000;

function subscribe(onChange: () => void): () => void {
    const id = setInterval(onChange, REFRESH_MS);
    return () => clearInterval(id);
}

// getSnapshot roda a cada render e precisa devolver o MESMO valor enquanto nada
// mudou — devolver Date.now() cru re-renderizaria em laço. Cacheado por minuto.
let cached = { slot: -1, value: 0 };

function getSnapshot(): number {
    const slot = Math.floor(Date.now() / REFRESH_MS);
    if (slot !== cached.slot) cached = { slot, value: Date.now() };
    return cached.value;
}

function getServerSnapshot(): number | null {
    return null;
}

/** Instante atual (epoch ms), ou null antes da hidratação. Atualiza a cada minuto. */
export function useClientClock(): number | null {
    return useSyncExternalStore<number | null>(subscribe, getSnapshot, getServerSnapshot);
}
