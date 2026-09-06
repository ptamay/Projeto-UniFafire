import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import { query as pgQuery, queryOne } from '@/lib/pg';
import KeysClient from '../components/KeysClient';
import type { KeyTableRow } from '@/lib/db-rows';

export default async function KeysPage() {
    const sessionCookie = (await cookies()).get('session');
    if (!sessionCookie) redirect('/login');

    let session;
    try {
        session = await verifySession(sessionCookie.value);
        if (!session) throw new Error();
        const user = await queryOne('SELECT id FROM users WHERE id = $1', [session.id]);
        if (!user) redirect('/login');
    } catch { redirect('/login'); }

    // TASK-088 (ADR-015) — a pagina consulta o banco direto, entao a checagem tem
    // de estar aqui: nao ha rota no caminho para devolver 403. Antes, qualquer
    // autenticado que digitasse o endereco via o inventario completo com o
    // portador atual de cada chave.
    //
    // BLOQUEIA, e nao escopa: nao ha leitura legitima do inventario alheio por
    // FUNCIONARIO ou ALUNO — as chaves que importam a eles ja aparecem no
    // dashboard. Mesmo padrao de `/logs`, `/settings` e `/users`.
    if (!['ADMIN', 'GESTOR', 'PORTEIRO'].includes(session.role)) redirect('/');

    const rawKeys = await pgQuery<KeyTableRow>(
        "SELECT * FROM keys WHERE active ORDER BY CASE WHEN status = 'in_use' THEN 0 ELSE 1 END, lower(name) ASC",
    );
    const keys = rawKeys.map((k) => ({ ...k, room: k.room ?? '' }));

    return (
        <main>
            <KeysClient initialKeys={keys} userRole={session.role} username={session.username} />
        </main>
    );
}
