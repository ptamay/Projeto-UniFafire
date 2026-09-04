import { NextResponse } from 'next/server';

import { cookies } from 'next/headers';
import { verifySession } from '@/lib/session';
import { withMaintenanceMode } from '@/lib/db-maintenance';
import { logAction } from '@/lib/logger';
import { logStructured } from '@/lib/structured-logger';

export async function POST() {
    try {
        const sessionCookie = (await cookies()).get('session');
        if (!sessionCookie) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const session = await verifySession(sessionCookie.value);
        if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado. Apenas administradores.' }, { status: 403 });

        const tablesToClear = ['history', 'action_logs', 'audit_logs', 'keys'];

        // TASK-031 (REQ-014): registro PRÉVIO em destino que sobrevive à limpeza —
        // esta operação apaga as próprias tabelas de auditoria, então a trilha
        // obrigatória vai para o log estruturado em arquivo ANTES de qualquer DELETE.
        logStructured('warn', 'destructive_operation', {
            op: 'clear-database',
            phase: 'pre',
            user_id: session.id,
            username: session.username,
            tables: tablesToClear,
        });

        // Bypass de manutenção (REQ-014): history tem triggers de imutabilidade
        // (TASK-030) que bloqueiam DELETE fora deste fluxo.
        // TRUNCATE ... RESTART IDENTITY CASCADE faz num comando o que antes eram
        // tres por tabela: apaga, zera a sequencia de ids e resolve as chaves
        // estrangeiras entre elas. A checagem em sqlite_master saiu junto — aquele
        // catalogo nao existe no Postgres, e consultar tabela inexistente aqui
        // seria erro em tempo de execucao dentro da operacao destrutiva.
        //
        // Os nomes vem de `tablesToClear`, constante do proprio codigo — a unica
        // interpolacao de identificador que a §1.3 admite, e por isso ela esta
        // aqui e nao vinda de request.
        await withMaintenanceMode(tx =>
            tx.execute(`TRUNCATE ${tablesToClear.join(', ')} RESTART IDENTITY CASCADE`),
        );

        logStructured('warn', 'destructive_operation', {
            op: 'clear-database',
            phase: 'done',
            user_id: session.id,
            username: session.username,
        });
        // Registro pós-operação no banco recém-limpo — a trilha prévia está no arquivo
        await logAction(session.id, session.username, 'CLEAR_DATABASE', 'Database',
            'Banco de dados limpo (trilha prévia no log estruturado)');

        return NextResponse.json({ success: true, message: 'Banco de dados limpo com sucesso!' });
    } catch (e) {
        console.error('Error clearing database:', e);
        return NextResponse.json({ error: 'Erro interno no servidor ao limpar banco de dados' }, { status: 500 });
    }
}
