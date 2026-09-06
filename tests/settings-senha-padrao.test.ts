import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-087 (Sprint 26 · CR Tipo C, ADR-014 achado 2) — `GET /api/settings` para
// de entregar a senha padrão de reset a quem não pode resetar senha.
// constitution §3.2 e §2.
//
// ## O defeito, e por que ele é escalada de privilégio
//
// O handler do `GET` não tem checagem nenhuma — nem de sessão. Apoia-se no proxy,
// que garante que HÁ sessão e deliberadamente não avalia papel. Qualquer usuário
// autenticado, incluindo ALUNO, lê:
//
//     { "autoLogoutTime": "18:30", "defaultResetPassword": "trocar123" }
//
// `autoLogoutTime` é legítimo para todo papel — o `Sidebar` força o logout no
// horário para todo mundo. `defaultResetPassword` não.
//
// A cadeia foi verificada no código, não suposta. Em `login/route.ts:78-88`,
// quando `requires_password_change` está ligado, o login aceita
// `username + password + newPassword` e TROCA A SENHA NA HORA, sem exigir nada
// além da senha atual — que é justamente a padrão:
//
//   1. um ALUNO lê `defaultResetPassword` aqui;
//   2. um ADMIN reseta o acesso de alguém (fluxo rotineiro);
//   3. antes de a vítima entrar, o atacante faz login com o username dela, a
//      senha padrão e uma senha nova que ele escolhe;
//   4. a conta é dele, com `requires_password_change` já desligado.
//
// Se o alvo do reset for GESTOR ou ADMIN, o atacante herda o papel.
//
// ## Por que omitir o campo, e não recusar a requisição
//
// Negar o `GET` a papéis baixos quebraria o logout automático de todo mundo para
// proteger um campo que esses papéis nunca leram. Resposta com menos campos é a
// resposta certa: o consumidor de baixo privilégio continua recebendo o que usa.

const RAIZ = process.cwd();

async function pedirSettingsComo(role: string) {
    vi.resetModules();
    vi.doMock('next/headers', () => ({
        cookies: () => Promise.resolve({ get: () => ({ value: 'token' }) }),
    }));
    vi.doMock('@/lib/session', () => ({
        verifySession: () => Promise.resolve({ id: 5, username: 'quem_seja', role }),
    }));
    const { GET } = await import('@/app/api/settings/route');
    return (await GET()).json();
}

afterEach(() => { vi.resetModules(); vi.doUnmock('next/headers'); vi.doUnmock('@/lib/session'); });

describe('TASK-087 — a senha padrão de reset só vai para quem reseta senha', () => {
    it('BDD 1: ALUNO não recebe `defaultResetPassword`', async () => {
        const corpo = await pedirSettingsComo('ALUNO');
        expect(corpo.defaultResetPassword, 'um aluno lê a senha padrão de reset').toBeUndefined();
    });

    it('BDD 1: FUNCIONARIO e PORTEIRO também não', async () => {
        for (const role of ['FUNCIONARIO', 'PORTEIRO']) {
            const corpo = await pedirSettingsComo(role);
            expect(corpo.defaultResetPassword, `${role} lê a senha padrão de reset`).toBeUndefined();
        }
    });

    it('BDD 2: ADMIN e GESTOR recebem — são quem reseta', async () => {
        // O mesmo conjunto do `POST /api/settings` e da rota de reset. A tela de
        // Configurações precisa exibir o campo para quem pode alterá-lo.
        for (const role of ['ADMIN', 'GESTOR']) {
            const corpo = await pedirSettingsComo(role);
            expect(typeof corpo.defaultResetPassword, `${role} deixou de receber e a tela quebra`)
                .toBe('string');
        }
    });

    it('BDD 3: TODOS os papéis continuam recebendo `autoLogoutTime`', async () => {
        // Guarda contra a correção passar do ponto: negar o GET inteiro
        // quebraria o logout automático de todo mundo — um controle da §2 — para
        // proteger um campo que esses papéis nunca leram.
        for (const role of ['ALUNO', 'FUNCIONARIO', 'PORTEIRO', 'GESTOR', 'ADMIN']) {
            const corpo = await pedirSettingsComo(role);
            expect(corpo.autoLogoutTime, `${role} perdeu o horário de logout automático`)
                .toMatch(/^\d{2}:\d{2}$/);
        }
    });

    it('BDD 4: o handler passa a verificar a sessão por conta própria', () => {
        // Ele se apoiava só no proxy. Defesa em profundidade (§3.2): a rota não
        // pode depender de outra camada para saber quem está perguntando,
        // justamente porque precisa do PAPEL para decidir o que devolver.
        const fonte = fs.readFileSync(path.resolve(RAIZ, 'src/app/api/settings/route.ts'), 'utf-8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        const get = fonte.slice(fonte.indexOf('export async function GET'), fonte.indexOf('export async function POST'));
        expect(get, 'o GET não verifica a sessão').toMatch(/verifySession/);
        expect(get, 'o GET não olha o papel').toMatch(/role/);
    });
});
