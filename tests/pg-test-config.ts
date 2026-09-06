// TASK-068 — endereço do Postgres de teste, em um lugar só.
//
// O `globalSetup` do Vitest roda FORA do escopo de `test.env`, então ele não
// enxerga a `DATABASE_URL` definida ali. Duplicar a string nos dois lugares
// criaria duas fontes de verdade que divergem no primeiro dia em que alguém
// mudar a porta. Ambos importam esta constante.
//
// A porta 55432 evita colisão com um Postgres já instalado na máquina na 5432.
// Credenciais de container descartável — não são secret de ambiente nenhum.
export const TEST_DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://unifafire:unifafire_test@localhost:55432/unifafire_test';
