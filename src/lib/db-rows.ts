// Tipos de linha do SQLite compartilhados entre rotas de API (sprint de higiene —
// substitui `as any` por interfaces mínimas refletindo as colunas realmente lidas).

export interface UserAuthRow {
    id: number;
    username: string;
    password_hash: string;
    role: string;
}

export interface KeyTransactionRow {
    id: number;
    key_id: number;
    user_id: number;
    action: 'withdraw' | 'return';
    status: 'pending' | 'porteiro_confirmed' | 'completed' | 'cancelled';
    porteiro_id: number | null;
    porteiro_confirmed_at: string | null;
    user_confirmed_at: string | null;
    initiated_at: string;
    completed_at: string | null;
}

export interface CountRow {
    count: number;
}

/** Colunas cruas da tabela `keys` (SELECT * FROM keys). */
export interface KeyTableRow {
    id: number;
    name: string;
    room: string | null;
    status: 'available' | 'in_use';
    employee_id: number | null;
    user_id: number | null;
    active: number;
}

/** key_transactions com join de keys/users, usado nos fluxos de confirmação. */
export interface KeyTransactionJoinRow extends KeyTransactionRow {
    key_name: string | null;
    key_status?: string | null;
    user_username: string | null;
    user_full_name: string | null;
}

export interface TargetUserRow {
    id: number;
    username: string;
    full_name: string | null;
    role: string;
}
