import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-135 (ADR-031 · REQ-033b/d) — Histórico e Logs no celular.
//
// Nas capturas do usuário: no Histórico, três botões de largura cheia no topo — o
// PRIMEIRO era "Limpar Histórico", vermelho —, duas métricas em jargão ("Dupla
// confirmação 75%", "Tempo de balcão 0 min") e seis filtros empilhados antes de
// qualquer registro; "Exportar PDF" e "Imprimir / Gerar PDF" faziam quase a mesma
// coisa. Nos Logs, a primeira tela inteira era filtro, com "Hora (0-23)". Esta guarda
// confere a fonte; a E2E (tests/e2e/historico-logs-celular.spec.ts) mede a tela.

const RAIZ = process.cwd();
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), 'utf-8');
const HISTORICO = ler('src/app/(app)/history/HistoryClient.tsx');
const LOGS = ler('src/app/(app)/logs/LogsClient.tsx');
const CONFIG = ler('src/app/(app)/settings/SettingsClient.tsx');
const CSS = ler('src/app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');

function regrasNoCelular(): { seletor: string; corpo: string }[] {
    const saida: { seletor: string; corpo: string }[] = [];
    for (const m of CSS.matchAll(/@media\s*\(max-width:\s*768px\)\s*\{/g)) {
        let nivel = 1, j = m.index! + m[0].length;
        const inicio = j;
        while (j < CSS.length && nivel > 0) { if (CSS[j] === '{') nivel++; else if (CSS[j] === '}') nivel--; j++; }
        for (const r of CSS.slice(inicio, j - 1).matchAll(/([^{}]+)\{([^}]*)\}/g)) saida.push({ seletor: r[1].trim(), corpo: r[2] });
    }
    return saida;
}
const noCelular = (seletor: RegExp) => regrasNoCelular().filter(r => seletor.test(r.seletor)).map(r => r.corpo).join(';');

describe('TASK-135 — ação destrutiva sai do caminho do polegar (REQ-033d)', () => {
    it('o Histórico não tem mais "Limpar Histórico" nem chama a rota de limpeza', () => {
        expect(HISTORICO).not.toMatch(/Limpar Hist[óo]rico/i);
        expect(HISTORICO).not.toMatch(/\/api\/history\/clear/);
    });

    it('a limpeza mora na Zona de Perigo das Configurações, só para ADMIN, com a mesma rota (DELETE) e modal de confirmação', () => {
        const zona = CONFIG.slice(CONFIG.indexOf('id="zona-perigo"'));
        expect(CONFIG.indexOf('id="zona-perigo"'), 'não achei a Zona de Perigo').toBeGreaterThan(0);
        expect(zona).toMatch(/Limpar hist[óo]rico/i);
        expect(CONFIG).toMatch(/fetch\(\s*'\/api\/history\/clear'\s*,\s*\{\s*method:\s*'DELETE'/);
        // A Zona de Perigo inteira é condicionada a ADMIN (REQ-014: a rota também é só dele).
        const antesDaZona = CONFIG.slice(0, CONFIG.indexOf('id="zona-perigo"'));
        expect(antesDaZona.slice(antesDaZona.lastIndexOf('{userRole'))).toMatch(/userRole === 'ADMIN'/);
        expect(zona).toMatch(/ConfirmModal[\s\S]*Limpar hist[óo]rico\?/i);
    });
});

describe('TASK-135 — um PDF só, num menu de ações', () => {
    it('o Histórico não tem mais o botão de imprimir ao lado do de exportar', () => {
        expect(HISTORICO).not.toMatch(/PrintButton/);
        expect(HISTORICO).toMatch(/Baixar PDF/);
    });

    it('Histórico e Logs põem as ações num menu "⋯" (MenuDeAcoes)', () => {
        expect(HISTORICO).toMatch(/<MenuDeAcoes\b/);
        expect(LOGS).toMatch(/<MenuDeAcoes\b/);
        expect(LOGS).toMatch(/Baixar planilha|Exportar CSV/);
    });
});

describe('TASK-135 — filtro não ocupa a tela', () => {
    it('Histórico e Logs usam a folha de filtros (FolhaDeFiltros), com a contagem de filtros ativos', () => {
        for (const [nome, fonte] of [['Histórico', HISTORICO], ['Logs', LOGS]] as const) {
            expect(fonte, nome).toMatch(/<FolhaDeFiltros\b[^>]*ativos=\{/);
        }
    });

    it('no celular, a folha de filtros sobe de baixo para cima; no desktop fica na página', () => {
        const folha = noCelular(/(^|,)\s*\.folha-filtros\s*(,|$)/);
        expect(folha, 'falta .folha-filtros no bloco do celular').toMatch(/position\s*:\s*fixed/);
        expect(folha).toMatch(/bottom\s*:\s*0/);
        // Fora do celular ela não é fixa.
        const base = [...CSS.matchAll(/(^|\n)\.folha-filtros\s*\{([^}]*)\}/g)].map(m => m[2]).join(';');
        expect(base, 'falta a regra base .folha-filtros').toBeTruthy();
        expect(base).not.toMatch(/position\s*:\s*fixed/);
    });

    it('rótulos em palavras do dia a dia: sem "Hora (0-23)", "Data Específica" nem "Portador"', () => {
        for (const [nome, fonte] of [['Histórico', HISTORICO], ['Logs', LOGS]] as const) {
            expect(fonte, nome).not.toMatch(/Hora \(0-23\)/);
            expect(fonte, nome).not.toMatch(/Data Específica/);
            expect(fonte, nome).not.toMatch(/>\s*Portador\s*</);
        }
    });

    it('mês e dia têm texto de apoio — o campo vazio parecia uma caixa quebrada', () => {
        expect(HISTORICO).toMatch(/className="dica-campo"/);
        expect(LOGS).toMatch(/className="dica-campo"/);
    });
});

describe('TASK-135 — métricas em linguagem simples, fora do celular', () => {
    it('as métricas do Histórico dizem o que medem, sem jargão', () => {
        expect(HISTORICO).not.toMatch(/>\s*Dupla confirmação\s*</);
        expect(HISTORICO).not.toMatch(/>\s*Tempo de balcão\s*</);
    });

    it('no celular, as métricas saem da tela', () => {
        expect(noCelular(/\.metricas-negocio\b/)).toMatch(/display\s*:\s*none/);
    });
});

describe('TASK-135 — o Histórico tem busca', () => {
    it('a página repassa o termo buscado (q) para a consulta', () => {
        const pagina = ler('src/app/(app)/history/page.tsx');
        expect(pagina).toMatch(/q:\s*p\.q/);
    });
});
