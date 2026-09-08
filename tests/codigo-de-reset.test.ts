import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { execute, queryOne } from '@/lib/pg';
import { TEST_PASSWORD } from './setup';

// TASK-093 (CR Tipo C · ADR-017) — o reset emite um CÓDIGO DE USO ÚNICO.
// constitution §2.1, §2.4, §7.1.
//
// ## O que estava aberto
//
// O reset gravava na conta o hash de uma senha padrão COMPARTILHADA e ligava
// `requires_password_change`. A TASK-087 (ADR-014) fechou o *acesso* ao valor
// para papéis baixos e registrou que não fechava a *fragilidade*:
//
// - ADMIN e GESTOR conhecem a senha legitimamente, por desenho;
// - ela NUNCA muda — quem a soube uma vez a sabe para sempre;
// - a janela entre o reset e o primeiro acesso da vítima continua aberta para
//   todos esses. Se o alvo do reset for GESTOR ou ADMIN, quem entra herda o papel.
//
// ## O que muda
//
// O que se entrega deixa de ser uma senha: é um código aleatório, com hash em
// coluna própria, prazo curto e UM uso. A pessoa entra com `username + código` e
// define a própria senha ali. Ninguém além dela conhece a senha dela.
//
// Isso também é o que mantém a §2.1 intacta — nenhuma senha trafega em claro na
// resposta da API. Um código de uso único não é uma senha.
//
// ## O cenário que mais importa não é sobre código nenhum
//
// É o último: **o login de quem NÃO está em reset**. Este caminho é o Fluxo 1 da
// spec §4 ("não pode falhar"), e o risco real desta task é regredi-lo enquanto se
// conserta outra coisa.

vi.mock('next/headers', () => ({
    cookies: () => ({ set: vi.fn(), get: () => ({ value: 'token_de_teste' }), delete: vi.fn() }),
}));

// ⚠️ `importOriginal` e não um objeto solto. Substituir `@/lib/session` inteiro
// para trocar `verifySession` apaga `signSession`, que o login usa — e o sintoma
// vira 500 no login, num arquivo que existe para provar que o login NÃO quebrou.
// Foi o que aconteceu na primeira versão deste arquivo.
vi.mock('@/lib/session', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/session')>()),
    verifySession: () => Promise.resolve({ id: 1, username: 'test_admin', role: 'ADMIN' }),
}));

function pedidoDeLogin(username: string, password: string, newPassword?: string) {
    return new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(newPassword ? { username, password, newPassword } : { username, password }),
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.9.0.1' },
    });
}

/** Põe a conta no estado que o reset deixa: código válido, senha inutilizável. */
async function semearCodigo(username: string, codigo: string, minutos = 30) {
    await execute(
        `UPDATE users SET password_hash = NULL, reset_code_hash = $1,
         reset_code_expires_at = now() + ($2 || ' minutes')::interval,
         requires_password_change = true WHERE username = $3`,
        [await bcrypt.hash(codigo, 10), String(minutos), username],
    );
}

async function contaDe(username: string) {
    return queryOne<{
        password_hash: string | null;
        reset_code_hash: string | null;
        reset_code_expires_at: Date | null;
        requires_password_change: boolean;
    }>(
        `SELECT password_hash, reset_code_hash, reset_code_expires_at, requires_password_change
         FROM users WHERE username = $1`,
        [username],
    );
}

beforeEach(async () => {
    await execute('DELETE FROM login_attempts');
});

describe('TASK-093 — o código em si', () => {
    it('BDD 1: dois códigos seguidos são diferentes', async () => {
        const { gerarCodigoDeAcesso } = await import('@/lib/reset-code');
        const amostras = new Set(Array.from({ length: 200 }, () => gerarCodigoDeAcesso()));
        expect(amostras.size, 'o gerador repete — é previsível').toBe(200);
    });

    it('BDD 1: o alfabeto não tem caractere ambíguo', async () => {
        // O código é DITADO no balcão e digitado por outra pessoa. `0` e `O`,
        // `1` e `I` e `l` são o mesmo caractere para quem escuta. Cada ambiguidade
        // vira uma tentativa falha, e tentativa falha conta para o lockout.
        const { gerarCodigoDeAcesso, ALFABETO_DO_CODIGO } = await import('@/lib/reset-code');
        for (const proibido of ['0', 'O', '1', 'I', 'l']) {
            expect(ALFABETO_DO_CODIGO, `o alfabeto contém ${proibido}`).not.toContain(proibido);
        }
        const codigo = gerarCodigoDeAcesso();
        expect(codigo).toMatch(new RegExp(`^[${ALFABETO_DO_CODIGO}]+$`));
    });

    it('BDD 1: é longo o suficiente para não ser adivinhado', async () => {
        // Curto demais e o lockout vira a única defesa. Longo demais e ninguém
        // consegue ditar. O piso é entropia; o teto é a boca de quem fala.
        const { gerarCodigoDeAcesso, ALFABETO_DO_CODIGO } = await import('@/lib/reset-code');
        const codigo = gerarCodigoDeAcesso();
        const bits = codigo.length * Math.log2(ALFABETO_DO_CODIGO.length);
        expect(bits, `só ${bits.toFixed(0)} bits de entropia`).toBeGreaterThanOrEqual(40);
        expect(codigo.length, 'longo demais para ditar em voz alta').toBeLessThanOrEqual(12);
    });
});

describe('TASK-093 — o reset emite código e mata a senha antiga', () => {
    it('BDD 2: a conta fica com código e SEM senha utilizável', async () => {
        const { POST } = await import('@/app/api/users/reset-password/route');
        const alvo = await queryOne<{ id: number }>("SELECT id FROM users WHERE username = 'test_aluno'");
        const res = await POST(new Request('http://localhost/api/users/reset-password', {
            method: 'POST', body: JSON.stringify({ userId: alvo!.id }),
        }));
        const corpo = await res.json();

        expect(res.status).toBe(200);
        expect(typeof corpo.codigoDeAcesso, 'o código não voltou na resposta').toBe('string');

        const conta = await contaDe('test_aluno');
        expect(conta!.reset_code_hash, 'a conta não guardou o código').not.toBeNull();
        expect(conta!.reset_code_expires_at, 'o código não tem prazo').not.toBeNull();
        expect(
            conta!.password_hash,
            'a senha antiga sobreviveu ao reset — quem a conhecia continua entrando',
        ).toBeNull();
    });

    it('BDD 2: o código NÃO aparece na trilha de auditoria', async () => {
        // §7.1 proíbe senha em log. O código precisa da proibição explícita
        // justamente porque NÃO é senha — alguém poderia concluir que está
        // liberado, e a trilha é imutável: o que entrar ali fica.
        const { POST } = await import('@/app/api/users/reset-password/route');
        const alvo = await queryOne<{ id: number }>("SELECT id FROM users WHERE username = 'test_aluno2'");
        const corpo = await (await POST(new Request('http://localhost/api/users/reset-password', {
            method: 'POST', body: JSON.stringify({ userId: alvo!.id }),
        }))).json();

        expect(
            typeof corpo.codigoDeAcesso,
            'sem código na resposta este cenário passaria à toa, procurando por "undefined"',
        ).toBe('string');

        const vazou = await queryOne<{ n: string }>(
            `SELECT COUNT(*) AS n FROM action_logs WHERE details LIKE $1 OR target LIKE $1`,
            [`%${corpo.codigoDeAcesso}%`],
        );
        expect(Number(vazou!.n), 'o código foi parar na trilha imutável').toBe(0);
    });
});

describe('TASK-093 — o login aceita o código UMA vez', () => {
    it('BDD 3: com código e senha nova, entra e o código é consumido', async () => {
        const { POST } = await import('@/app/api/auth/login/route');
        await semearCodigo('test_funcionario', 'ABCDEFGH');

        const res = await POST(pedidoDeLogin('test_funcionario', 'ABCDEFGH', 'senha_nova_123'));
        expect(res.status, await res.text()).toBe(200);

        const conta = await contaDe('test_funcionario');
        expect(conta!.reset_code_hash, 'o código continua valendo depois de usado').toBeNull();
        expect(conta!.requires_password_change).toBe(false);
        expect(await bcrypt.compare('senha_nova_123', conta!.password_hash!)).toBe(true);
    });

    it('BDD 3: o MESMO código não serve duas vezes', async () => {
        // É o coração do desenho. Um código reutilizável é a senha compartilhada
        // de novo, só que com nome diferente.
        const { POST } = await import('@/app/api/auth/login/route');
        await semearCodigo('test_funcionario', 'JKLMNPQR');

        expect((await POST(pedidoDeLogin('test_funcionario', 'JKLMNPQR', 'primeira_123'))).status).toBe(200);
        const segunda = await POST(pedidoDeLogin('test_funcionario', 'JKLMNPQR', 'segunda_456'));
        expect(segunda.status, 'o código foi aceito uma segunda vez').toBe(401);
    });

    it('BDD 3: sem a senha nova, exige a troca em vez de deixar entrar', async () => {
        const { POST } = await import('@/app/api/auth/login/route');
        await semearCodigo('test_aluno', 'STUVWXYZ');

        const res = await POST(pedidoDeLogin('test_aluno', 'STUVWXYZ'));
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe('REQUIRE_PASSWORD_CHANGE');
    });

    it('BDD 4: código expirado não entra', async () => {
        const { POST } = await import('@/app/api/auth/login/route');
        await semearCodigo('test_aluno', 'EXPIRADO2', -1);

        const res = await POST(pedidoDeLogin('test_aluno', 'EXPIRADO2', 'qualquer_123'));
        expect(res.status, 'código vencido ainda abre a conta').toBe(401);
    });

    it('BDD 4: o erro de código vencido não denuncia que a conta está em reset', async () => {
        // Distinguir "código expirado" de "senha errada" contaria a qualquer um
        // que aquela conta está no meio de um reset — que é exatamente a janela
        // que este ADR fecha. A mensagem é a mesma das credenciais inválidas.
        const { POST } = await import('@/app/api/auth/login/route');
        await semearCodigo('test_aluno2', 'EXPIRADO3', -1);

        const vencido = await (await POST(pedidoDeLogin('test_aluno2', 'EXPIRADO3', 'x_1234567'))).json();
        const errado = await (await POST(pedidoDeLogin('test_aluno2', 'NAOEHOCOD', 'x_1234567'))).json();
        expect(vencido.error).toBe(errado.error);
    });
});

describe('TASK-093 — o login de sempre não regrediu', () => {
    // O guarda que importa mais que todos os outros juntos. Fluxo 1 da spec §4.
    it('BDD 5: quem não está em reset entra com a própria senha', async () => {
        const { POST } = await import('@/app/api/auth/login/route');
        const res = await POST(pedidoDeLogin('test_gestor', TEST_PASSWORD));
        expect(res.status, 'o login normal quebrou').toBe(200);
    });

    it('BDD 5: senha errada continua sendo 401, e não 500', async () => {
        // `password_hash` agora pode ser NULL, e `bcrypt.compare(x, null)` LANÇA.
        // Sem guarda, uma conta em reset transformaria erro de credencial em erro
        // interno — e 500 num login é indistinguível de indisponibilidade.
        const { POST } = await import('@/app/api/auth/login/route');
        expect((await POST(pedidoDeLogin('test_gestor', 'senha_errada'))).status).toBe(401);

        await semearCodigo('test_porteiro', 'CODIGOAAA');
        const semSenha = await POST(pedidoDeLogin('test_porteiro', 'chute_qualquer'));
        expect(semSenha.status, 'conta sem senha derruba o login com 500').toBe(401);
    });

    it('BDD 5: usuário inexistente continua com a mesma resposta', async () => {
        const { POST } = await import('@/app/api/auth/login/route');
        const res = await POST(pedidoDeLogin('nao_existe_mesmo', 'seja_o_que_for'));
        expect(res.status).toBe(401);
    });
});
