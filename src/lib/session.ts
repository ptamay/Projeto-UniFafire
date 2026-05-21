import { jwtVerify, SignJWT } from 'jose';

// This secret is generated randomly at boot time.
// Since Next.js starts up standard processes and middleware runs in Edge handlers,
// a generated random secret in module scope will mean ANY server restart 
// invalidates all previous sessions.
const globalForSession = globalThis as unknown as {
    __RUNTIME_SECRET__: Uint8Array;
};

if (!globalForSession.__RUNTIME_SECRET__) {
    // Attempt to use web crypto if available, or fallback
    globalForSession.__RUNTIME_SECRET__ = new TextEncoder().encode(crypto.randomUUID());
}

const RUNTIME_SECRET = globalForSession.__RUNTIME_SECRET__;

interface SessionPayload {
    id: number;
    username: string;
    role: string;
    [key: string]: any;
}

export async function signSession(payload: SessionPayload): Promise<string> {
    const alg = 'HS256';
    return new SignJWT({ ...payload })
        .setProtectedHeader({ alg })
        .setIssuedAt()
        .sign(RUNTIME_SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, RUNTIME_SECRET);
        return payload as SessionPayload;
    } catch (error) {
        return null;
    }
}
