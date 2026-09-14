// TASK-126 (CR Tipo C, ADR-028) — o que a medição de desempenho no navegador
// pode levar para a Vercel, e onde ela roda.
//
// Fora do componente de cliente para ser testável sem renderizar nada — o mesmo
// motivo do `history-query.ts`.

/** O ponto de medição como o `beforeSend` do `@vercel/speed-insights` o entrega.
 *  Declarado aqui porque o pacote não exporta o tipo. */
export interface EventoDeMedicao {
    type: 'vital';
    url: string;
    route?: string;
}

function soOCaminho(endereco: string): string {
    return endereco.split(/[?#]/, 1)[0];
}

/**
 * Tira query string e fragmento da URL (e da rota) antes de o ponto sair.
 *
 * Os filtros do Histórico andam na URL — `userId`, `keyId`, `date`, `hour` — e
 * juntos dizem quem pegou qual chave e quando. Para medir a tela basta o caminho;
 * o resto é dado que não precisa sair (constitution §6.1, minimização).
 */
export function semConsulta<T extends EventoDeMedicao>(evento: T): T {
    const limpo = { ...evento, url: soOCaminho(evento.url) };
    if (evento.route !== undefined) limpo.route = soOCaminho(evento.route);
    return limpo;
}

/**
 * A medição só carrega num deploy da Vercel, que define `VERCEL=1` no build e em
 * execução.
 *
 * Fora dela não há o que medir, e carregar custa: em desenvolvimento o pacote
 * baixa um script de `va.vercel-scripts.com` — a E2E e o CI passariam a depender
 * de rede de terceiro —, e num `next start` local ele pede `/_vercel/...`, que o
 * `proxy.ts` responde com 307 para o login.
 */
export function deveMedirDesempenho(env: Record<string, string | undefined>): boolean {
    return env.VERCEL === '1';
}
