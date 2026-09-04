// TASK-078 — entrada de linha de comando da verificação do dump.
//
// Separado de `verify-dump.mjs` para que aquele arquivo continue sendo só lógica
// pura e testável, sem abrir conexão nem ler `process.argv`.
//
// Uso:  node db/verify-dump-cli.mjs <URL_ORIGEM> <URL_RESTAURADO>
//
// Sai com código diferente de zero quando as contagens não batem — é o que faz
// o job do workflow reprovar. Backup que não restaura idêntico não é backup.

import pg from 'pg';
import { contarLinhas, tabelasDoBanco, reconciliarContagens } from './verify-dump.mjs';

const [urlOrigem, urlRestaurado] = process.argv.slice(2);

if (!urlOrigem || !urlRestaurado) {
    console.error('uso: node db/verify-dump-cli.mjs <URL_ORIGEM> <URL_RESTAURADO>');
    process.exit(2);
}

function abrir(connectionString) {
    return new pg.Pool({
        connectionString,
        ssl: connectionString.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
    });
}

const origem = abrir(urlOrigem);
const restaurado = abrir(urlRestaurado);

try {
    // A lista vem da ORIGEM, não de uma constante: tabela nova entra na
    // verificação sozinha, em vez de sair dela em silêncio.
    const tabelas = await tabelasDoBanco(origem);
    console.log(`Conferindo ${tabelas.length} tabelas: ${tabelas.join(', ')}`);

    const contagensOrigem = await contarLinhas(origem, tabelas);
    const contagensRestaurado = await contarLinhas(restaurado, tabelas);

    reconciliarContagens(contagensOrigem, contagensRestaurado);

    const total = Object.values(contagensOrigem).reduce((a, b) => a + b, 0);
    console.log(`✅ Backup VERIFICADO: ${total} linhas restauradas e reconciliadas.`);
} catch (e) {
    console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
} finally {
    await origem.end();
    await restaurado.end();
}
