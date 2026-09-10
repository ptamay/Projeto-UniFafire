'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

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

// ── Um cliente por aba (TASK-105) ───────────────────────────────────────────
//
// ## O que estava errado
//
// `createClient(...)` vivia DENTRO do efeito. Cada montagem criava um cliente novo,
// com o **próprio WebSocket** — e cada página renderiza o próprio `Sidebar`, então
// toda navegação remontava a assinatura. A limpeza chamava `removeChannel(canal)`,
// que tira o canal do cliente e **não fecha o socket**.
//
// Medido no navegador em 2026-09-09: **3 navegações → 4 sockets, 4 ainda OPEN.**
// Nenhum fechou. Numa jornada de balcão, uma aba acumula dezenas de conexões — e o
// plano gratuito do Supabase Realtime tem limite de conexões SIMULTÂNEAS. O sintoma
// seria o tempo real parar para todos **sem erro visível**, com as telas caindo no
// polling de 30 s.
//
// ## Por que cliente único, e não `disconnect()` na limpeza
//
// Fechar o socket ao desmontar consertaria o vazamento e manteria a ROTATIVIDADE:
// abrir e fechar conexão a cada clique no menu. Um cliente por aba elimina o
// problema em vez de limpá-lo — os canais entram e saem, o socket fica.
//
// ## Por que preguiçoso, e não no topo do módulo
//
// Criar no topo executaria no import, inclusive onde não há credencial — e um
// cliente apontando para `undefined` retenta para sempre. `null` aqui significa
// "este ambiente não tem Realtime", que é um estado legítimo (`sem-configuracao`).

let clienteDoSinal: SupabaseClient | null | undefined;

/** O cliente Realtime da aba. Criado na primeira chamada e reaproveitado por todas
 *  as montagens seguintes; `null` quando o ambiente não tem credenciais. */
export function obterClienteDoSinal(): SupabaseClient | null {
    if (clienteDoSinal !== undefined) return clienteDoSinal;

    const cred = credenciais();
    clienteDoSinal = cred
        ? createClient(cred.url, cred.chave, {
            auth: { persistSession: false, autoRefreshToken: false },
        })
        : null;
    return clienteDoSinal;
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
        // TASK-105: o cliente vem do escopo do módulo. Criar um aqui abria um
        // WebSocket por montagem, e nenhum era fechado.
        const supabase = obterClienteDoSinal();
        if (!supabase) {
            aoMudarEstadoRef.current?.('sem-configuracao');
            return;
        }

        aoMudarEstadoRef.current?.('conectando');

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

        // O canal SAI, o socket FICA. Com um cliente só, é o canal que passaria a
        // se acumular: cada montagem assina `chaves` de novo, e sem isto o mesmo
        // cliente ficaria com N assinaturas do mesmo evento — a callback dispararia
        // N vezes por sinal, e cada disparo é um refetch. O vazamento mudaria de
        // forma em vez de sumir.
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
// ── Estado compartilhado do sinal (TASK-097) ────────────────────────────────
//
// A tela de Configurações precisa EXIBIR se a atualização em tempo real está
// funcionando. Assinar o canal lá abriria um SEGUNDO WebSocket na mesma aba — o
// `Sidebar` já mantém um —, ou seja, uma conexão a mais para mostrar o estado de
// uma conexão. Em vez disso, quem já assina PUBLICA o estado aqui, e quem quiser
// exibir apenas lê.
//
// Store minúsculo em vez de Context: o Provider teria de embrulhar o layout
// inteiro para servir uma linha de texto numa tela, e `useSyncExternalStore` é o
// que o React oferece exatamente para estado externo — o projeto já o usa em
// `use-client-clock`.

let estadoCompartilhado: EstadoSinal = 'conectando';
const ouvintes = new Set<() => void>();

function publicarEstado(estado: EstadoSinal) {
    if (estado === estadoCompartilhado) return;
    estadoCompartilhado = estado;
    ouvintes.forEach(f => f());
}

/** Lê o estado da assinatura que JÁ existe. Não cria assinatura nenhuma. */
export function useEstadoDoSinal(): EstadoSinal {
    return useSyncExternalStore(
        (f) => { ouvintes.add(f); return () => ouvintes.delete(f); },
        () => estadoCompartilhado,
        // No servidor não há assinatura, e afirmar 'assinado' faria a tela nascer
        // mentindo por um instante. `conectando` é o que de fato se sabe ali.
        () => 'conectando' as EstadoSinal,
    );
}

export function useAtualizacaoDeChaves(aoAtualizar: () => void) {
    const [estado, setEstado] = useState<EstadoSinal>('conectando');

    useSinalDeMudanca(aoAtualizar, (novo) => {
        setEstado(novo);
        publicarEstado(novo);
    });

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
