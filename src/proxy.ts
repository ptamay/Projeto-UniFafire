import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionEdge } from '@/lib/session-edge';

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
        // Atualiza a expiração idle para mais 24h a cada request válido
        response.cookies.set({
            name: 'session',
            value: sessionCookie.value,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24
        });
    } else {
        // Se o JWT for inválido ou tiver atingido o limite absoluto de 7 dias, limpa o cookie
        response.cookies.delete('session');
    }

    return response;
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
