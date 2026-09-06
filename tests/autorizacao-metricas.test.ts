import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-085 (Sprint 26 · CR Tipo C, ADR-014) — a rota de usuários frequentes
// valida papel, e nenhuma outra fica sem a checagem que declara precisar.
// constitution §3.2.
//
// ## O defeito
//
// `/api/metrics/frequent-users` chama `verifySession` e segue. Qualquer usuário
// autenticado — **incluindo ALUNO** — recebe `id`, `username`, `full_name`,
// `role` e a frequência de retirada dos cinco que mais usam uma chave. `keyId` é
// sequencial: enumerar é trivial, e o resultado é um mapa de quem frequenta qual
// sala.
//
// As duas rotas irmãs (`business`, `frequent-keys`) restringem a
// ADMIN/GESTOR/PORTEIRO desde que foram escritas.
//
// ## Por que a guarda existente não guarda
//
// O único consumidor chama a rota dentro de `if (isPorteiroOrAdmin)`. Isso é
// gating de INTERFACE. A §3.2 nomeia o caso: "Toda rota de API valida a sessão E
// a permissão no servidor. Checagem só no client = vulnerabilidade, não feature."
//
// O proxy da TASK-077 também não cobre — e isso é desenho, não lacuna: ele roda
// no Edge Runtime sem acesso ao banco, garante que HÁ sessão, e deixa o papel
// para o handler, para não haver dois lugares onde a decisão possa divergir.
//
// ## O segundo describe é o que impede a reincidência
//
// Corrigir só esta rota deixaria a próxima nascer igual. O defeito não tinha
// sintoma: nenhum teste exigia papel por rota, e foi preciso comparar irmãs para
// vê-lo. A varredura abaixo transforma "alguém precisa reparar" em "o CI repara".

const RAIZ = process.cwd();
const API = path.resolve(RAIZ, 'src/app/api');

function semComentarios(arquivo: string) {
    return fs.readFileSync(arquivo, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

/** Rotas que respondem SEM sessão. Tem de casar com `ROTAS_PUBLICAS` do
 *  `src/proxy.ts` — se divergirem, uma das duas listas está errada. */
const ROTAS_PUBLICAS = ['/api/auth/login', '/api/auth/logout', '/api/health'];

function listarRotas(): { caminho: string; arquivo: string; fonte: string }[] {
    const achados: { caminho: string; arquivo: string; fonte: string }[] = [];
    const varrer = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) varrer(p);
            else if (e.name === 'route.ts') {
                const rel = path.relative(API, path.dirname(p)).split(path.sep).join('/');
                achados.push({ caminho: rel ? `/api/${rel}` : '/api', arquivo: p, fonte: semComentarios(p) });
            }
        }
    };
    varrer(API);
    return achados;
}

afterEach(() => { vi.resetModules(); vi.doUnmock('next/headers'); vi.doUnmock('@/lib/session'); });

describe('TASK-085 — a rota de usuários frequentes recusa quem não opera chaves', () => {
    async function chamarComoPapel(role: string) {
        vi.resetModules();
        vi.doMock('next/headers', () => ({
            cookies: () => Promise.resolve({ get: () => ({ value: 'token' }) }),
        }));
        vi.doMock('@/lib/session', () => ({
            verifySession: () => Promise.resolve({ id: 9, username: 'test_aluno', role }),
        }));
        const { GET } = await import('@/app/api/metrics/frequent-users/route');
        return GET(new Request('http://localhost/api/metrics/frequent-users?keyId=1'));
    }

    it('BDD 1: ALUNO recebe 403 — hoje recebe a lista de quem usa a chave', async () => {
        const res = await chamarComoPapel('ALUNO');
        expect(res.status, 'um aluno consegue mapear quem frequenta cada sala').toBe(403);
    });

    it('BDD 1: FUNCIONARIO também recebe 403', async () => {
        const res = await chamarComoPapel('FUNCIONARIO');
        expect(res.status).toBe(403);
    });

    it('BDD 1: PORTEIRO continua passando — nenhum uso legítimo muda', async () => {
        // A correção não pode quebrar a Ação Rápida (REQ-021), que é o consumidor
        // real e já chamava a rota só neste perfil.
        const res = await chamarComoPapel('PORTEIRO');
        expect(res.status, 'a correção quebrou o consumidor legítimo').not.toBe(403);
    });

    it('BDD 1: a rota exige o mesmo conjunto de papéis das irmãs', () => {
        const irma = semComentarios(path.join(API, 'metrics/frequent-keys/route.ts'));
        const alvo = semComentarios(path.join(API, 'metrics/frequent-users/route.ts'));
        const papeis = (s: string) => ['ADMIN', 'GESTOR', 'PORTEIRO'].filter(p => s.includes(`'${p}'`)).join(',');
        expect(papeis(alvo), 'as rotas de métricas divergem no conjunto de papéis')
            .toBe(papeis(irma));
    });
});

describe('TASK-085 — nenhuma outra rota fica só com checagem de sessão', () => {
    it('BDD 2: toda rota protegida verifica PAPEL, não só sessão', () => {
        // Esta é a guarda que impede a reincidência. Sem ela, a próxima rota
        // nasce com o mesmo defeito e ninguém percebe — foi assim que esta
        // passou.
        //
        // Exceções declaradas em LISTA, não em regex: rota pública é decisão de
        // arquitetura e tem de doer para crescer.
        const semPapel: string[] = [];
        for (const r of listarRotas()) {
            if (ROTAS_PUBLICAS.includes(r.caminho)) continue;
            // Rotas de conta própria não têm papel: qualquer usuário autenticado
            // gerencia o PRÓPRIO perfil, e o dono é a sessão, não o papel.
            if (r.caminho.startsWith('/api/account') || r.caminho === '/api/auth/me') continue;

            const verificaSessao = /verifySession/.test(r.fonte);
            // `\brole\b` NÃO serve: a palavra aparece em `u.role` de SQL e em
            // anotação de tipo, e a guarda passava COM O DEFEITO PRESENTE — foi
            // assim que a primeira versão deste teste nasceu cega. O que importa
            // é o papel DA SESSÃO sendo comparado.
            const verificaPapel = /session\.role|\brole\s*(!==|===)/.test(r.fonte);
            if (verificaSessao && !verificaPapel) semPapel.push(r.caminho);
        }
        expect(semPapel, `validam sessão e NÃO validam papel:\n${semPapel.join('\n')}`).toEqual([]);
    });

    it('BDD 2: a lista de rotas públicas casa com a do proxy', () => {
        // Duas listas descrevendo a mesma coisa divergem no primeiro dia em que
        // alguém mexer numa só.
        const proxy = semComentarios(path.resolve(RAIZ, 'src/proxy.ts'));
        for (const rota of ROTAS_PUBLICAS) {
            expect(proxy, `${rota} é pública aqui e não no proxy`).toContain(`'${rota}'`);
        }
    });
});
