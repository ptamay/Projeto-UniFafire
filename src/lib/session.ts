import { signSession, verifySessionEdge } from './session-edge';
import db from '@/lib/db';

// Re-exporta signSession para uso normal nas rotas
export { signSession };

/**
 * Verifica se a sessão é válida usando a verificação criptográfica do JWT (Edge)
 * e em seguida realiza uma checagem rigorosa no banco de dados para 
 * confirmar se o password_hash atual bate com o hash inserido no token 
 * no momento do login. Caso não bata, significa que a senha foi alterada 
 * e esta sessão deve ser revogada (logout everywhere).
 */
export async function verifySession(token: string) {
    const payload = await verifySessionEdge(token);
    if (!payload) return null;

    try {
        const stmt = db.prepare('SELECT password_hash FROM users WHERE id = ? AND active = 1');
        const user = stmt.get(payload.id) as any;

        if (!user || typeof user.password_hash !== 'string') {
            return null; // Usuário não existe ou inativo
        }

        const currentHashSlice = user.password_hash.slice(-10);
        if (payload.pwd_hash !== currentHashSlice) {
            return null; // A senha foi alterada, então esta sessão expirou
        }

        return payload;
    } catch (error) {
        console.error('Erro na validação strict da sessão:', error);
        return null;
    }
}
