import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { temaInicial, SCRIPT_TEMA } from '@/lib/tema';

// TASK-132 (ADR-031 · REQ-033e) — na primeira visita, o tema segue o do aparelho.
//
// Até aqui o escuro era o padrão absoluto (decisão da portaria, no DESIGN.md antigo):
// sem escolha salva, o sistema abria escuro — inclusive no celular de quem usa no
// pátio, no sol, com o aparelho no modo claro. Decisão do usuário: seguir o
// aparelho; o botão de tema continua, e a escolha salva continua valendo.
//
// E o tema tem de estar certo ANTES da primeira pintura: aplicado num useEffect (como
// o Sidebar e o login faziam), a tela de quem prefere claro piscaria escura a cada
// carregamento. Por isso um script no <head>, que roda antes de o corpo aparecer.

const RAIZ = process.cwd();

describe('TASK-132 — a decisão do tema', () => {
    it('sem escolha salva, segue o aparelho', () => {
        expect(temaInicial(null, true)).toBe('light');
        expect(temaInicial(null, false)).toBe('dark');
    });

    it('a escolha salva vence o aparelho, nos dois sentidos', () => {
        expect(temaInicial('dark', true)).toBe('dark');
        expect(temaInicial('light', false)).toBe('light');
    });

    it('valor salvo que não é tema é ignorado — segue o aparelho', () => {
        expect(temaInicial('azul', true)).toBe('light');
        expect(temaInicial('', false)).toBe('dark');
    });
});

/** Roda o SCRIPT_TEMA num navegador de mentira e devolve se ligou o modo claro. */
function rodarScript(salvo: string | null, prefereClaro: boolean, { quebraStorage = false } = {}) {
    const classes = new Set<string>();
    const contexto = {
        localStorage: {
            getItem: (k: string) => {
                if (quebraStorage) throw new Error('SecurityError');
                return k === 'theme' ? salvo : null;
            },
        },
        window: { matchMedia: (q: string) => ({ matches: q.includes('light') ? prefereClaro : !prefereClaro }) },
        document: { documentElement: { classList: { add: (c: string) => classes.add(c) } } },
    };
    vm.runInNewContext(SCRIPT_TEMA, contexto);
    return classes.has('light-mode');
}

describe('TASK-132 — o script do <head> aplica a mesma decisão', () => {
    it('liga o claro quando o aparelho prefere claro e nada foi salvo', () => {
        expect(rodarScript(null, true)).toBe(true);
        expect(rodarScript(null, false)).toBe(false);
    });

    it('respeita a escolha salva', () => {
        expect(rodarScript('dark', true)).toBe(false);
        expect(rodarScript('light', false)).toBe(true);
    });

    it('não quebra a página se o armazenamento do navegador for bloqueado', () => {
        // Aba anônima com cookies bloqueados: localStorage lança. O script não pode
        // derrubar o <head> — a página abre no tema padrão do CSS (escuro).
        expect(() => rodarScript(null, true, { quebraStorage: true })).not.toThrow();
    });

    it('o layout raiz põe o script no <head>', () => {
        const layout = fs.readFileSync(path.join(RAIZ, 'src/app/layout.tsx'), 'utf-8');
        expect(layout).toMatch(/SCRIPT_TEMA/);
        expect(layout).toMatch(/<head>[\s\S]*dangerouslySetInnerHTML=\{\{\s*__html:\s*SCRIPT_TEMA\s*\}\}[\s\S]*<\/head>/);
    });

    it('nem o Sidebar nem o login decidem o tema sozinhos com o escuro como padrão', () => {
        // Os dois liam o localStorage e só ligavam o claro se ele dissesse "light" —
        // o escuro vencia sempre que não havia escolha salva.
        for (const arquivo of ['src/app/components/Sidebar.tsx', 'src/app/login/page.tsx']) {
            const fonte = fs.readFileSync(path.join(RAIZ, arquivo), 'utf-8');
            expect(fonte, `${arquivo} ainda decide o tema a partir do localStorage`).not.toMatch(/getItem\(['"]theme['"]\)/);
        }
    });
});
