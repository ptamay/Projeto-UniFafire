import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TEST_DATABASE_URL } from './pg-test-config';

// TASK-118 — a suíte E2E (Playwright) estava MORTA desde a Sprint 21, e nada avisou.
//
// O runtime migrou para Postgres (`src/lib/pg.ts`, `DATABASE_URL`) e a suíte E2E
// ficou para trás: `playwright.config.ts` passava `DB_PATH: 'e2e-test.db'` ao
// webServer — variável que nenhum arquivo de `src/` lê mais — e o
// `tests/e2e/global-setup.ts` montava um SQLite com `better-sqlite3` e as migrations
// antigas de `db/migrations/`. Resultado medido em 2026-09-11: o dev server subia sem
// `JWT_SECRET` nem `DATABASE_URL` e morria na primeira requisição.
//
// A suíte E2E não roda em hook nem em CI; a vitest roda. Por isso a guarda mora
// aqui: é a única suíte que alguém executa sem lembrar de executar. Ela é textual e
// não prova que a E2E passa — isso só `npm run test:e2e` prova. Ela impede o
// caminho de volta ao banco que não existe, e exige a base montada pelo MESMO
// runner que monta a de produção (ADR-021): assim a próxima migration chega à E2E
// sem ninguém lembrar dela.

const RAIZ = process.cwd();

/** Código sem comentários — a história do defeito pode ser contada neles. */
function codigo(relativo: string): string {
    return fs.readFileSync(path.resolve(RAIZ, relativo), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const CONFIG = codigo('playwright.config.ts');
const SETUP = codigo('tests/e2e/global-setup.ts');

describe('TASK-118 — a suíte E2E roda contra Postgres, numa base própria', () => {
    it('a varredura enxerga o webServer e o globalSetup (senão os cenários abaixo passariam cegos)', () => {
        expect(CONFIG).toMatch(/webServer\s*:/);
        expect(CONFIG).toMatch(/globalSetup\s*:/);
        expect(SETUP).toMatch(/export default async function/);
    });

    it('o webServer não recebe mais DB_PATH, que nenhum arquivo de src/ lê desde a Sprint 21', () => {
        expect(CONFIG).not.toMatch(/\bDB_PATH\b/);
    });

    it('o webServer recebe DATABASE_URL', () => {
        expect(CONFIG).toMatch(/\bDATABASE_URL\s*:/);
    });

    it('o globalSetup não monta SQLite', () => {
        expect(SETUP).not.toMatch(/better-sqlite3/);
        expect(SETUP).not.toMatch(/['"]migrations['"]|db\/migrations['"/]/);
    });

    it('o globalSetup monta a base pelo runner, sobre a base da plataforma — como a vitest', () => {
        expect(SETUP).toMatch(/runner-migracoes/);
        expect(SETUP).toMatch(/\baplicar\s*\(/);
        expect(SETUP).toMatch(/\bprepararBasePlataforma\s*\(/);
    });

    it('a base E2E não é a da vitest — a vitest ressemeia a dela a cada arquivo', async () => {
        const { E2E_DATABASE_URL } = await import('./e2e/e2e-db');
        expect(new URL(E2E_DATABASE_URL).pathname).not.toBe(new URL(TEST_DATABASE_URL).pathname);
    });

    it('a base E2E recusa endereço que não seja local, antes de conectar', async () => {
        // O globalSetup derruba o schema `public` da base que recebe.
        const { validarBaseE2E } = await import('./e2e/e2e-db');
        expect(() => validarBaseE2E('postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres')).toThrow();
        expect(() => validarBaseE2E('postgresql://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres')).toThrow();
        expect(() => validarBaseE2E(TEST_DATABASE_URL)).toThrow();
        expect(() => validarBaseE2E('postgresql://u:p@localhost:15432/unifafire_e2e')).not.toThrow();
    });
});
