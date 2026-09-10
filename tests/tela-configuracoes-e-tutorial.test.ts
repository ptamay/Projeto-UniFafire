import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-111 (CR Tipo C · ADR-025) — o tutorial vira "?", o tempo real vira um ponto, e
// o backup mostra só o estado.
//
// ## O que o usuário viu na tela, em 2026-09-10
//
// "Rever tutorial" dentro da caixa do logout automático, com a qual não tem relação;
// o card de backup listando uma execução por dia e fazendo a página rolar; e o tempo
// real ocupando um card inteiro para dizer, quase sempre, "Ativa".
//
// ## O que isso escondia
//
// O tutorial só era alcançável em Configurações — tela que, pela §3.2, só ADMIN e
// GESTOR abrem. PORTEIRO e ALUNO, que são quem mais precisa rever como a dupla
// confirmação funciona, não tinham como.

const RAIZ = process.cwd();
const semComentarios = (f: string) =>
    fs.readFileSync(path.resolve(RAIZ, f), 'utf-8')
        .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

const SIDEBAR = 'src/app/components/Sidebar.tsx';
const TELA = 'src/app/settings/SettingsClient.tsx';

describe('TASK-111 — o tutorial é alcançável de qualquer tela, por todos os papéis', () => {
    it('BDD 1: o shell (Sidebar, presente em toda página) abre o tutorial', () => {
        const fonte = semComentarios(SIDEBAR);
        expect(fonte, 'o shell não renderiza o tutorial').toMatch(/<Tutorial\b/);
        expect(fonte, 'não há botão de ajuda que se anuncie como tal')
            .toMatch(/aria-label="[^"]*(tutorial|ajuda)[^"]*"/i);
    });

    it('BDD 1: há "?" no desktop E no celular', () => {
        // No celular a barra lateral é uma gaveta fechada: um botão só nela ficaria a
        // dois toques de distância, que é onde ajuda deixa de ser usada.
        const fonte = semComentarios(SIDEBAR);
        const botoes = fonte.match(/aria-label="[^"]*(tutorial|ajuda)[^"]*"/gi) ?? [];
        expect(botoes.length, 'o "?" precisa existir na barra E na barra superior do celular').toBeGreaterThanOrEqual(2);
    });

    it('BDD 1: o tutorial fica FORA do <aside>', () => {
        // ⚠️ No celular o <aside> é uma gaveta com `transform`, e `position: fixed`
        // dentro de ancestral com transform passa a ser relativo a ELE: o modal
        // ficaria preso na gaveta, cortado, em vez de cobrir a tela.
        const fonte = semComentarios(SIDEBAR);
        const fimAside = fonte.indexOf('</aside>');
        expect(fimAside).toBeGreaterThan(0);
        expect(fonte.indexOf('<Tutorial'), 'o tutorial está dentro da gaveta').toBeGreaterThan(fimAside);
    });

    it('BDD 1: o botão de ajuda não depende de papel', () => {
        // Se o "?" entrasse num `userRole === ...`, voltaríamos ao defeito que motivou a
        // task — só que em outro lugar.
        const fonte = semComentarios(SIDEBAR);
        const i = fonte.search(/aria-label="[^"]*(tutorial|ajuda)[^"]*"/i);
        const antes = fonte.slice(Math.max(0, i - 400), i);
        expect(antes, 'o "?" está condicionado a papel').not.toMatch(/userRole\s*===|roles\.includes/);
    });

    it('BDD 1: Configurações deixa de ter o "Rever tutorial"', () => {
        expect(semComentarios(TELA), 'o botão continua na caixa do logout').not.toMatch(/Rever tutorial|<Tutorial\b/);
    });
});

describe('TASK-111 — o tempo real vira um ponto discreto no shell', () => {
    it('BDD 2: o shell mostra o estado lendo a assinatura COMPARTILHADA', () => {
        const fonte = semComentarios(SIDEBAR);
        expect(fonte, 'o shell não mostra o estado do tempo real').toMatch(/useEstadoDoSinal\(/);
        // UMA assinatura por shell: a que já existia (TASK-072/105). Exibir o estado de
        // uma conexão não pode abrir outra.
        const assinaturas = fonte.match(/\b(useAtualizacaoDeChaves|useSinalDeMudanca)\(/g) ?? [];
        expect(assinaturas.length, 'o shell abre mais de uma assinatura').toBe(1);
    });

    it('BDD 2: o card de tempo real sai de Configurações', () => {
        expect(semComentarios(TELA), 'o card continua ocupando a grade')
            .not.toMatch(/EstadoDoTempoReal|useEstadoDoSinal|Atualização em Tempo Real/);
    });
});

describe('TASK-111 — o backup mostra só o estado', () => {
    it('BDD 3: sem a lista de execuções que fazia a página rolar', () => {
        const fonte = semComentarios(TELA);
        expect(fonte, 'a lista de execuções continua na tela').not.toMatch(/Últimas execuções|runs\.map\(/);
    });

    it('BDD 3: o último backup continua dito — verificado OU falhou', () => {
        // A lista era "o único lugar onde se descobre que o backup parou" (TASK-082).
        // O motivo sobrevive à lista: o último backup, com o resultado dele, e a
        // confiabilidade.
        const fonte = semComentarios(TELA);
        expect(fonte, 'a tela não diz qual foi o último backup').toMatch(/Último backup/);
        expect(fonte, 'a tela não distingue backup que falhou').toMatch(/FALHOU/);
        expect(fonte, 'a confiabilidade sumiu junto').toMatch(/descreverConfiabilidade/);
    });
});
