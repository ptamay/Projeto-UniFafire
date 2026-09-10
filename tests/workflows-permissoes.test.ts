import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-110 (CR Tipo C · ADR-023) — todo workflow declara o que pode, e pede o mínimo.
//
// ## Por que existe
//
// Sem `permissions:`, o job herda o token padrão do Actions — que, conforme a
// configuração do repositório, pode ESCREVER nele: código, releases, issues. Um passo
// comprometido (uma action de terceiro, uma dependência do `npm ci`) herda esse poder.
// `keepalive.yml` só faz `curl`; `backup.yml` só faz checkout com esse token (o push vai
// para OUTRO repositório, com token próprio). Nenhum dos dois precisava de escrita, e os
// dois a tinham — confirmado em 2026-09-07. O `pos-deploy.yml` (TASK-103) já nasceu com
// `permissions: {}`.
//
// ## O que esta guarda cobra
//
// Todo arquivo de `.github/workflows/`, inclusive o que ainda não existe: workflow novo
// sem `permissions:` no topo reprova. E nenhum pede `write` sem estar na lista de
// exceções abaixo — que hoje é vazia.

const DIR = path.resolve(process.cwd(), '.github/workflows');
const workflows = fs.readdirSync(DIR).filter(f => /\.ya?ml$/.test(f));

/** YAML sem comentário: os cabeçalhos destes arquivos EXPLICAM permissões, e a primeira
 *  versão de uma guarda assim acharia a palavra no comentário. */
const semComentarios = (f: string) =>
    fs.readFileSync(path.join(DIR, f), 'utf-8').split('\n')
        .filter(l => !/^\s*#/.test(l)).map(l => l.replace(/\s+#.*$/, '')).join('\n');

/** Workflows que precisam escrever com o token padrão, e por quê. Hoje: nenhum. */
const PODEM_ESCREVER: Record<string, string> = {};

describe('TASK-110 — todo workflow declara permissions', () => {
    it('BDD 1: há workflows para conferir', () => {
        expect(workflows.length).toBeGreaterThanOrEqual(3);
    });

    it.each(workflows)('BDD 1: %s declara `permissions:` no TOPO do arquivo', f => {
        // No topo, e não só dentro de um job: o topo vale para todos os jobs, inclusive o
        // que alguém acrescentar amanhã sem pensar nisso.
        expect(semComentarios(f), `${f} herda o token padrão do Actions`).toMatch(/^permissions:/m);
    });

    it.each(workflows)('BDD 1: %s não pede escrita', f => {
        if (PODEM_ESCREVER[f]) return;
        expect(semComentarios(f), `${f} pede permissão de escrita`).not.toMatch(/:\s*write\b|write-all/);
    });
});

describe('TASK-110 — o mínimo de cada um', () => {
    it('BDD 2: keepalive não usa o token para nada → `permissions: {}`', () => {
        expect(semComentarios('keepalive.yml')).toMatch(/^permissions:\s*\{\}/m);
    });

    it('BDD 2: backup só faz checkout com o token → `contents: read`, e mais nada', () => {
        const yml = semComentarios('backup.yml');
        const bloco = yml.match(/^permissions:\s*\n((?:[ \t]+.*\n?)+)/m);
        expect(bloco, 'backup.yml sem bloco de permissions no topo').toBeTruthy();
        const escopos = bloco![1].split('\n').map(l => l.trim()).filter(Boolean);
        expect(escopos, 'o backup pede mais que ler o próprio código').toEqual(['contents: read']);
    });
});
