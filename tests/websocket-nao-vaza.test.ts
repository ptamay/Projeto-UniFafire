import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-105 — cada navegação abria um WebSocket novo, e nenhum fechava.
// REQ-032 (restrição de volume), ADR-012.
//
// ## O defeito, medido antes de ser consertado
//
// `useSinalDeMudanca` chamava `createClient(...)` **dentro do efeito**. Cada
// montagem criava um cliente Supabase novo, com o **próprio WebSocket**. E cada
// página renderiza o próprio `Sidebar`, então **toda navegação remonta a
// assinatura**.
//
// A limpeza chamava `supabase.removeChannel(canal)`, que tira o canal do cliente e
// **não fecha o socket**. Medido no navegador em 2026-09-09, com `window.WebSocket`
// instrumentado:
//
//     3 navegações → 4 sockets criados → 4 ainda OPEN
//
// Nenhum fechou. Numa jornada de balcão com dezenas de navegações, uma aba sozinha
// acumula dezenas de conexões — e o plano gratuito do Supabase Realtime tem limite
// de **conexões simultâneas**.
//
// O sintoma seria o pior tipo: o tempo real parando para todo mundo **sem erro
// visível**, com as telas caindo no polling de 30 s. Exatamente a classe de falha
// que o REQ-032 existe para evitar, chegando pelo caminho oposto.
//
// ## Por que a correção é o cliente ÚNICO, e não `disconnect()` na limpeza
//
// Fechar o socket ao desmontar consertaria o vazamento e manteria a ROTATIVIDADE:
// abrir e fechar uma conexão a cada clique no menu. Um cliente por aba elimina o
// problema em vez de limpá-lo — os canais entram e saem, o socket fica.
//
// ## Este arquivo não conta sockets, e por quê
//
// A suíte roda em `environment: 'node'`, sem navegador. O que ela consegue provar é
// a CAUSA: que não se cria um cliente por montagem. A contagem de sockets foi feita
// no navegador, está registrada acima, e é ela que estabelece o número.

const RAIZ = process.cwd();
const MODULO = 'src/lib/realtime-sinal.ts';

const fonte = () => fs.readFileSync(path.resolve(RAIZ, MODULO), 'utf-8');
const semComentarios = () =>
    fonte().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('TASK-105 — um cliente por aba, não um por navegação', () => {
    it('BDD 1: pedir o cliente duas vezes devolve a MESMA instância', async () => {
        // É o cenário que prova a correção. Duas montagens do `Sidebar` — uma por
        // navegação — têm de compartilhar o cliente, e portanto o socket.
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://exemplo.supabase.co');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'chave-de-teste');
        vi.resetModules();

        const { obterClienteDoSinal } = await import('@/lib/realtime-sinal');
        const primeiro = obterClienteDoSinal();
        const segundo = obterClienteDoSinal();

        expect(primeiro, 'não devolveu cliente com as credenciais presentes').not.toBeNull();
        expect(segundo, 'cada chamada cria um cliente novo — e cada cliente, um socket')
            .toBe(primeiro);
    });

    it('BDD 1: sem credenciais, não cria cliente nenhum', async () => {
        // Guarda contra a correção passar do ponto: um singleton criado com
        // credenciais vazias tentaria conectar em `undefined` e ficaria retentando
        // para sempre num ambiente que simplesmente não tem Realtime configurado.
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
        vi.resetModules();

        const { obterClienteDoSinal } = await import('@/lib/realtime-sinal');
        expect(obterClienteDoSinal(), 'criou cliente sem ter para onde conectar').toBeNull();
    });
});

describe('TASK-105 — a causa não pode voltar', () => {
    it('BDD 2: o efeito da assinatura NÃO cria cliente', () => {
        // A guarda anti-reincidência. O cenário acima passaria mesmo se alguém
        // acrescentasse um `createClient` extra dentro do efeito — o singleton
        // continuaria sendo singleton, e o vazamento voltaria ao lado dele.
        const s = semComentarios();
        const inicio = s.indexOf('export function useSinalDeMudanca');
        expect(inicio, 'o hook sumiu do módulo').toBeGreaterThan(-1);
        const corpo = s.slice(inicio, s.indexOf('export const INTERVALO_POLLING_LARGO'));

        expect(corpo, 'voltou a criar um cliente Supabase dentro do hook')
            .not.toMatch(/createClient\s*\(/);
    });

    it('BDD 2: o canal continua sendo removido ao desmontar', () => {
        // Com um socket só, os CANAIS passam a ser o que se acumula: cada montagem
        // assina `chaves` de novo, e sem `removeChannel` o mesmo cliente ficaria com
        // dezenas de assinaturas do mesmo evento — a callback dispararia N vezes por
        // sinal, e cada disparo é um refetch. O vazamento mudaria de forma.
        expect(semComentarios(), 'o canal deixou de ser removido na limpeza')
            .toMatch(/removeChannel\s*\(/);
    });

    it('BDD 2: `createClient` é importado uma vez e usado num lugar só', () => {
        const s = semComentarios();
        const usos = (s.match(/createClient\s*\(/g) ?? []).length;
        expect(usos, `createClient é chamado em ${usos} lugares`).toBe(1);
    });
});
