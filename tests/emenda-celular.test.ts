import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-137 (emenda do ADR-031 · REQ-033) — o que ficou fora do quadro de chaves.
//
// A crítica da TASK-136 deu 30/40 contra a meta de 32: Usuários com três faixas antes da
// lista, Confirmações em cartões, Logs em código de sistema. E o usuário corrigiu duas
// escolhas já no ar: o "Passar para outra pessoa" tinha virado texto embaixo da plaqueta
// ("os dois botões antes estavam bons"), e "em uso" cinza "indica neutralidade demais —
// melhor vermelho, que indica que está ocupado". A medida na tela está na E2E
// `tests/e2e/emenda-celular.spec.ts`; aqui, o que se lê no código.

const RAIZ = process.cwd();
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), 'utf-8');
const semComentarioCss = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const semComentarioTs = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const CSS = () => semComentarioCss(ler('src/app/globals.css'));
const DASHBOARD = () => semComentarioTs(ler('src/app/components/DashboardClient.tsx'));
const USUARIOS = () => semComentarioTs(ler('src/app/(app)/users/UsersClient.tsx'));
const CONFIRMACOES = () => semComentarioTs(ler('src/app/(app)/confirm/ConfirmClient.tsx'));
const LOGS = () => semComentarioTs(ler('src/app/(app)/logs/LogsClient.tsx'));

/** Corpo das regras cujo seletor casa com `seletor` (em qualquer @media). */
function corpos(css: string, seletor: RegExp): string {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(m => seletor.test(m[1].trim()))
        .map(m => m[2]).join(';');
}

describe('TASK-137 — "Passar" volta a ser botão, ao lado de "Devolver"', () => {
    it('na plaqueta, "Passar" é um botão dentro de .plaqueta-acoes — o texto de ação embaixo saiu', () => {
        const fonte = DASHBOARD();
        const celular = fonte.slice(fonte.indexOf('className="plaquetas"'), fonte.indexOf('Modo Desktop') > 0 ? fonte.indexOf('Modo Desktop') : undefined);
        expect(celular, 'não achei a lista de plaquetas').toMatch(/plaqueta-acoes/);
        expect(celular, 'o "Passar para outra pessoa" como texto embaixo da linha ainda existe').not.toMatch(/plaqueta-extra/);
        const acoes = celular.slice(celular.indexOf('className="plaqueta-acoes"'));
        const devolver = acoes.indexOf('Devolver');
        const passar = acoes.search(/aria-label="Passar para outra pessoa"/);
        expect(devolver, 'falta "Devolver" nas ações da plaqueta').toBeGreaterThan(0);
        expect(passar, 'falta o botão "Passar" (com o nome inteiro para o leitor de tela) nas ações').toBeGreaterThan(devolver);
        expect(acoes.slice(passar, passar + 400)).toMatch(/>\s*Passar\s*</);
    });

    it('o CSS do texto de ação embaixo da plaqueta saiu junto', () => {
        expect(CSS()).not.toMatch(/\.plaqueta-extra\b/);
    });
});

describe('TASK-137 — "em uso" é vermelho na linha e na plaqueta', () => {
    it('o estado "Com Fulano" usa a cor de em uso, não o cinza do texto de apoio', () => {
        const css = CSS();
        const plaqueta = corpos(css, /^\.plaqueta--em-uso \.plaqueta-estado$/);
        const linha = corpos(css, /^\.linha-estado\.is-em-uso$/);
        expect(plaqueta, '.plaqueta--em-uso .plaqueta-estado').toMatch(/(^|;)\s*color\s*:\s*var\(--em-uso-fg\)/);
        expect(linha, '.linha-estado.is-em-uso').toMatch(/(^|;)\s*color\s*:\s*var\(--em-uso-fg\)/);
        expect(plaqueta + linha).not.toMatch(/color\s*:\s*var\(--text-secondary\)/);
    });
});

describe('TASK-137 — Usuários: a busca é o primeiro controle', () => {
    it('a busca vem antes dos filtros por papel', () => {
        const fonte = USUARIOS();
        const busca = fonte.indexOf('type="search"');
        const filtros = fonte.indexOf('className="filtros-papel"');
        expect(busca, 'sem campo de busca').toBeGreaterThan(0);
        expect(filtros, 'sem filtros por papel').toBeGreaterThan(0);
        expect(busca, 'os filtros por papel vêm antes da busca').toBeLessThan(filtros);
    });

    it('"Novo usuário" do cabeçalho é do desktop; no celular, um "+ Novo" compacto na linha da busca', () => {
        const fonte = USUARIOS();
        const cabecalho = fonte.slice(fonte.indexOf('className="page-header"'), fonte.indexOf('type="search"'));
        const botaoDoCabecalho = cabecalho.match(/<button[^>]*onClick=\{openNew\}[^>]*>/);
        expect(botaoDoCabecalho?.[0] ?? '', 'o botão do cabeçalho aparece no celular').toMatch(/desktop-only/);
        const linhaDaBusca = fonte.slice(fonte.indexOf('type="search"'), fonte.indexOf('className="filtros-papel"'));
        const compacto = linhaDaBusca.match(/<button[^>]*>/g)?.find(b => /mobile-only/.test(b) && /openNew/.test(b));
        expect(compacto, 'falta o "+ Novo" compacto do celular entre a busca e os filtros').toBeTruthy();
        expect(compacto).toMatch(/aria-label="Novo usuário"/);
    });
});

describe('TASK-137 — Confirmações em linhas', () => {
    it('cada pendência é uma linha da lista, não um cartão', () => {
        const fonte = CONFIRMACOES();
        expect(fonte).toMatch(/className="lista-linhas"/);
        expect(fonte).toMatch(/linha-lista/);
        expect(fonte, 'a grade de cartões ainda existe').not.toMatch(/gridTemplateColumns/);
        expect(fonte, 'cartão com o raio grande ainda existe').not.toMatch(/borderRadius:\s*'var\(--radius-lg\)'/);
    });

    it('o verbo da linha é secundário — são várias linhas, e principal é um por tela', () => {
        const fonte = CONFIRMACOES();
        expect(fonte).not.toMatch(/btn-principal/);
        expect(fonte).toMatch(/btn-secundario/);
    });

    it('os textos que os fluxos procuram continuam (aguardando, solicitou, vazio)', () => {
        const fonte = CONFIRMACOES();
        expect(fonte).toMatch(/Aguardando \{isPull \? 'o portador' : 'porteiro'\}/);
        expect(fonte).toMatch(/solicitou esta chave/);
        expect(fonte).toMatch(/Nenhuma confirmação pendente no momento\./);
    });
});

describe('TASK-137 — Logs: a ação em palavra, o código pequeno', () => {
    it('lista e tabela mostram rotuloDaAcao; o código fica em .codigo-trilha, fora do nome da linha', () => {
        const fonte = LOGS();
        expect(fonte).toMatch(/import \{[^}]*rotuloDaAcao[^}]*\} from '@\/lib\/trilha-legivel'/);
        const lista = fonte.slice(fonte.indexOf('className="lista-linhas"'), fonte.indexOf('className="table-wrapper'));
        const nome = lista.match(/className="linha-nome"[^]*?<\/div>/)?.[0] ?? '';
        expect(nome, 'o nome da linha não usa o rótulo').toMatch(/rotuloDaAcao\(/);
        expect(nome, 'o código de sistema ainda é o nome da linha').not.toMatch(/codigo-trilha/);
        expect(lista).toMatch(/codigo-trilha/);
        const tabela = fonte.slice(fonte.indexOf('className="table-wrapper'));
        expect(tabela, 'a tabela do desktop não usa o rótulo').toMatch(/rotuloDaAcao\(/);
        expect(fonte, 'o detalhe não passa pela leitura em português').toMatch(/detalheLegivel\(/);
    });

    it('o código da trilha é meta: o menor tamanho da escala', () => {
        expect(corpos(CSS(), /(^|,)\s*\.codigo-trilha\s*(,|$)/)).toMatch(/font-size\s*:\s*var\(--fs-1\)/);
    });
});

describe('TASK-137 — Dashboard: a explicação da dupla confirmação é uma linha', () => {
    it('é um <details> fechado, com o título no <summary> — o texto só aparece ao abrir', () => {
        const fonte = DASHBOARD();
        const i = fonte.indexOf('className="dashboard-explicacao"');
        const bloco = fonte.slice(i, fonte.indexOf('unified-control-bar', i));
        expect(bloco).toMatch(/<details\b/);
        expect(bloco).toMatch(/<summary\b[^>]*>[^]*Como funciona a dupla confirmação/);
        expect(bloco, 'o details não pode nascer aberto').not.toMatch(/<details[^>]*\bopen\b/);
        expect(bloco, '"não mostrar de novo" continua').toMatch(/dismissIntro/);
    });
});
