import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execute, queryOne } from '@/lib/pg';

// TASK-095 (CR Tipo B · ADR-018) — a saída entra na trilha. REQ-010, §7.1.
//
// ## A lacuna
//
// `POST /api/auth/logout` apagava o cookie e devolvia `{success:true}`. Nada mais.
// O login entra em `action_logs`; a saída não — nem a manual, nem a automática das
// 18:30, nem a expiração.
//
// Uma trilha de auditoria que registra entradas e não registra saídas descreve
// metade do que aconteceu. Isso é lacuna do REQ-010 por si só.
//
// ## E é o que impede um diagnóstico
//
// O relato foi "no celular precisei ficar logando". Os LOGIN_SUCCESS de produção
// têm um intervalo de ~32 h (cabe no idle de 24 h) e outro de ~17 h, que não
// deveria ter derrubado nada. Três hipóteses compatíveis — logout das 18:30 numa
// aba aberta, cookies separados do PWA no iOS, idle — e nenhuma verificável.
//
// ⚠️ Ao escrever o ADR-018 quase concluí "não há registro de LOGOUT, logo o
// automático nunca disparou". **A ausência era do instrumento, não do evento.**
//
// ## O que esta task NÃO consegue registrar, e por quê
//
// A expiração. Quando o cookie morre, o `proxy.ts` recusa — e ele roda no Edge
// Runtime, sem acesso ao banco. Registrar dali é impossível por construção, e
// registrar do lado do cliente exigiria uma rota pública que escreve na trilha
// imutável a partir de um token que já não vale. Não se faz.
//
// O que se obtém é melhor do que parece: com a saída registrada, **um
// LOGIN_SUCCESS sem LOGOUT anterior passa a ser a assinatura** de expiração ou de
// outro aparelho. A discriminação que faltava vem da ausência, agora que a
// presença significa alguma coisa.

const RAIZ = process.cwd();

vi.mock('next/headers', () => ({
    cookies: () => Promise.resolve({ delete: vi.fn(), get: () => ({ value: 'token' }), set: vi.fn() }),
}));

vi.mock('@/lib/session', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/session')>()),
    verifySession: () => Promise.resolve({ id: 3, username: 'test_porteiro', role: 'PORTEIRO' }),
}));

function pedidoDeLogout(corpo?: Record<string, unknown>) {
    return new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
}

/** `queryOne` devolve `undefined` quando não há linha, não `null` — e um cenário
 *  que compara com `null` reprova DEPOIS do conserto também, virando vermelho que
 *  nunca fica verde. Normalizado aqui, num lugar só. */
async function ultimoLogout() {
    return (await queryOne<{ action: string; username: string; details: string }>(
        `SELECT action, username, details FROM action_logs
         WHERE action = 'LOGOUT' ORDER BY id DESC LIMIT 1`,
    )) ?? null;
}

beforeEach(async () => {
    await execute("DELETE FROM action_logs WHERE action = 'LOGOUT'");
});

describe('TASK-095 — a saída entra na trilha', () => {
    it('BDD 1: sair pelo menu registra LOGOUT', async () => {
        const { POST } = await import('@/app/api/auth/logout/route');
        const res = await POST(pedidoDeLogout({ motivo: 'manual' }));
        expect(res.status).toBe(200);

        const linha = await ultimoLogout();
        expect(linha, 'a saída não deixou rastro').not.toBeNull();
        expect(linha!.username).toBe('test_porteiro');
    });

    it('BDD 1: o MOTIVO distingue manual de automático', async () => {
        // É o eixo da task. "Houve um logout" não diagnostica nada: o que se
        // precisa saber é se o sistema expulsou a pessoa ou se ela saiu.
        const { POST } = await import('@/app/api/auth/logout/route');

        await POST(pedidoDeLogout({ motivo: 'automatico' }));
        const automatico = await ultimoLogout();
        expect(automatico!.details, 'não dá para saber que foi o logout das 18:30')
            .toMatch(/autom/i);

        await execute("DELETE FROM action_logs WHERE action = 'LOGOUT'");
        await POST(pedidoDeLogout({ motivo: 'manual' }));
        const manual = await ultimoLogout();
        expect(manual!.details, 'manual e automático ficaram indistinguíveis')
            .not.toMatch(/autom/i);
    });

    it('BDD 2: motivo desconhecido não vira detalhe livre na trilha', async () => {
        // `action_logs` é IMUTÁVEL (§7.1): o que entrar ali fica. Um campo de
        // texto que o cliente preenche à vontade é injeção de conteúdo numa
        // tabela que ninguém pode limpar depois.
        const { POST } = await import('@/app/api/auth/logout/route');
        await POST(pedidoDeLogout({ motivo: '<script>alert(1)</script> e mais 500 caracteres' }));

        const linha = await ultimoLogout();
        expect(linha!.details, 'o cliente escreveu o que quis na trilha imutável')
            .not.toMatch(/script/i);
    });

    it('BDD 2: sem sessão válida, não inventa autor', async () => {
        // Atribuir a saída a alguém que não se conseguiu verificar é pior que não
        // registrar: a trilha passaria a afirmar o que não sabe, e é imutável.
        vi.resetModules();
        vi.doMock('@/lib/session', () => ({ verifySession: () => Promise.resolve(null) }));
        const { POST } = await import('@/app/api/auth/logout/route');

        const res = await POST(pedidoDeLogout({ motivo: 'manual' }));
        expect(res.status, 'sair tem de funcionar mesmo com sessão morta').toBe(200);
        expect(await ultimoLogout(), 'registrou uma saída sem saber de quem').toBeNull();
        vi.doUnmock('@/lib/session');
    });

    it('BDD 3: o cookie é apagado em qualquer caso', async () => {
        // Guarda contra a correção passar do ponto: se o registro falhar ou a
        // sessão já estiver morta, SAIR continua sendo a única coisa que o usuário
        // pediu. Trilha nunca pode impedir alguém de sair.
        const fonte = fs.readFileSync(path.resolve(RAIZ, 'src/app/api/auth/logout/route.ts'), 'utf-8');
        expect(fonte, 'o cookie deixou de ser apagado incondicionalmente')
            .toMatch(/delete\(/);
    });
});

describe('TASK-095 — o cliente diz qual foi o motivo', () => {
    const sidebar = () =>
        fs.readFileSync(path.resolve(RAIZ, 'src/app/components/Sidebar.tsx'), 'utf-8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    it('BDD 4: o logout automático das 18:30 se identifica', () => {
        // Sem isto o servidor recebe todas as saídas iguais, e a task inteira não
        // responde à pergunta que a motivou. O timer é o único que sabe que foi ele.
        expect(sidebar(), 'o logout automático não se distingue do manual')
            .toMatch(/handleLogout\(\s*['"]automatico['"]\s*\)/);
    });

    it('BDD 4: sair pelo menu se identifica como manual', () => {
        expect(sidebar(), 'a saída pelo menu não informa o motivo')
            .toMatch(/handleLogout\(\s*['"]manual['"]\s*\)/);
    });
});
