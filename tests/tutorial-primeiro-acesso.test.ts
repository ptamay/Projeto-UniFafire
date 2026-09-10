import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execute, queryOne } from '@/lib/pg';

// TASK-098 (CR Tipo A · ADR-018) — tutorial de primeiro acesso, em português.
//
// ## Por papel, e não um só para todos
//
// O PORTEIRO precisa aprender o balcão: escolher a pessoa, solicitar, e que a
// entrega só se completa com a confirmação dela. O ALUNO precisa saber onde vê as
// próprias chaves e que **é ele quem confirma**. O mesmo tutorial para os dois
// ensina a pessoa errada — e um tutorial que ensina errado é pior que nenhum,
// porque consome a única vez que alguém presta atenção.
//
// ## Onde fica o "já viu"
//
// Coluna em `users`, não `localStorage`. O balcão tem computador compartilhado, e
// `localStorage` erraria nos DOIS sentidos: quem entrasse depois no mesmo navegador
// nunca veria o tutorial, e a mesma pessoa o veria de novo em cada aparelho.
//
// ## O que ele não pode fazer
//
// Bloquear. A primeira retirada de chave pode ser urgente, e um tutorial que
// impede de trabalhar é um obstáculo com cara de ajuda.

const RAIZ = process.cwd();
const MIGRATION = 'db/migrations-pg/202609101000_tutorial_visto';

const ler = (f: string) => fs.readFileSync(path.resolve(RAIZ, f), 'utf-8');
const semComentarios = (f: string) =>
    ler(f).replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

vi.mock('next/headers', () => ({
    cookies: () => Promise.resolve({ get: () => ({ value: 'token' }), set: vi.fn(), delete: vi.fn() }),
}));

beforeEach(async () => {
    await execute('UPDATE users SET onboarding_visto_em = NULL');
});

describe('TASK-098 — o "já viu" pertence à pessoa, não ao navegador', () => {
    it('BDD 1: existe UP com DOWN pareado, e a coluna nasce nula', async () => {
        expect(fs.existsSync(path.resolve(RAIZ, `${MIGRATION}.up.sql`))).toBe(true);
        expect(fs.existsSync(path.resolve(RAIZ, `${MIGRATION}.down.sql`))).toBe(true);

        // Um DEFAULT de `now()` marcaria TODO MUNDO como tendo visto no instante da
        // migration — o oposto do que se quer, e sem sintoma nenhum.
        const conta = await queryOne<{ onboarding_visto_em: Date | null }>(
            'SELECT onboarding_visto_em FROM users LIMIT 1');
        expect(conta!.onboarding_visto_em, 'a coluna nasceu preenchida').toBeNull();
    });

    it('BDD 1: a rota marca como visto, e só para quem está pedindo', async () => {
        // Marcar por `userId` do corpo deixaria qualquer um marcar por qualquer um —
        // inofensivo em aparência, e é escrita não autorizada numa linha alheia.
        vi.resetModules();
        vi.doMock('@/lib/session', () => ({
            verifySession: () => Promise.resolve({ id: 3, username: 'test_porteiro', role: 'PORTEIRO' }),
        }));
        const { POST } = await import('@/app/api/account/onboarding/route');

        const res = await POST(new Request('http://localhost/api/account/onboarding', {
            method: 'POST', body: JSON.stringify({ userId: 1 }),
        }));
        expect(res.status).toBe(200);

        const alvo = await queryOne<{ onboarding_visto_em: Date | null }>(
            'SELECT onboarding_visto_em FROM users WHERE id = 3');
        const outro = await queryOne<{ onboarding_visto_em: Date | null }>(
            'SELECT onboarding_visto_em FROM users WHERE id = 1');

        expect(alvo!.onboarding_visto_em, 'quem pediu não foi marcado').not.toBeNull();
        expect(outro!.onboarding_visto_em, 'marcou a linha de OUTRA pessoa, vinda do corpo').toBeNull();
    });

    it('BDD 1: sem sessão, não marca ninguém', async () => {
        vi.resetModules();
        vi.doMock('@/lib/session', () => ({ verifySession: () => Promise.resolve(null) }));
        const { POST } = await import('@/app/api/account/onboarding/route');

        const res = await POST(new Request('http://localhost/api/account/onboarding', { method: 'POST' }));
        expect(res.status).toBe(401);
    });
});

describe('TASK-098 — ensina a pessoa certa', () => {
    const tutorial = () => semComentarios('src/app/components/Tutorial.tsx');

    it('BDD 2: o conteúdo muda com o papel', () => {
        const fonte = tutorial();
        expect(fonte, 'o tutorial não olha o papel — ensina a mesma coisa a todos')
            .toMatch(/PORTEIRO|operaBalcao|papel/);
    });

    it('BDD 2: quem opera o balcão aprende a dupla confirmação', () => {
        // É a regra que mais gera dúvida na portaria: a chave não sai sozinha do
        // sistema — a pessoa que recebe precisa confirmar. Sem isso o porteiro acha
        // que o sistema travou.
        expect(tutorial(), 'o tutorial não menciona a confirmação da outra parte')
            .toMatch(/confirm/i);
    });

    it('BDD 3: é dispensável e navegável por teclado', () => {
        // Não pode bloquear: a primeira retirada pode ser urgente, e tutorial que
        // impede de trabalhar é obstáculo com cara de ajuda.
        const fonte = tutorial();
        expect(fonte, 'não há como pular o tutorial').toMatch(/Pular|Fechar|fechar/);
        expect(fonte, 'o overlay não reage a Escape').toMatch(/Escape/);
        expect(fonte, 'o diálogo não se anuncia para leitor de tela')
            .toMatch(/role="dialog"|aria-modal/);
    });
});

describe('TASK-098 — a tela de Configurações passa a poder oferecer', () => {
    it('BDD 4: o botão de rever tutorial existe agora que o tutorial existe', () => {
        // ⚠️ Este cenário é o PAR do que a TASK-097 escreveu ao contrário. Lá,
        // `configuracoes-reequilibradas.test.ts` PROIBIA a palavra "tutorial" na
        // tela, porque oferecer o que não existe é a mentira em tela que o ADR-013
        // combate. Aquele cenário tinha de cair para este subir — e é assim que ele
        // avisou que a hora tinha chegado.
        expect(semComentarios('src/app/settings/SettingsClient.tsx'), 'a tela não oferece rever o tutorial')
            .toMatch(/tutorial/i);
    });
});
