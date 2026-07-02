export async function register() {
    // A função register do instrumentationHook do Next.js 
    // garante que o código será executado apenas uma vez quando o servidor for inicializado.
    if (process.env.NEXT_PHASE !== 'phase-production-build' && process.env.NODE_ENV !== 'test') {
        // Usa require dinâmico para não inflar o cold start
        const { startCronJobs } = await import('./lib/backup');
        startCronJobs();
    }
}
