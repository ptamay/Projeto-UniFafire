import { jwtVerify, SignJWT } from 'jose';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('CRITICAL FATAL ERROR: JWT_SECRET environment variable is missing or too short. It must be at least 32 characters long.');
}

const RUNTIME_SECRET = new TextEncoder().encode(jwtSecret);

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
        .setExpirationTime('7d')
        .sign(RUNTIME_SECRET);
}

export async function verifySessionEdge(token: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, RUNTIME_SECRET);
        return payload as SessionPayload;
    } catch (error) {
        return null;
    }
}
