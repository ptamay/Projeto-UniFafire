import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/session';
import { listarUsuariosAtivos } from '@/lib/usuarios';
import UsersClient from './UsersClient';

export default async function UsersPage() {
    const sessionCookie = (await cookies()).get('session');

    if (!sessionCookie) {
        redirect('/login');
    }

    // JSX e redirect() fora do try — NEXT_REDIRECT era engolido pelo catch.
    let session: Awaited<ReturnType<typeof verifySession>> = null;
    try {
        session = await verifySession(sessionCookie.value);
    } catch {
        session = null;
    }
    if (!session) redirect('/login');
    if (session.role !== 'ADMIN' && session.role !== 'GESTOR') redirect('/');
    // TASK-131: a lista vai junto — a tela não abre em "Carregando…". Só depois do papel
    // verificado acima: ela traz matrícula e telefone de todos.
    const usuariosIniciais = await listarUsuariosAtivos();
    return <UsersClient usuariosIniciais={usuariosIniciais} />;
}
