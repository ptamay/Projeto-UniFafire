import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-088/089/090 (Sprint 27 · CR Tipo C, ADR-015) — Server Components
// verificam papel antes de consultar o banco. constitution §3.2.
//
// ## Por que rota não bastava
//
// O ADR-014 corrigiu duas ROTAS que validavam sessão e não papel. As páginas do
// App Router não passam por rota nenhuma: são Server Components, consultam o
// banco com o mesmo pool e entregam o resultado ao navegador. Quando uma página
// verifica só a sessão, **não há 403 possível** — não existe handler no caminho,
// e a camada onde as checagens vivem é contornada inteira.
//
// ## O que estava aberto
//
// | Página | Entregava a qualquer autenticado |
// |---|---|
// | `/history` | quem retirou qual chave, quando, com nome e username |
// | `/keys` | inventário completo com portador atual |
// | `/` | chaves + lista de TODOS os funcionários e alunos ativos |
//
// O `Sidebar` esconde os links de quem não deve vê-los. Isso é navegação, não
// autorização: basta digitar o endereço.
//
// ## O terceiro describe é o que impede a próxima
//
// Três páginas nasceram com o mesmo defeito, e nenhuma tinha sintoma — a tela
// certa nunca pediu o que não devia. Corrigir as três sem a varredura deixaria a
// quarta nascer igual.

const RAIZ = process.cwd();
const APP = path.resolve(RAIZ, 'src/app');

function semComentarios(arquivo: string) {
    return fs.readFileSync(arquivo, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

function listarPaginas(): { rota: string; arquivo: string; fonte: string }[] {
    const achados: { rota: string; arquivo: string; fonte: string }[] = [];
    const varrer = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory() && e.name !== 'api') varrer(p);
            else if (e.name === 'page.tsx') {
                const rel = path.relative(APP, path.dirname(p)).split(path.sep).join('/');
                achados.push({ rota: rel ? `/${rel}` : '/', arquivo: p, fonte: semComentarios(p) });
            }
        }
    };
    varrer(APP);
    return achados;
}

/** Consulta o banco no próprio Server Component. É o que torna a página uma
 *  fronteira de dados, e não só de navegação.
 *
 *  O `(<[^>]*>)?` não é preciosismo: as chamadas reais são `pgQuery<HistoryItem>(`
 *  — com parâmetro de tipo entre o nome e o parêntese. Sem ele, a varredura
 *  achava que NENHUMA página consulta o banco. */
function consultaBanco(fonte: string) {
    return /\b(pgQuery|queryOne|query)\s*(<[^>]*>)?\s*\(/.test(fonte);
}

/**
 * A página DECIDE algo com base no papel — não apenas o menciona.
 *
 * Duas armadilhas, e caí nas duas antes de acertar:
 *
 * 1. `\brole\b` casa com `u.role` de SQL e com anotação de tipo. Foi assim que a
 *    guarda equivalente do ADR-014 nasceu cega.
 * 2. `session.role` casa com `userRole={session.role}` — repassar o papel ao
 *    componente de cliente, que é justamente o que as páginas desprotegidas
 *    fazem. A guarda dava "protegida" para todas elas.
 *
 * O que distingue decisão de menção é o OPERADOR: comparação, ou `includes`.
 */
function verificaPapel(fonte: string) {
    return /\.role\s*(!==|===)|\brole\s*(!==|===)|includes\s*\(\s*\w+\.role\s*\)/.test(fonte);
}

describe('TASK-088 — /history e /keys verificam papel antes de consultar', () => {
    it('BDD 1: `/history` não entrega o histórico de todos a qualquer sessão', () => {
        const p = listarPaginas().find(x => x.rota === '/history')!;
        expect(consultaBanco(p.fonte), 'a premissa mudou: a página não consulta mais o banco').toBe(true);
        expect(verificaPapel(p.fonte), 'consulta o histórico inteiro sem olhar o papel').toBe(true);
    });

    it('BDD 1: `/keys` não entrega o inventário a qualquer sessão', () => {
        const p = listarPaginas().find(x => x.rota === '/keys')!;
        expect(consultaBanco(p.fonte)).toBe(true);
        expect(verificaPapel(p.fonte), 'consulta as chaves sem olhar o papel').toBe(true);
    });

    it('BDD 1: as duas redirecionam, como `/logs` e `/users` já fazem', () => {
        // O padrão já existe no projeto. A correção é aplicá-lo, não inventar um.
        for (const rota of ['/history', '/keys']) {
            const p = listarPaginas().find(x => x.rota === rota)!;
            expect(p.fonte, `${rota} verifica o papel e não redireciona`).toMatch(/redirect\s*\(/);
        }
    });
});

describe('TASK-089 — o dashboard escopa o que entrega', () => {
    it('BDD 2: a lista de usuários só é montada para quem opera o balcão', () => {
        // `/` é legitimamente para TODOS os papéis — FUNCIONARIO e ALUNO precisam
        // ver as próprias chaves. O que não podem receber é a lista de todos os
        // funcionários e alunos ativos, que serve à Ação Rápida do balcão.
        //
        // Escopar o que se entrega, e não bloquear a página: mesma escolha da
        // TASK-087 com a senha padrão.
        const p = listarPaginas().find(x => x.rota === '/')!;
        expect(verificaPapel(p.fonte), 'o dashboard entrega a lista de usuários sem olhar o papel')
            .toBe(true);
    });

    it('BDD 2: a página continua servindo TODOS os papéis', () => {
        // Guarda contra a correção passar do ponto: bloquear o dashboard
        // quebraria o uso principal de FUNCIONARIO e ALUNO.
        const p = listarPaginas().find(x => x.rota === '/')!;
        for (const papel of ['FUNCIONARIO', 'ALUNO']) {
            expect(p.fonte, `o dashboard passou a barrar ${papel}`)
                .not.toMatch(new RegExp(`role\\s*===\\s*'${papel}'[^\\n]*redirect`));
        }
    });
});

describe('TASK-090 — nenhuma página consulta o banco sem verificar papel', () => {
    // Exceções em LISTA, com o motivo escrito. Página que lê dados de terceiros é
    // fronteira de autorização, e crescer essa lista tem de ser deliberado.
    const EXCECOES: Record<string, string> = {
        '/login': 'pública — não consulta e não exige sessão',
        '/account/profile': 'próprio cadastro: o dono é a sessão, não o papel',
        '/account/security': 'próprio cadastro: o dono é a sessão, não o papel',
        '/confirm': 'não consulta no servidor; a API escopa as pendências por papel',
    };

    it('BDD 3: a varredura não encontra página desprotegida', () => {
        const desprotegidas = listarPaginas()
            .filter(p => !(p.rota in EXCECOES))
            .filter(p => consultaBanco(p.fonte) && !verificaPapel(p.fonte))
            .map(p => p.rota);
        expect(desprotegidas, `consultam o banco sem verificar papel:\n${desprotegidas.join('\n')}`)
            .toEqual([]);
    });

    it('BDD 3: a lista de exceções não cresceu sem alguém decidir', () => {
        // Se mudar, é decisão de arquitetura — não pode passar num diff sem que
        // este teste obrigue a olhar. Mesma postura da guarda de filesystem.
        expect(Object.keys(EXCECOES).sort()).toEqual([
            '/account/profile', '/account/security', '/confirm', '/login',
        ]);
        for (const rota of Object.keys(EXCECOES)) {
            expect(listarPaginas().some(p => p.rota === rota), `exceção obsoleta: ${rota}`).toBe(true);
        }
    });
});
