import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-136 (ADR-031 · REQ-033c/d) — Chaves e Usuários em lista no celular.
//
// Nas capturas do usuário, cada chave era uma tabela de "rótulo: valor" (NOME / SALA/LOCAL /
// STATUS), e "Remover" era um botão vermelho CHEIO, do mesmo tamanho de "Editar". Em
// Usuários, os filtros por papel eram caixas clicáveis que não eram botão (sem teclado,
// sem estado anunciado). A E2E (tests/e2e/listas-celular.spec.ts) mede a tela.

const RAIZ = process.cwd();
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), 'utf-8');
const CHAVES = ler('src/app/components/KeysClient.tsx');
const USUARIOS = ler('src/app/(app)/users/UsersClient.tsx');
const CSS = ler('src/app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');

describe('TASK-136 — cada item é uma linha, não uma tabela de rótulos', () => {
    it.each([['Chaves', CHAVES], ['Usuários', USUARIOS]])('%s: no celular, uma lista de linhas; a tabela fica para o desktop', (_, fonte) => {
        expect(fonte).toMatch(/className="mobile-only"[\s\S]*className="lista-linhas"/);
        expect(fonte).toMatch(/className="[^"]*\bdesktop-only\b[^"]*"[\s\S]*<table/);
        expect(fonte, 'a tabela ainda vira cartão de rótulos no celular').not.toMatch(/table-cards/);
    });

    it('a linha tem nome, apoio (sala ou papel) e estado, com as classes da lista', () => {
        for (const cls of ['linha-lista', 'linha-nome', 'linha-apoio']) {
            expect(CSS, `falta .${cls} no CSS`).toMatch(new RegExp(`\\.${cls}\\b`));
        }
    });
});

describe('TASK-136 — remover é ação secundária, e sempre com confirmação (REQ-033d)', () => {
    it.each([['Chaves', CHAVES], ['Usuários', USUARIOS]])('%s: "Remover" não é o botão vermelho cheio', (_, fonte) => {
        const botoesRemover = [...fonte.matchAll(/<button[^>]*className="([^"]*)"[^>]*>(?:(?!<\/button>)[\s\S])*Remover(?:(?!<\/button>)[\s\S])*<\/button>/g)].map(m => m[1]);
        expect(botoesRemover.length, 'não achei o botão Remover').toBeGreaterThan(0);
        for (const c of botoesRemover) {
            expect(c).not.toMatch(/btn-perigo/);
            expect(c).toMatch(/btn-remover/);
        }
    });

    it('.btn-remover é texto vermelho sem fundo — secundário, mas ainda diz que apaga', () => {
        const corpo = [...CSS.matchAll(/(^|\n)\.btn-remover\s*\{([^}]*)\}/g)].map(m => m[2]).join(';');
        expect(corpo, 'falta a regra .btn-remover').toMatch(/color\s*:\s*var\(--alerta-fg\)/);
        expect(corpo).toMatch(/background\s*:\s*transparent/);
    });

    it.each([['Chaves', CHAVES], ['Usuários', USUARIOS]])('%s: a confirmação de remover é um modal de perigo', (_, fonte) => {
        const modais = [...fonte.matchAll(/<ConfirmModal[\s\S]*?\/>/g)].map(m => m[0]).filter(m => /Remover/.test(m));
        expect(modais.length, 'não achei o modal de remover').toBeGreaterThan(0);
        for (const m of modais) expect(m).toMatch(/danger(=\{true\})?\b/);
    });
});

describe('TASK-136 — Usuários: filtros por papel são botões, e a busca é busca', () => {
    it('os filtros por papel são <button> com aria-pressed, não caixas clicáveis', () => {
        expect(USUARIOS).toMatch(/className="[^"]*\bfiltro-papel\b[^"]*"[\s\S]{0,400}aria-pressed=/);
        expect(USUARIOS, 'ainda há <div onClick> no filtro por papel').not.toMatch(/<div key=\{r\.value\}[^>]*onClick/);
    });

    it('a busca de usuários é um campo de busca', () => {
        expect(USUARIOS).toMatch(/type="search"[^>]*aria-label="Buscar usuário/);
    });
});
