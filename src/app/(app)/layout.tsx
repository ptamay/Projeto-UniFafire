import { cookies } from 'next/headers';
import { verifySessionEdge } from '@/lib/session-edge';
import Sidebar from '@/app/components/Sidebar';

// TASK-125 (CR Tipo C · ADR-027) — a moldura das telas autenticadas, com o menu.
//
// ## Por que o menu mora aqui
//
// Cada uma das nove telas desenhava o próprio `<Sidebar>`. Na navegação, o App Router troca o
// segmento da página pelo `loading.tsx` (TASK-096) até o servidor responder — e o menu, sendo
// parte da página, ia junto: a tela mostrava o esqueleto sem menu. O layout NÃO é trocado na
// navegação: o menu fica montado, com o estado dele (a assinatura do sinal, o timer do logout
// automático, a gaveta do celular, o tutorial).
//
// ## O que este layout NÃO faz: autorizar
//
// Layout não roda de novo na navegação pelo cliente. Uma checagem só aqui deixaria a página
// seguinte desprotegida — por isso cada página continua verificando sessão e papel (§3.2,
// guarda da TASK-090), e este arquivo não redireciona nem decide por papel.
//
// Ele lê a sessão só para saber o que DESENHAR no menu, e só pelo JWT (`verifySessionEdge`),
// sem ir ao banco: papel e nome estão no token. A checagem estrita (senha trocada, conta
// desativada) é da página, que redireciona para o /login — fora deste grupo, sem menu. Com
// `verifySession` aqui, cada renderização completa consultaria o banco duas vezes, e o
// `router.refresh()` do Dashboard roda a cada sinal do Realtime.
//
// Sem sessão legível, não há menu: o `proxy.ts` já teria redirecionado antes de chegar aqui.

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const token = (await cookies()).get('session')?.value;
    const sessao = token ? await verifySessionEdge(token) : null;

    return (
        <div className="page-wrapper">
            {sessao && (
                // `.no-print`: a impressão do Histórico sai sem o menu, como antes.
                <div className="no-print">
                    <Sidebar userRole={sessao.role} username={sessao.username} />
                </div>
            )}
            {children}
        </div>
    );
}
