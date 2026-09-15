import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { rotuloDaAcao, detalheLegivel, alvoLegivel, ROTULO_DA_ACAO } from '@/lib/trilha-legivel';

// TASK-137 (emenda do ADR-031 · REQ-033) — os Logs em português.
//
// A crítica da TASK-136 leu os Logs como "código de sistema": a linha principal de cada
// registro era `LOGIN_SUCCESS`, e o detalhe, "User logged in". Quem abre essa tela é o
// ADMIN e o GESTOR da UniFAFIRE, não quem escreveu o código. A trilha não muda — o código
// gravado é o registro, e fica à vista, pequeno —, muda a leitura: a ação em palavra.
//
// A guarda que vale é a do meio: TODO código que o sistema grava tem rótulo. Um código
// novo sem rótulo apareceria cru na tela, sem nenhum teste perceber.

const RAIZ = process.cwd();
const SRC = path.join(RAIZ, 'src');

function arquivos(dir: string, ext: RegExp): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? arquivos(p, ext) : ext.test(e.name) ? [p] : [];
    });
}
const rel = (p: string) => path.relative(RAIZ, p).replace(/\\/g, '/');

/** Os argumentos de uma chamada, a partir do `(`, separados nas vírgulas de fora de
 *  parênteses, colchetes, chaves e literais (aspas simples, duplas e template). */
function argumentos(fonte: string, abre: number): string[] {
    const args: string[] = [];
    let nivel = 0, atual = '', i = abre + 1;
    while (i < fonte.length) {
        const c = fonte[i];
        if (c === "'" || c === '"' || c === '`') {
            let j = i + 1;
            while (j < fonte.length && fonte[j] !== c) { if (fonte[j] === '\\') j++; j++; }
            atual += fonte.slice(i, j + 1);
            i = j + 1;
            continue;
        }
        if ('([{'.includes(c)) nivel++;
        if (')]}'.includes(c)) {
            if (nivel === 0) { args.push(atual.trim()); return args; }
            nivel--;
        }
        if (c === ',' && nivel === 0) { args.push(atual.trim()); atual = ''; } else atual += c;
        i++;
    }
    return args;
}

/** Cada chamada a `logAction(...)` em `src`, com o arquivo e os argumentos. */
function chamadas(): { f: string; fonte: string; args: string[] }[] {
    return arquivos(SRC, /\.tsx?$/).flatMap(f => {
        const fonte = fs.readFileSync(f, 'utf-8');
        return [...fonte.matchAll(/\blogAction\(/g)]
            .filter(m => !/function\s+$/.test(fonte.slice(Math.max(0, m.index! - 20), m.index!)))
            .map(m => ({ f, fonte, args: argumentos(fonte, m.index! + m[0].length - 1) }));
    });
}

/** Os valores dos objetos `ACOES` exportados em `src/lib` (backup manual, restauração). */
function codigosDeAcoes(): string[] {
    return arquivos(path.join(SRC, 'lib'), /\.ts$/).flatMap(f => {
        const fonte = fs.readFileSync(f, 'utf-8');
        const bloco = fonte.match(/export const ACOES\s*=\s*\{([\s\S]*?)\}/);
        return bloco ? [...bloco[1].matchAll(/'([A-Z][A-Z_]+)'/g)].map(m => m[1]) : [];
    });
}

/** Todo código que o sistema grava: os literais do 3º argumento de `logAction` (inclusive
 *  dentro de um ternário) e os valores dos `ACOES`. */
function codigosGravados(): string[] {
    const literais = chamadas().flatMap(({ args }) => [...(args[2] ?? '').matchAll(/'([A-Z][A-Z_]+)'/g)].map(m => m[1]));
    return [...new Set([...literais, ...codigosDeAcoes()])].sort();
}

/** O texto do 5º argumento (o detalhe), com as expressões `${…}` trocadas por X. Se for um
 *  identificador, segue até o `const` que o define no mesmo arquivo. */
function detalhe(fonte: string, arg: string | undefined): string | null {
    if (!arg) return null;
    const id = arg.match(/^[A-Za-z_]\w*$/);
    if (id) {
        const def = fonte.match(new RegExp(`const\\s+${id[0]}\\s*=\\s*([\`'][\\s\\S]*?[\`'])\\s*;`));
        return def ? detalhe(fonte, def[1]) : null;
    }
    const literais = [...arg.matchAll(/'([^']*)'|`([^`]*)`/g)].map(m => m[1] ?? m[2]);
    return literais.length ? literais.join(' ').replace(/\$\{[^}]*\}/g, 'X') : null;
}

const INGLES = /\b(User|user|Invalid|Deleted|Updated|Changed|created|Room|limit exceeded|locked out|reactivated|their|with role|from|to)\b/;

describe('TASK-137 — a ação da trilha em palavra', () => {
    it('a varredura acha os códigos que o sistema grava (não está olhando para o nada)', () => {
        const codigos = codigosGravados();
        // Os de login, chave, usuário, movimentação e backup — hoje são 31.
        for (const esperado of ['LOGIN_SUCCESS', 'RATE_LIMIT_EXCEEDED', 'KEY_WITHDRAWN', 'KEY_RETURNED',
            'DELETE_USER', 'CREATE_KEY', 'BACKUP_MANUAL_SOLICITADO', 'RESTAURACAO_FALHOU']) {
            expect(codigos, `a varredura não achou ${esperado}`).toContain(esperado);
        }
        expect(codigos.length).toBeGreaterThanOrEqual(30);
    });

    it('todo código que o sistema grava tem rótulo em português — nenhum aparece cru na tela', () => {
        const sem = codigosGravados().filter(c => !ROTULO_DA_ACAO[c]);
        expect(sem, `códigos sem rótulo em src/lib/trilha-legivel.ts:\n${sem.join('\n')}`).toEqual([]);
    });

    it('o rótulo é palavra, não código: sem sublinhado e sem ser todo em maiúsculas', () => {
        const ruins = Object.entries(ROTULO_DA_ACAO)
            .filter(([codigo, rotulo]) => rotulo === codigo || /_/.test(rotulo) || rotulo === rotulo.toUpperCase())
            .map(([c, r]) => `${c} → ${r}`);
        expect(ruins).toEqual([]);
    });

    it('código desconhecido aparece como foi gravado — a trilha não esconde nada', () => {
        expect(rotuloDaAcao('CODIGO_DE_AMANHA')).toBe('CODIGO_DE_AMANHA');
        expect(rotuloDaAcao('LOGIN_SUCCESS')).toBe(ROTULO_DA_ACAO.LOGIN_SUCCESS);
        expect(rotuloDaAcao(undefined)).toBe('');
    });
});

describe('TASK-137 — o detalhe da trilha em português', () => {
    it('nenhum detalhe novo é gravado em inglês', () => {
        const achados = chamadas().flatMap(({ f, fonte, args }) => {
            const texto = detalhe(fonte, args[4]);
            return texto && INGLES.test(texto) ? [`${rel(f)}: ${texto}`] : [];
        });
        expect(achados, `detalhe em inglês:\n${achados.join('\n')}`).toEqual([]);
    });

    // Os registros antigos ficam como foram gravados (a trilha é imutável — ADR-026); a tela
    // os LÊ em português. Os exemplos são os textos exatos que o código gravava até aqui.
    it.each([
        ['User logged in', 'Entrou com usuário e senha'],
        ['Invalid password', 'Senha errada'],
        ['User changed their password via security page', 'Trocou a senha na tela de segurança'],
        ['User changed default password on first login', 'Trocou a senha no primeiro acesso'],
        ['User updated their own profile', 'Atualizou o próprio perfil'],
        ['Updated user info', 'Dados do usuário atualizados'],
        ['User reactivated with new data', 'Usuário reativado com dados novos'],
        ['IP 10.0.0.7 limit exceeded', 'Tentativas demais do IP 10.0.0.7'],
        ['Account locked out for IP 10.0.0.7', 'Conta bloqueada para o IP 10.0.0.7'],
        ['Changed role from ALUNO to PORTEIRO', 'Perfil: Aluno → Porteiro'],
        ['New user created with role: FUNCIONARIO', 'Perfil: Funcionário'],
        ['Deleted user joao (ALUNO)', 'Usuário joao (Aluno) removido'],
        ['Room: Sala 101', 'Sala: Sala 101'],
        ['Room: N/A', 'Sem sala'],
        ['Deleted key Chave 1 - Sala 101', 'Chave Chave 1 (Sala 101) removida'],
        ['Changed from: Chave 1 (Sala 1) to Chave 2 (Sala 2)', 'Era Chave 1 (Sala 1), agora Chave 2 (Sala 2)'],
    ])('registro antigo "%s" é lido como "%s"', (gravado, lido) => {
        expect(detalheLegivel(gravado)).toBe(lido);
    });

    it('detalhe em português passa como está', () => {
        expect(detalheLegivel('Devolução iniciada pelo porteiro')).toBe('Devolução iniciada pelo porteiro');
        expect(detalheLegivel(undefined)).toBe('');
    });

    // Achado no verde: o alvo também chegava em inglês ("admin · System"). "System" e "Self"
    // não dizem nada que a ação já não diga; os demais viram palavra; chave e pessoa passam.
    it('o alvo gravado em inglês é lido em português, e "System"/"Self" somem da linha', () => {
        expect(alvoLegivel('System')).toBe('');
        expect(alvoLegivel('Self')).toBe('');
        expect(alvoLegivel('History Table')).toBe('Histórico');
        expect(alvoLegivel('Database')).toBe('Banco de dados');
        expect(alvoLegivel('settings')).toBe('Configurações');
        expect(alvoLegivel('Chave E2E')).toBe('Chave E2E');
    });
});
