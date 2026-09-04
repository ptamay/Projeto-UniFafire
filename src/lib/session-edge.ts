import { jwtVerify, SignJWT } from 'jose';
import { validarJwtSecret } from '@/lib/secret-policy';

// TASK-076: a guarda era `jwtSecret.length < 32` — contagem de caracteres, não
// entropia. `'a'.repeat(40)` passava, e o segredo em uso era um UUID com sufixo.
// A política vive em `secret-policy.ts`, testável sem carregar `jose`.
//
// Falha na IMPORTAÇÃO do módulo, de propósito: um segredo fraco não pode virar
// um aviso que se ignora nem um fallback gerado em runtime (§2.1). Sem segredo
// bom, o processo não sobe.
const jwtSecret = process.env.JWT_SECRET;
const verificacao = validarJwtSecret(jwtSecret);
if (!verificacao.ok) {
    throw new Error(`ERRO FATAL — JWT_SECRET inválido. ${verificacao.motivo}`);
}

const RUNTIME_SECRET = new TextEncoder().encode(jwtSecret);

interface SessionPayload {
    id: number;
    username: string;
    role: string;
    [key: string]: unknown;
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
    } catch {
        return null;
    }
}
