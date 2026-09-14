import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execute, queryOne } from '@/lib/pg';
import { withMaintenanceMode } from '@/lib/db-maintenance';
import { listarPendencias, PAPEIS_QUE_VEEM_TODAS_AS_PENDENCIAS } from '@/lib/pendencias';
import { listarLogs } from '@/lib/logs-query';
import { listarUsuariosAtivos } from '@/lib/usuarios';

// TASK-131 (emenda do ADR-029) — Confirmações, Logs e Usuários chegam com os dados.
//
// Depois da TASK-128 a navegação ficou suave, mas estas três telas ainda abriam VAZIAS e
// buscavam os dados no navegador: cartões cinzas em Confirmações (a primeira captura do
// relato), "Carregando…" em Logs e Usuários. Agora a página consulta no servidor, depois de
// verificar sessão e papel, e o componente de cliente nasce com os dados.
//
// ## O que se guarda aqui
//
// 1. As consultas, contra o banco real: o escopo das pendências (TETO, como o do Histórico),
//    os filtros dos logs e a lista de usuários ativos — e as datas em ISO, que é o formato
//    que o JSON da rota sempre entregou. Uma página que passasse `Date` e uma rota que passa
//    texto dariam ao MESMO componente dois formatos, e o defeito apareceria só num caminho.
// 2. Rota e página chamam a MESMA função — duas cópias da consulta divergiriam em silêncio.
// 3. O cliente não nasce "carregando".
// A autorização das páginas continua com a guarda da TASK-090 (`autorizacao-paginas.test.ts`),
// que passa a contar `listar*` como consulta ao banco.

const RAIZ = process.cwd();
const semComentarios = (relativo: string) =>
    fs.readFileSync(path.resolve(RAIZ, relativo), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// Usuários da semente de `tests/setup.ts`: 1 admin, 3 porteiro, 5 aluno, 6 aluno2.
const PORTEIRO = 3, ALUNO = 5, ALUNO2 = 6;

describe('TASK-131 — pendências: o escopo por papel é TETO', () => {
    let chave: number;

    beforeAll(async () => {
        await execute('DELETE FROM key_transactions');
        chave = (await queryOne<{ id: number }>(
            "INSERT INTO keys (name, room, status) VALUES ('Chave 131', 'Sala 131', 'available') RETURNING id",
        ))!.id;
        const tx = (user: number, porteiro: number | null, status: string) => execute(
            "INSERT INTO key_transactions (key_id, user_id, action, status, porteiro_id) VALUES ($1, $2, 'withdraw', $3, $4)",
            [chave, user, status, porteiro],
        );
        await tx(ALUNO, PORTEIRO, 'pending');
        await tx(ALUNO2, PORTEIRO, 'porteiro_confirmed');
        await tx(ALUNO, PORTEIRO, 'completed');   // fora: não está pendente
    });

    it('BDD 1: sem restrição, todas as pendentes (e só as pendentes)', async () => {
        const todas = await listarPendencias({});
        expect(todas.map(t => t.user_id).sort()).toEqual([ALUNO, ALUNO2]);
        expect(todas.every(t => ['pending', 'porteiro_confirmed'].includes(t.status))).toBe(true);
    });

    it('BDD 1: com restrição, só as da pessoa — como destinatária ou como porteiro', async () => {
        const doAluno = await listarPendencias({ restritoAoUsuarioId: ALUNO });
        expect(doAluno.map(t => t.user_id)).toEqual([ALUNO]);
        const doPorteiro = await listarPendencias({ restritoAoUsuarioId: PORTEIRO });
        expect(doPorteiro.map(t => t.user_id).sort(), 'o porteiro que iniciou também vê').toEqual([ALUNO, ALUNO2]);
    });

    it('BDD 1: os papéis que veem todas são os do balcão — e só eles', () => {
        expect([...PAPEIS_QUE_VEEM_TODAS_AS_PENDENCIAS].sort()).toEqual(['ADMIN', 'GESTOR', 'PORTEIRO']);
    });

    it('BDD 1: datas em ISO, como no JSON da rota', async () => {
        const [t] = await listarPendencias({ restritoAoUsuarioId: ALUNO });
        expect(t.initiated_at).toMatch(ISO);
        expect(t.key_name).toBe('Chave 131');
    });
});

describe('TASK-131 — logs: a mesma consulta da rota', () => {
    beforeAll(async () => {
        await withMaintenanceMode(tx => tx.execute('DELETE FROM action_logs'));
        const ins = (acao: string, ts: string) => execute(
            'INSERT INTO action_logs (user_id, username, action, target, timestamp) VALUES (1, $1, $2, $3, $4)',
            ['test_admin', acao, 'alvo', ts],
        );
        await ins('LOGIN_SUCCESS', '2026-09-14T10:00:00.000Z');
        await ins('KEY_WITHDRAW', '2026-09-14T11:00:00.000Z');
        await ins('LOGIN_FAILED', '2026-09-14T12:00:00.000Z');
    });

    it('BDD 2: sem filtro, tudo, do mais novo ao mais antigo, com o total', async () => {
        const r = await listarLogs({ page: 1, limit: 50 });
        expect(r.logs.map(l => l.action)).toEqual(['LOGIN_FAILED', 'KEY_WITHDRAW', 'LOGIN_SUCCESS']);
        expect(r.total).toBe(3);
        expect(r.totalPages).toBe(1);
        expect(r.page).toBe(1);
    });

    it('BDD 2: a categoria filtra, e a paginação conta sobre o filtrado', async () => {
        const r = await listarLogs({ page: 1, limit: 1, category: 'login' });
        expect(r.logs.map(l => l.action)).toEqual(['LOGIN_FAILED']);
        expect(r.total).toBe(2);
        expect(r.totalPages).toBe(2);
    });

    it('BDD 2: datas em ISO e `total` numérico (count(*) volta string do Postgres)', async () => {
        const r = await listarLogs({ page: 1, limit: 50 });
        expect(r.logs[0].timestamp).toMatch(ISO);
        expect(typeof r.total).toBe('number');
    });
});

describe('TASK-131 — usuários: só os ativos, sem segredo', () => {
    beforeAll(async () => {
        await execute("DELETE FROM users WHERE username = 'inativo_131'");
        await execute("INSERT INTO users (username, password_hash, role, active) VALUES ('inativo_131', 'x', 'ALUNO', false)");
    });

    it('BDD 3: lista os ativos com os campos da tela, e nenhum hash', async () => {
        const us = await listarUsuariosAtivos();
        const nomes = us.map(u => u.username);
        expect(nomes).toContain('test_admin');
        expect(nomes, 'inativo apareceu').not.toContain('inativo_131');
        for (const u of us) {
            expect(Object.keys(u).sort()).toEqual(['full_name', 'id', 'matricula', 'phone', 'role', 'username']);
        }
    });
});

describe('TASK-131 — página e rota chamam a mesma função, e o cliente nasce com os dados', () => {
    const casos = [
        { pagina: 'src/app/(app)/confirm/page.tsx', rota: 'src/app/api/transactions/pending/route.ts', funcao: 'listarPendencias', prop: 'pendenciasIniciais', cliente: 'src/app/(app)/confirm/ConfirmClient.tsx' },
        { pagina: 'src/app/(app)/logs/page.tsx', rota: 'src/app/api/logs/route.ts', funcao: 'listarLogs', prop: 'logsIniciais', cliente: 'src/app/(app)/logs/LogsClient.tsx' },
        { pagina: 'src/app/(app)/users/page.tsx', rota: 'src/app/api/users/route.ts', funcao: 'listarUsuariosAtivos', prop: 'usuariosIniciais', cliente: 'src/app/(app)/users/UsersClient.tsx' },
    ];

    for (const c of casos) {
        it(`BDD 4: ${c.pagina.split('/').slice(-2, -1)[0]} — página consulta e entrega ao cliente`, () => {
            const fonte = semComentarios(c.pagina);
            expect(fonte, 'a página não consulta no servidor').toMatch(new RegExp(`\\b${c.funcao}\\s*\\(`));
            expect(fonte, 'a página não entrega os dados ao cliente').toMatch(new RegExp(`\\b${c.prop}=\\{`));
        });

        it(`BDD 4: ${c.rota.split('/').slice(-2, -1)[0]} — a rota usa a mesma função`, () => {
            expect(semComentarios(c.rota), 'a rota tem a própria cópia da consulta').toMatch(new RegExp(`\\b${c.funcao}\\s*\\(`));
        });

        it(`BDD 4: ${c.cliente.split('/').pop()} — não nasce carregando`, () => {
            const fonte = semComentarios(c.cliente);
            expect(fonte, 'o cliente não recebe os dados iniciais').toMatch(new RegExp(`\\b${c.prop}\\b`));
            expect(fonte, 'o estado de carregamento nasce verdadeiro — a tela abre vazia').not.toMatch(/useState\(\s*true\s*\)/);
        });
    }

    it('BDD 4: o Logs não "pula a primeira execução" do efeito — o StrictMode executa duas', () => {
        // A primeira versão pulava a montagem com `useRef(true)`. Em produção, verde; no CI (next
        // dev, StrictMode), a segunda execução buscava de novo e a E2E viu "Carregando…" em 79
        // quadros. O efeito compara os filtros com os da última página carregada.
        const fonte = semComentarios('src/app/(app)/logs/LogsClient.tsx');
        expect(fonte, 'voltou o pulo por booleano').not.toMatch(/useRef\(\s*true\s*\)/);
        expect(fonte, 'o efeito não compara os filtros com os já carregados').toMatch(/chaveDosFiltros\s*===\s*chaveCarregada\.current/);
    });

    it('BDD 4: a consulta das pendências não ficou duplicada na rota', () => {
        expect(semComentarios('src/app/api/transactions/pending/route.ts')).not.toMatch(/FROM\s+key_transactions/);
    });

    it('BDD 4: a consulta dos logs não ficou duplicada na rota', () => {
        expect(semComentarios('src/app/api/logs/route.ts')).not.toMatch(/FROM\s+\$\{?tableName|FROM\s+action_logs/);
    });
});
