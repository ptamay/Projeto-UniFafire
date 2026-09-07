import { describe, it, expect, vi } from 'vitest';
import { buscarDadosDoDashboard } from '@/lib/dashboard-refresh';

// TASK-091 (REQ-032) — a atualização do dashboard busca em PARALELO.
//
// ## O defeito, e por que ele não tem sintoma
//
// `refreshData` fazia `await fetch('/api/keys')` e SÓ ENTÃO `await
// fetch('/api/users')`. As duas não dependem uma da outra: a segunda não usa nada
// da primeira. Serializadas, a tela espera as duas viagens somadas.
//
// Nada quebra por causa disso — a tela atualiza certo, só que mais tarde. É por
// isso que passou despercebido desde que o dashboard existe: o único jeito de
// perceber é MEDIR.
//
// ## O número que motivou
//
// Medição do REQ-032 em 2026-09-07 (`plan.md`, Sprint 25): cada rota que toca o
// banco custa ~335 ms em produção. Serial, o dashboard de PORTEIRO/ADMIN gastava
// 670 ms só de busca, num orçamento de 500 ms para a defasagem INTEIRA.
//
// ## Por que existe um módulo em vez de um `Promise.all` solto
//
// `refreshData` vive dentro de um componente cliente que arrasta `next/navigation`,
// `react-hot-toast` e a árvore do `Sidebar`. Não há infraestrutura de render de
// React nesta suíte (`environment: 'node'`, sem jsdom), e montá-la para provar duas
// linhas seria desproporcional. A parte que se quer provar — QUANDO cada busca sai
// — não precisa de DOM. O componente continua com o que é dele: reconciliar estado
// e avisar o usuário.

/** Um `fetch` de mentira que anota QUANDO cada chamada começou e terminou. É a
 *  única forma de distinguir paralelo de serial: o total também mudaria, mas
 *  depende da máquina — a sobreposição, não. */
function fetchCronometrado(atraso = 50, resposta: (url: string) => Partial<Response> = () => ({})) {
    const janelas: { url: string; inicio: number; fim: number }[] = [];
    const falso = vi.fn(async (url: string) => {
        const inicio = performance.now();
        await new Promise((r) => setTimeout(r, atraso));
        janelas.push({ url, inicio, fim: performance.now() });
        return { ok: true, json: async () => [], ...resposta(url) } as Response;
    });
    return { falso: falso as unknown as typeof fetch, janelas };
}

const seSobrepoem = (a: { inicio: number; fim: number }, b: { inicio: number; fim: number }) =>
    a.inicio < b.fim && b.inicio < a.fim;

describe('TASK-091 — as duas buscas do dashboard saem juntas', () => {
    it('BDD 1: `/api/keys` e `/api/users` ficam em voo AO MESMO TEMPO', async () => {
        const { falso, janelas } = fetchCronometrado();
        await buscarDadosDoDashboard(true, falso);

        expect(janelas).toHaveLength(2);
        const chaves = janelas.find((j) => j.url.includes('/api/keys'))!;
        const usuarios = janelas.find((j) => j.url.includes('/api/users'))!;
        expect(
            seSobrepoem(chaves, usuarios),
            'as buscas foram serializadas: a segunda só começou depois de a primeira terminar',
        ).toBe(true);
    });

    it('BDD 2: quem NÃO opera o balcão não busca a lista de usuários', async () => {
        // Guarda contra a correção passar do ponto. `/api/users` exige
        // ADMIN/GESTOR/PORTEIRO — pedi-la para FUNCIONARIO ou ALUNO seria trocar
        // uma viagem economizada por um 403 a cada sinal. A condição existia antes
        // do `Promise.all` e tem de sobreviver a ele.
        const { falso, janelas } = fetchCronometrado();
        const dados = await buscarDadosDoDashboard(false, falso);

        expect(janelas.map((j) => j.url)).toEqual(['/api/keys']);
        expect(dados.usuarios, 'sem lista de usuários, o campo tem de vir nulo').toBeNull();
    });

    it('BDD 3: uma resposta ruim não leva a outra junto', async () => {
        // Comportamento de antes: cada resposta era testada com o próprio `.ok`.
        const { falso } = fetchCronometrado(10, (url) =>
            url.includes('/api/users') ? { ok: false } : {},
        );
        const dados = await buscarDadosDoDashboard(true, falso);

        expect(dados.chaves, 'as chaves vieram e foram descartadas junto com a falha alheia').not.toBeNull();
        expect(dados.usuarios, 'resposta não-ok virou dado').toBeNull();
    });

    it('BDD 4: falha de rede continua propagando, e NENHUMA rejeição fica órfã', async () => {
        // A armadilha do `Promise.all`: ele rejeita na PRIMEIRA falha e a segunda
        // rejeição fica sem quem a observe — unhandled rejection, que em produção
        // vira ruído no Sentry e, conforme o runtime, derruba o processo.
        //
        // O chamador depende do throw: é ele que impede o `router.refresh()` de
        // rodar sobre dado que não chegou.
        const orfas: unknown[] = [];
        const capturar = (e: unknown) => orfas.push(e);
        process.on('unhandledRejection', capturar);

        const falso = (async () => { throw new Error('Failed to fetch'); }) as unknown as typeof fetch;
        await expect(buscarDadosDoDashboard(true, falso)).rejects.toThrow('Failed to fetch');

        // Dá uma volta no laço de eventos: é onde a rejeição órfã apareceria.
        await new Promise((r) => setTimeout(r, 20));
        process.off('unhandledRejection', capturar);
        expect(orfas, 'uma das duas buscas rejeitou sem ninguém observando').toEqual([]);
    });
});
