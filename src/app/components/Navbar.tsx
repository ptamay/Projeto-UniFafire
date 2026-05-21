'use client';
import { useRouter } from 'next/navigation';

export default function Navbar({ userRole }: { userRole: string }) {
    const router = useRouter();
    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
    };

    return (
        <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <strong style={{ cursor: 'pointer' }} onClick={() => router.push('/')}>SISTEMA BASE</strong>
            <button onClick={() => router.push('/')}>Dashboard</button>
            <button onClick={() => router.push('/keys')}>Chaves</button>
            <button onClick={() => router.push('/employees')}>Funcionários</button>
            <button onClick={handleLogout} style={{ marginLeft: 'auto', color: 'red' }}>Sair</button>
        </nav>
    );
}
