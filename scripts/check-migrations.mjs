// TASK-059 — Gate 2 (constitution §4.1): todo UP tem DOWN pareado.
//
// Reaproveita listMigrations() de db/migrate.mjs, que é a regra de pareamento já
// usada pelo runner e pelos testes: uma fonte de verdade só, em vez de o gate
// reimplementar a checagem com um glob próprio — foi assim que ele passou a
// apontar para `supabase/migrations/`, diretório que nunca existiu neste projeto,
// e a aprovar tudo em silêncio.
//
// Uso: node scripts/check-migrations.mjs [diretorio]   (padrão: db/migrations)
// Sai com 1 se houver UP sem DOWN, ou se o diretório não existir.

import fs from 'node:fs';
import path from 'node:path';
import { listMigrations } from '../db/migrate.mjs';

const dir = path.resolve(process.argv[2] || path.join('db', 'migrations'));

if (!fs.existsSync(dir)) {
    // Diretório ausente é falha, nunca "nada a verificar": era exatamente esse
    // caminho que fazia o gate passar sem olhar nada.
    console.error(`❌ Diretório de migrations não encontrado: ${dir}`);
    process.exit(1);
}

try {
    const migrations = listMigrations(dir);
    console.log(`✅ ${migrations.length} migration(s) com UP/DOWN pareados em ${path.relative(process.cwd(), dir) || dir}`);
} catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
}
