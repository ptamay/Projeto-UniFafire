import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { execute, queryOne } from '@/lib/pg';

// TASK-094 (CR Tipo C · ADR-017) — a senha padrão compartilhada deixa de existir.
// constitution §2.1, §2.4.
//
// ## O que a TASK-093 deixou pela metade, e de propósito
//
// A 093 fez o reset emitir CÓDIGO DE USO ÚNICO. A senha compartilhada parou de ser
// APLICADA em qualquer lugar — mas continuou existindo: a linha em `settings`, o
// campo na tela de Configurações e a constante `SENHA_PADRAO_RESET`.
//
// Isso é exatamente a "mentira em tela" que o ADR-013 veio combater: um controle
// que o ADMIN preenche, salva, e que não configura nada.
//
// ## O passo que se esquece
//
// Remover a configuração NÃO desarma quem já a tem gravada. Uma conta resetada
// ANTES da 093 carrega no `password_hash` o hash da senha compartilhada e
// `requires_password_change = true`. Tirar o campo da tela a deixaria aberta a quem
// conhece o valor antigo — **agora sem nada na tela que denuncie**.
//
// Em produção são ZERO contas nesse estado (verificado em 2026-09-08, de 2 ativas).
// A guarda existe porque alguém pode ser resetado entre aquela contagem e a
// aplicação desta migration, e porque "provavelmente nenhuma" não é um plano.

const RAIZ = process.cwd();
const MIGRATION = 'db/migrations-pg/202609090900_sem_senha_compartilhada';

const semComentarios = (f: string) =>
    fs.readFileSync(path.resolve(RAIZ, f), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

vi.mock('next/headers', () => ({
    cookies: () => Promise.resolve({ get: () => ({ value: 'token' }), set: vi.fn(), delete: vi.fn() }),
}));

async function pedirSettingsComo(role: string) {
    vi.resetModules();
    vi.doMock('@/lib/session', () => ({
        verifySession: () => Promise.resolve({ id: 1, username: 'test_admin', role }),
    }));
    const { GET } = await import('@/app/api/settings/route');
    return (await GET()).json();
}

beforeEach(async () => {
    await execute("DELETE FROM settings WHERE key = 'default_reset_password'");
});

describe('TASK-094 — a senha compartilhada some da superfície', () => {
    it('BDD 1: NENHUM papel recebe `defaultResetPassword` — nem ADMIN', async () => {
        // A TASK-087 tirou o campo dos papéis baixos e registrou que fechava o
        // ACESSO, não a fragilidade: ADMIN e GESTOR continuavam conhecendo uma
        // senha que nunca muda. Agora não há o que conhecer.
        for (const role of ['ALUNO', 'FUNCIONARIO', 'PORTEIRO', 'GESTOR', 'ADMIN']) {
            const corpo = await pedirSettingsComo(role);
            expect(corpo.defaultResetPassword, `${role} ainda recebe a senha compartilhada`)
                .toBeUndefined();
        }
    });

    it('BDD 1: TODOS continuam recebendo `autoLogoutTime`', async () => {
        // Guarda contra passar do ponto: o `Sidebar` de todo papel depende deste
        // campo para o logout automático, que é um controle da §2.
        for (const role of ['ALUNO', 'PORTEIRO', 'ADMIN']) {
            const corpo = await pedirSettingsComo(role);
            expect(corpo.autoLogoutTime, `${role} perdeu o horário de logout`)
                .toMatch(/^\d{2}:\d{2}$/);
        }
    });

    it('BDD 2: o POST não grava a senha compartilhada nem se mandarem', async () => {
        // A rota não pode aceitar e IGNORAR: aceitar em silêncio faria a tela de
        // um cliente antigo parecer que salvou. E não pode gravar: a linha voltaria
        // a existir sem nada que a leia.
        vi.resetModules();
        vi.doMock('@/lib/session', () => ({
            verifySession: () => Promise.resolve({ id: 1, username: 'test_admin', role: 'ADMIN' }),
        }));
        const { POST } = await import('@/app/api/settings/route');
        await POST(new Request('http://localhost/api/settings', {
            method: 'POST',
            body: JSON.stringify({ autoLogoutTime: '19:00', defaultResetPassword: 'voltei123' }),
        }));

        const linha = await queryOne<{ value: string }>(
            "SELECT value FROM settings WHERE key = 'default_reset_password'",
        );
        expect(linha ?? null, 'o POST ressuscitou a senha compartilhada').toBeNull();
    });

    it('BDD 2: a constante e o campo da tela não existem mais', () => {
        expect(semComentarios('src/lib/settings-policy.ts'), 'SENHA_PADRAO_RESET sobreviveu')
            .not.toMatch(/SENHA_PADRAO_RESET/);
        expect(semComentarios('src/app/settings/SettingsClient.tsx'), 'a tela ainda tem o campo')
            .not.toMatch(/defaultResetPassword/);
    });

    it('BDD 2: o GET continua verificando a sessão por conta própria', () => {
        // HERDADO da TASK-087, cujo arquivo de teste esta task substitui.
        //
        // Aquele cenário verificava duas coisas: que o `GET` chama `verifySession`,
        // e que olha o PAPEL para decidir o que devolver. A segunda morreu com o
        // campo — a resposta passou a ter um item só, legítimo para todo papel.
        //
        // A primeira **não morreu**, e é defesa em profundidade (§3.2): a rota não
        // pode depender do proxy para saber que há alguém do outro lado. Trazida
        // para cá em vez de perdida junto com o arquivo antigo.
        const fonte = semComentarios('src/app/api/settings/route.ts');
        const get = fonte.slice(fonte.indexOf('export async function GET'),
                                fonte.indexOf('export async function POST'));
        expect(get, 'o GET voltou a se apoiar só no proxy').toMatch(/verifySession/);
    });

    it('BDD 2: o contrato de API não promete mais o campo', () => {
        const contrato = fs.readFileSync(path.resolve(RAIZ, 'docs/api-contract.md'), 'utf-8');
        const secaoViva = contrato.slice(0, contrato.indexOf('## O que NÃO existe'));
        expect(secaoViva, 'o contrato continua prometendo `defaultResetPassword`')
            .not.toMatch(/defaultResetPassword/);
    });
});

describe('TASK-094 — a migration desarma quem já tem a senha antiga', () => {
    it('BDD 3: existe UP com DOWN pareado', () => {
        expect(fs.existsSync(path.resolve(RAIZ, `${MIGRATION}.up.sql`))).toBe(true);
        expect(fs.existsSync(path.resolve(RAIZ, `${MIGRATION}.down.sql`))).toBe(true);
    });

    it('BDD 3: invalida o reset ANTIGO e NÃO toca o fluxo novo', async () => {
        // ⚠️ O cenário central, e a distinção é sutil: depois da TASK-093, uma conta
        // recém-resetada TAMBÉM tem `requires_password_change = true`. O que separa
        // as duas é o CÓDIGO.
        //
        //   antigo (perigoso)  password_hash = bcrypt(senha compartilhada)
        //                      reset_code_hash = NULL
        //   novo (legítimo)    password_hash = NULL
        //                      reset_code_hash = <hash do código>
        //
        // Uma migration que olhasse só `requires_password_change` derrubaria o
        // código de quem está a caminho do balcão para trocar a senha.
        const hash = await bcrypt.hash('unifafire123', 10);
        const codigo = await bcrypt.hash('ABCDEFGHJ', 10);
        await execute('DELETE FROM users WHERE id IN (901, 902, 903)');
        await execute(
            `INSERT INTO users (id, username, password_hash, reset_code_hash, reset_code_expires_at, role, requires_password_change)
             OVERRIDING SYSTEM VALUE VALUES
               (901, 'pendente_antigo', $1, NULL, NULL, 'ALUNO', true),
               (902, 'pendente_novo', NULL, $2, now() + interval '30 minutes', 'ALUNO', true),
               (903, 'normal', $1, NULL, NULL, 'ALUNO', false)`,
            [hash, codigo],
        );

        const sql = fs.readFileSync(path.resolve(RAIZ, `${MIGRATION}.up.sql`), 'utf-8');
        await execute(sql);

        const antigo = await queryOne<{ password_hash: string | null }>(
            'SELECT password_hash FROM users WHERE id = 901');
        const novo = await queryOne<{ password_hash: string | null; reset_code_hash: string | null }>(
            'SELECT password_hash, reset_code_hash FROM users WHERE id = 902');
        const normal = await queryOne<{ password_hash: string | null }>(
            'SELECT password_hash FROM users WHERE id = 903');

        expect(antigo!.password_hash, 'a conta com a senha compartilhada continua aberta').toBeNull();
        expect(novo!.reset_code_hash, 'a migration derrubou um código de uso único legítimo').not.toBeNull();
        expect(normal!.password_hash, 'a migration invalidou quem não estava em reset').not.toBeNull();

        await execute('DELETE FROM users WHERE id IN (901, 902, 903)');
    });

    it('BDD 3: a linha de `settings` deixa de existir', async () => {
        await execute(
            `INSERT INTO settings (key, value) VALUES ('default_reset_password', 'trocar123')
             ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        );
        await execute(fs.readFileSync(path.resolve(RAIZ, `${MIGRATION}.up.sql`), 'utf-8'));

        const linha = await queryOne<{ value: string }>(
            "SELECT value FROM settings WHERE key = 'default_reset_password'");
        expect(linha ?? null, 'a linha sintética da TASK-067 continua no banco').toBeNull();
    });

    it('BDD 4: o DOWN não finge que consegue restaurar as senhas', () => {
        // Reverter uma migration que APAGA hash não devolve o hash. Um DOWN que
        // calasse sobre isso faria alguém acreditar que a reversão é completa — e
        // descobrir o contrário com gente sem conseguir entrar.
        const down = fs.readFileSync(path.resolve(RAIZ, `${MIGRATION}.down.sql`), 'utf-8');
        expect(down, 'o DOWN não avisa que as senhas invalidadas não voltam')
            .toMatch(/n[ãa]o (volta|restaura|recupera)/i);
    });
});
