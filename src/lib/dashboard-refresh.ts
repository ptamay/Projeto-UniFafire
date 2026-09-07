// TASK-091 (REQ-032) — as duas buscas do dashboard saem juntas.
//
// ## O que este módulo é, e o que não é
//
// É a parte de `refreshData` que faz VIAGEM. A reconciliação de estado, o toast de
// "sua solicitação foi aprovada" e o `router.refresh()` continuam no componente:
// são dele.
//
// Ele existe separado por um motivo prático. `DashboardClient` arrasta
// `next/navigation`, `react-hot-toast` e a árvore do `Sidebar`, e esta suíte roda
// em `environment: 'node'` sem jsdom — não há como montá-lo num teste sem
// introduzir infraestrutura de render de React inteira para provar duas linhas. O
// que se quer provar, QUANDO cada busca sai, não precisa de DOM nenhum.
//
// ## Por que paralelo
//
// `/api/users` não usa nada de `/api/keys`. Em série, a tela esperava as duas
// viagens somadas — e a medição do REQ-032 (2026-09-07, `plan.md`) mostrou que cada
// rota que toca o banco custa ~335 ms em produção. Eram 670 ms só de busca, num
// orçamento de 500 ms para a defasagem inteira.
//
// ## Por que `allSettled` e não `all`
//
// `Promise.all` rejeita na PRIMEIRA falha e deixa a segunda rejeição sem quem a
// observe. Num sinal que chega com a rede oscilando, as duas buscas falham juntas:
// uma vira o erro tratado, a outra vira *unhandled rejection*. `allSettled` observa
// as duas e este módulo relança a primeira — o chamador continua vendo o mesmo
// `throw` de antes, que é o que impede o `router.refresh()` de rodar sobre dado que
// não chegou.

export type UsuarioDoBalcao = {
    id: number;
    username: string;
    full_name: string | null;
    role: string;
};

export type DadosDoDashboard<C> = {
    /** `null` quando a busca não trouxe nada utilizável. O chamador preserva o
     *  estado anterior em vez de esvaziar a tela — comportamento de sempre. */
    chaves: C[] | null;
    usuarios: UsuarioDoBalcao[] | null;
};

async function buscarJson<T>(buscar: typeof fetch, url: string): Promise<T | null> {
    const res = await buscar(url);
    return res.ok ? ((await res.json()) as T) : null;
}

export async function buscarDadosDoDashboard<C>(
    operaBalcao: boolean,
    buscar: typeof fetch = fetch,
): Promise<DadosDoDashboard<C>> {
    // A condição sobrevive ao paralelismo de propósito: `/api/users` exige
    // ADMIN/GESTOR/PORTEIRO, e pedi-la para FUNCIONARIO ou ALUNO trocaria uma
    // viagem economizada por um 403 a cada sinal.
    const [chaves, usuarios] = await Promise.allSettled([
        buscarJson<C[]>(buscar, '/api/keys'),
        operaBalcao ? buscarJson<UsuarioDoBalcao[]>(buscar, '/api/users') : Promise.resolve(null),
    ]);

    const falha = [chaves, usuarios].find((r) => r.status === 'rejected');
    if (falha) throw falha.reason;

    return {
        chaves: chaves.status === 'fulfilled' ? chaves.value : null,
        usuarios: usuarios.status === 'fulfilled' ? usuarios.value : null,
    };
}
