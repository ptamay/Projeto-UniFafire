import { query } from '@/lib/pg';

// TASK-131 (emenda do ADR-029) — a lista de usuários ativos da tela de Usuários.
//
// Chamada pela rota `GET /api/users` e pela página `/users`, que agora entrega a lista já na
// abertura (antes a tela abria em "Carregando…"). Quem chama verifica o papel ANTES: a lista traz
// matrícula e telefone de todos.

export interface UsuarioAtivo {
    id: number;
    username: string;
    full_name: string | null;
    matricula: string | null;
    phone: string | null;
    role: string;
}

/** Só as colunas que a tela usa — nunca `password_hash` nem o código de reset. */
export async function listarUsuariosAtivos(): Promise<UsuarioAtivo[]> {
    return query<UsuarioAtivo>('SELECT id, username, full_name, matricula, phone, role FROM users WHERE active');
}
