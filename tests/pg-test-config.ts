// TASK-068 — endereço do Postgres de teste, em um lugar só.
//
// O `globalSetup` do Vitest roda FORA do escopo de `test.env`, então ele não
// enxerga a `DATABASE_URL` definida ali. Duplicar a string nos dois lugares
// criaria duas fontes de verdade que divergem no primeiro dia em que alguém
// mudar a porta. Ambos importam esta constante.
//
// A porta 15432 evita colisão com um Postgres já instalado na máquina na 5432 e,
// desde 2026-09-08, fica também FORA da faixa dinâmica do Windows (49152-65535):
// o WinNAT reserva blocos dentro dela e os remaneja a cada reinício, e a antiga
// 55432 foi engolida por um deles. Motivo completo em `docker-compose.test.yml`.
// Credenciais de container descartável — não são secret de ambiente nenhum.
export const TEST_DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://unifafire:unifafire_test@localhost:15432/unifafire_test';
