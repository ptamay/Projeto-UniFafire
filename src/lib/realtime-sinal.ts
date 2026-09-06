'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

// TASK-072 (Sprint 25 · Etapa 5 do ADR-012) — a assinatura do sinal de mudança.
// REQ-032, constitution §3.2.
//
// ## O que este módulo NÃO faz, e é o ponto
//
// Ele não lê dado nenhum do Supabase. Recebe uma mensagem vazia dizendo "algo
// mudou nas chaves" e chama de volta quem estiver ouvindo, para que a tela refaça
// a busca **pelas rotas de sempre** — que validam sessão e papel no servidor.
//
// O caminho natural do Supabase seria `postgres_changes`, entregando a linha
// alterada direto ao navegador. Ele autoriza por RLS, e este sistema tem RLS
// ligado com zero políticas e não usa Supabase Auth: para o Supabase, todo
// usuário daqui é `anon`. Fazê-lo entregar dados exigiria abrir as tabelas de
// chaves para a chave anônima — que vai neste mesmo bundle. Seria trocar 3 s de
// defasagem por leitura pública das tabelas, ao largo do `proxy.ts`.
//
// Por isso o cliente aqui só assina um canal. Se alguém adicionar `.from(...)`
// neste arquivo, há teste que reprova.
//
// ## Sem configuração, sem assinatura — e sem quebrar
//
// Ambiente sem `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` é
// ambiente sem Realtime, não ambiente quebrado: o hook não assina e informa isso
// a quem chamou, para a TASK-073 cair no polling largo. Desenvolvimento local
// contra o container é exatamente esse caso.

/** Nome do canal e do evento. Fixos, e iguais aos da migration do trigger —
 *  se um lado mudar sem o outro, o sinal simplesmente não chega. */
export const CANAL_CHAVES = 'chaves';
export const EVENTO_MUDOU = 'mudou';

/** Estado da assinatura, do ponto de vista de quem depende dela. É o que a
 *  TASK-073 lê para decidir se precisa degradar. */
export type EstadoSinal = 'sem-configuracao' | 'conectando' | 'assinado' | 'falhou';

function credenciais(): { url: string; chave: string } | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && chave ? { url, chave } : null;
}

/**
 * Assina o sinal de mudança das chaves.
 *
 * `aoMudar` é chamada a cada mensagem — e a tela deve reagir refazendo a busca,
 * nunca lendo o conteúdo da mensagem, que é vazio de propósito.
 *
 * `aoMudarEstado` recebe as transições, e existe para a TASK-073: é por ela que a
 * tela sabe que precisa (ou deixou de precisar) do polling largo.
 */
export function useSinalDeMudanca(
    aoMudar: () => void,
    aoMudarEstado?: (estado: EstadoSinal) => void,
) {
    // Refs para que trocar a callback não derrube e recrie a assinatura a cada
    // render — reconectar WebSocket por causa de re-render é custo puro.
    //
    // A atualização vai num efeito, e não no corpo do componente: escrever em ref
    // durante o render é o que a regra `react-hooks/refs` proíbe, porque o render
    // pode ser descartado ou repetido pelo React e a escrita iria junto.
    const aoMudarRef = useRef(aoMudar);
    const aoMudarEstadoRef = useRef(aoMudarEstado);

    useEffect(() => {
        aoMudarRef.current = aoMudar;
        aoMudarEstadoRef.current = aoMudarEstado;
    }, [aoMudar, aoMudarEstado]);

    useEffect(() => {
        const cred = credenciais();
        if (!cred) {
            aoMudarEstadoRef.current?.('sem-configuracao');
            return;
        }

        aoMudarEstadoRef.current?.('conectando');

        const supabase = createClient(cred.url, cred.chave, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        let canal: RealtimeChannel | undefined;
        try {
            canal = supabase
                .channel(CANAL_CHAVES)
                .on('broadcast', { event: EVENTO_MUDOU }, () => aoMudarRef.current())
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') aoMudarEstadoRef.current?.('assinado');
                    // CHANNEL_ERROR, TIMED_OUT e CLOSED são todos "não estou
                    // recebendo": para quem depende do sinal, a distinção não
                    // muda a decisão — só o polling largo resolve os três.
                    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        aoMudarEstadoRef.current?.('falhou');
                    }
                });
        } catch {
            aoMudarEstadoRef.current?.('falhou');
        }

        return () => {
            if (canal) void supabase.removeChannel(canal);
        };
    }, []);
}

// --- TASK-073: a rede de segurança ------------------------------------------
//
// ## Por que ela existe
//
// Antes da TASK-072, o pior caso era 3 s de defasagem. Com a assinatura no lugar
// e sem esta rede, o pior caso vira **defasagem infinita**: o canal falha,
// ninguém é avisado, e a tela mostra para sempre o estado de quando carregou. O
// porteiro entrega uma chave que a tela diz disponível e que outro já levou.
//
// Trocar 3 s por infinito seria piorar o sistema com a desculpa de melhorá-lo.

/** Intervalo do polling de emergência. Trinta segundos, e não três: o REQ-032 tem
 *  duas metades, e a segunda é a cota — o polling de 3 s projetava ~10,5 milhões
 *  de requisições/mês para 10 usuários. Degradar para outro polling de 3 s
 *  devolveria o sincronismo e manteria o problema que motivou a migração. */
export const INTERVALO_POLLING_LARGO = 30_000;

/**
 * Precisa do polling de emergência?
 *
 * A regra é "qualquer coisa que não seja `assinado`". `CHANNEL_ERROR`,
 * `TIMED_OUT`, `CLOSED`, ausência de configuração e "ainda conectando" são
 * estados diferentes com a MESMA consequência — não estou recebendo sinal.
 * Distingui-los aqui só criaria caminhos para esquecer um.
 *
 * Incluir `conectando` sai de graça e dispensa um timeout de conexão separado: o
 * primeiro disparo do intervalo está a 30 s, então uma conexão normal o cancela
 * antes de custar uma requisição sequer, e uma conexão que nunca vem deixa o
 * polling simplesmente acontecer. Um número mágico a menos para acertar.
 */
export function deveFazerPollingLargo(estado: EstadoSinal): boolean {
    return estado !== 'assinado';
}

/**
 * O hook que as telas devem usar: sinal quando há, polling largo quando não há.
 *
 * `useSinalDeMudanca` sozinho não tem rede de segurança. Uma tela que o assinasse
 * cru ficaria congelada no dia em que o Realtime caísse, e o defeito só apareceria
 * naquele dia. Há teste reprovando quem faça isso.
 */
export function useAtualizacaoDeChaves(aoAtualizar: () => void) {
    const [estado, setEstado] = useState<EstadoSinal>('conectando');

    useSinalDeMudanca(aoAtualizar, setEstado);

    const aoAtualizarRef = useRef(aoAtualizar);
    useEffect(() => {
        aoAtualizarRef.current = aoAtualizar;
    }, [aoAtualizar]);

    useEffect(() => {
        if (!deveFazerPollingLargo(estado)) return;

        const intervalo = setInterval(() => aoAtualizarRef.current(), INTERVALO_POLLING_LARGO);
        // O cleanup roda a cada transição de estado — é ele que garante que
        // assinatura e polling nunca corram juntos: no instante em que o estado
        // vira `assinado`, o efeito é desmontado e o intervalo, limpo.
        return () => clearInterval(intervalo);
    }, [estado]);
}
