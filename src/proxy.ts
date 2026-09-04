import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionEdge } from '@/lib/session-edge';
import { opcoesCookieSessao } from '@/lib/session-cookie';

// TASK Next 16: renomeado de middleware.ts para proxy.ts (convenção depreciada
// — https://nextjs.org/docs/messages/middleware-to-proxy). Mesma lógica.
export async function proxy(request: NextRequest) {
    const sessionCookie = request.cookies.get('session');
    
    // Evita interferir com as rotas de auth (login/logout)
    if (request.nextUrl.pathname.startsWith('/api/auth')) {
        return NextResponse.next();
    }

    if (!sessionCookie || !sessionCookie.value) {
        return NextResponse.next();
    }

    const payload = await verifySessionEdge(sessionCookie.value);
    const response = NextResponse.next();

    if (payload) {
        // Atualiza a expiração idle para mais 24h a cada request válido.
        // TASK-076: as opções vêm do helper único — `secure` deixou de ser
        // derivado de `x-forwarded-proto`, que é header e portanto influenciável
        // por quem faz a requisição.
        response.cookies.set(opcoesCookieSessao(sessionCookie.value));
    } else {
        // Se o JWT for inválido ou tiver atingido o limite absoluto de 7 dias, limpa o cookie
        response.cookies.delete('session');
    }

    return response;
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
