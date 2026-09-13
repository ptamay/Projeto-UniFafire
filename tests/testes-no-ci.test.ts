import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-122 (CR Tipo A) — os testes rodam no CI.
//
// ## Por que existe
//
// Até aqui NENHUM teste rodava sozinho: nem a E2E nem a vitest, e o `ci-gates.sh` também
// não roda a vitest. A E2E morreu em silêncio na Sprint 21, e os specs de fluxo já estavam
// quebrados desde a TASK-052, em julho — meses sem ninguém ver (TASK-118 e TASK-120).
//
// ## O que esta guarda cobra, e o que não cobra
//
// A FORMA do workflow: quando dispara, que Postgres sobe, o que roda, e que nada engole o
// código de saída. Não prova que ele funciona — job de CI só está verificado depois de
// rodar no Actions de verdade (lição do go-live: o backup passou em 25 testes e falhou nas
// três primeiras execuções). A prova de que um spec vermelho deixa o check vermelho foi
// feita com uma falha plantada, registrada na task.

const RAIZ = process.cwd();
const ARQUIVO = path.resolve(RAIZ, '.github/workflows/testes.yml');

/** YAML sem comentário — o cabeçalho do workflow EXPLICA o que ele faz, e uma guarda
 *  que achasse a palavra no comentário passaria cega (TASK-110). */
function semComentarios(texto: string): string {
    return texto.split('\n').filter(l => !/^\s*#/.test(l)).map(l => l.replace(/\s+#.*$/, '')).join('\n');
}

const existe = fs.existsSync(ARQUIVO);
const YML = existe ? semComentarios(fs.readFileSync(ARQUIVO, 'utf-8')) : '';
const COMPOSE = semComentarios(fs.readFileSync(path.resolve(RAIZ, 'docker-compose.test.yml'), 'utf-8'));

/** Valor de `chave:` no texto, sem aspas. */
function valor(texto: string, chave: string): string | undefined {
    const m = texto.match(new RegExp(String.raw`^\s*${chave}:\s*["']?([^"'\n]+?)["']?\s*$`, 'm'));
    return m?.[1];
}

describe('TASK-122 — os testes rodam no CI', () => {
    it('premissa: o compose de teste tem imagem e credenciais legíveis (senão os cenários abaixo comparariam com nada)', () => {
        expect(valor(COMPOSE, 'image')).toMatch(/^postgres:/);
        expect(valor(COMPOSE, 'POSTGRES_USER')).toBeTruthy();
        expect(valor(COMPOSE, 'POSTGRES_PASSWORD')).toBeTruthy();
        expect(valor(COMPOSE, 'POSTGRES_DB')).toBeTruthy();
    });

    it('existe um workflow de testes', () => {
        expect(existe, '.github/workflows/testes.yml não existe').toBe(true);
    });

    it('dispara em todo PR para a main, em todo push na main e sob demanda', () => {
        const on = YML.match(/^on:\s*\n((?:[ \t]+.*\n?)+)/m)?.[1] ?? '';
        expect(on).toMatch(/^\s+pull_request:/m);
        expect(on).toMatch(/^\s+push:/m);
        expect(on).toMatch(/^\s+workflow_dispatch:/m);
        // Os dois primeiros restritos à main — e não a toda branch, que duplicaria cada PR.
        expect((on.match(/branches:\s*\[\s*main\s*\]/g) ?? []).length).toBe(2);
    });

    it('pede do token só leitura do código', () => {
        const bloco = YML.match(/^permissions:\s*\n((?:[ \t]+.*\n?)+)/m)?.[1] ?? '';
        expect(bloco.split('\n').map(l => l.trim()).filter(Boolean)).toEqual(['contents: read']);
    });

    it('o Postgres de serviço é o MESMO do compose: imagem, credenciais e porta 15432', () => {
        // Uma fonte de verdade: quem troca a imagem no compose e esquece o CI passa a testar
        // localmente um Postgres e no CI outro.
        expect(valor(YML, 'image')).toBe(valor(COMPOSE, 'image'));
        for (const chave of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB']) {
            expect(valor(YML, chave), chave).toBe(valor(COMPOSE, chave));
        }
        // O endereço que `tests/pg-test-config.ts` usa quando não há DATABASE_URL.
        expect(YML).toMatch(/["']?15432:5432["']?/);
    });

    it('roda a vitest inteira e a E2E nos dois projetos, com o Chromium do Playwright instalado', () => {
        expect(YML).toMatch(/npx vitest run\b/);
        expect(YML).toMatch(/npx playwright install --with-deps chromium\b/);
        expect(YML).toMatch(/npm run test:e2e\b/);
        // Nenhum filtro de projeto: desktop E mobile.
        expect(YML).not.toMatch(/test:e2e.*--project/);
    });

    it('nada engole o código de saída', () => {
        expect(YML).not.toMatch(/continue-on-error:\s*true/);
        expect(YML).not.toMatch(/\|\|\s*true\b/);
        expect(YML).not.toMatch(/\bexit 0\b/);
    });

    it('o relatório do Playwright sobe como artefato só quando falha', () => {
        expect(YML).toMatch(/uses:\s*actions\/upload-artifact@/);
        expect(YML).toMatch(/if:\s*\$\{\{\s*failure\(\)\s*\}\}|if:\s*failure\(\)/);
    });
});
