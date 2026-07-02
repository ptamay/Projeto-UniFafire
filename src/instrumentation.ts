export async function register() {
    // A função register do instrumentationHook do Next.js
    // garante que o código será executado apenas uma vez quando o servidor for inicializado.
    // O guard NEXT_RUNTIME é obrigatório: o Next também compila este arquivo para o
    // Edge Runtime, onde better-sqlite3/fs/path (backup + structured-logger) não existem.
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    if (process.env.NEXT_PHASE !== 'phase-production-build' && process.env.NODE_ENV !== 'test') {
        // Usa require dinâmico para não inflar o cold start
        const { startCronJobs } = await import('./lib/backup');
        startCronJobs();
    }
}
