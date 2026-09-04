import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { decodeJwt } from 'jose';
import { validarJwtSecret, MIN_CARACTERES, MIN_DISTINTOS } from '@/lib/secret-policy';
import { opcoesCookieSessao, MAX_AGE_SESSAO_S } from '@/lib/session-cookie';
import { signSession } from '@/lib/session-edge';

// TASK-076 (Sprint 22 · Etapa 7a do ADR-012) — segredo de sessão com entropia
// real e cookie `secure` incondicional em produção.
//
// ## Os dois defeitos
//
// 1. `session-edge.ts` exigia `jwtSecret.length < 32` — CONTAGEM DE CARACTERES,
//    não entropia. "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" passa. O segredo em uso
//    é um UUID com sufixo: comprimento suficiente, aleatoriedade muito menor do
//    que o comprimento sugere, e formato que qualquer atacante reconhece.
//
// 2. `secure` era `isHttps`, derivado do header `x-forwarded-proto`. Quem
//    controla o header controla o `secure` — um condicional que o cliente
//    influencia é pior que um valor fixo. A §2.3 passou a exigir `secure`
//    obrigatório em produção: "a hospedagem serve exclusivamente por HTTPS,
//    então o condicional 'quando servido via HTTPS' deixa de existir".

const RAIZ = process.cwd();

const SEGREDO_BOM = 'kQ7yZ2pR9vX4mB6nT1wL8sC3jH5gD0fA2eU7iO9kP4rY6tN8xM1zV3bQ5hJ7lS0d';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('TASK-076 — segredo fraco é recusado na partida (constitution §2.1)', () => {
    it('BDD 1: ausente ou vazio', () => {
        expect(validarJwtSecret(undefined).ok).toBe(false);
        expect(validarJwtSecret('').ok).toBe(false);
    });

    it('BDD 1: curto demais', () => {
        const r = validarJwtSecret('curto-demais-para-servir');
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.motivo).toMatch(new RegExp(String(MIN_CARACTERES)));
    });

    it('BDD 1: comprimento não é entropia — repetição passa no check antigo e tem de falhar aqui', () => {
        // Este é o caso que o `length < 32` deixava passar. 40 caracteres, um
        // único símbolo distinto.
        const r = validarJwtSecret('a'.repeat(40));
        expect(r.ok, 'segredo de um caractere só foi aceito').toBe(false);
        expect(r.ok === false && r.motivo).toMatch(/distint|divers|repet/i);
    });

    it('BDD 1: UUID (com ou sem sufixo) é recusado — é o formato do segredo atual', () => {
        const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
        expect(validarJwtSecret(uuid).ok, 'UUID puro aceito').toBe(false);
        expect(
            validarJwtSecret(uuid + '-unifafire-sistema-chaves').ok,
            'UUID com sufixo aceito: comprimento cresce, aleatoriedade não',
        ).toBe(false);
    });

    it('BDD 1: o placeholder do .env.example é recusado', () => {
        // Copiar o exemplo e subir é o caminho de menor esforço de quem faz o
        // deploy com pressa. Ele tem 63 caracteres e diversidade suficiente —
        // só uma recusa explícita o barra.
        const exemplo = fs.readFileSync(path.resolve(RAIZ, '.env.example'), 'utf-8');
        const m = /JWT_SECRET\s*=\s*"([^"]+)"/.exec(exemplo);
        expect(m, 'JWT_SECRET não documentado no .env.example').not.toBeNull();

        const r = validarJwtSecret(m![1]);
        expect(r.ok, 'o placeholder documentado seria aceito em produção').toBe(false);
    });

    it('BDD 1: um segredo com entropia real é aceito', () => {
        expect(validarJwtSecret(SEGREDO_BOM).ok).toBe(true);
        expect(SEGREDO_BOM.length).toBeGreaterThanOrEqual(MIN_CARACTERES);
        expect(new Set(SEGREDO_BOM).size).toBeGreaterThanOrEqual(MIN_DISTINTOS);
    });

    it('BDD 1: NÃO existe caminho que gere segredo em runtime', () => {
        // §2.1: "nunca gerado em runtime". Um fallback silencioso invalidaria
        // todas as sessões a cada cold start e, pior, faria o sistema parecer
        // funcionando enquanto a assinatura muda debaixo dos usuários.
        for (const arq of ['src/lib/secret-policy.ts', 'src/lib/session-edge.ts']) {
            const fonte = fs.readFileSync(path.resolve(RAIZ, arq), 'utf-8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^\s*\/\/.*$/gm, '');
            expect(fonte, `${arq} gera segredo`).not.toMatch(/randomBytes|randomUUID|Math\.random/);
        }
    });

    it('BDD 4: nenhum segredo utilizável no código ou no repositório', () => {
        const fonte = fs.readFileSync(path.resolve(RAIZ, 'src/lib/session-edge.ts'), 'utf-8');
        expect(fonte).not.toMatch(/JWT_SECRET\s*=\s*['"][^'"]{16,}/);

        // O .env real nunca é versionado (constitution §6.2).
        expect(
            fs.existsSync(path.resolve(RAIZ, '.env')) && !fs.existsSync(path.resolve(RAIZ, '.gitignore'))
                ? 'sem .gitignore'
                : 'ok',
        ).toBe('ok');
    });
});

describe('TASK-076 — o cookie de sessão não negocia `secure` com o cliente (§2.3)', () => {
    it('BDD 2: em produção, `secure` é verdadeiro independentemente do header', () => {
        vi.stubEnv('APP_ENV', 'production');
        // Nenhuma das chamadas recebe informação de protocolo: a opção deixou de
        // aceitar esse argumento, que é a forma de garantir que ninguém volte a
        // derivá-la de `x-forwarded-proto`.
        expect(opcoesCookieSessao('token').secure).toBe(true);
    });

    it('BDD 2: APP_ENV ausente ou desconhecido também é produção (§8, default seguro)', () => {
        vi.stubEnv('APP_ENV', '');
        expect(opcoesCookieSessao('token').secure).toBe(true);

        vi.stubEnv('APP_ENV', 'homologacao');
        expect(opcoesCookieSessao('token').secure, 'valor desconhecido relaxou o controle').toBe(true);
    });

    it('BDD 3: dev local continua funcionando sem HTTPS', () => {
        vi.stubEnv('APP_ENV', 'dev');
        expect(opcoesCookieSessao('token').secure).toBe(false);
    });

    it('BDD 2: httpOnly, sameSite e path valem em qualquer ambiente', () => {
        for (const env of ['dev', 'production']) {
            vi.stubEnv('APP_ENV', env);
            const o = opcoesCookieSessao('token');
            expect(o.httpOnly, `httpOnly caiu em ${env}`).toBe(true);
            expect(o.sameSite, `sameSite caiu em ${env}`).toBe('lax');
            expect(o.path).toBe('/');
            expect(o.name).toBe('session');
        }
    });

    it('BDD 5: o idle de 24 h não mudou', () => {
        expect(MAX_AGE_SESSAO_S).toBe(60 * 60 * 24);
        expect(opcoesCookieSessao('token').maxAge).toBe(60 * 60 * 24);
    });

    it('BDD 5: a expiração absoluta de 7 dias não mudou (§2.2)', async () => {
        const token = await signSession({ id: 1, username: 'x', role: 'ADMIN' });
        const { iat, exp } = decodeJwt(token);
        expect(exp! - iat!, 'a expiração absoluta saiu de 7 dias').toBe(7 * 24 * 60 * 60);
    });
});

describe('TASK-076 — a decisão vive num lugar só', () => {
    it('BDD 2: nenhum arquivo deriva `secure` de header', () => {
        const alvos: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const fonte = fs.readFileSync(p, 'utf-8')
                        .replace(/\/\*[\s\S]*?\*\//g, '')
                        .replace(/^\s*\/\/.*$/gm, '');
                    if (/x-forwarded-proto|secure:\s*isHttps/.test(fonte)) {
                        alvos.push(path.relative(RAIZ, p).split(path.sep).join('/'));
                    }
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(
            alvos,
            `\`secure\` ainda derivado de header — quem controla o header controla o cookie:\n${alvos.join('\n')}`,
        ).toEqual([]);
    });

    it('BDD 2: todo emissor de cookie de sessão usa o helper único', () => {
        const emissores: string[] = [];
        const semHelper: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const rel = path.relative(RAIZ, p).split(path.sep).join('/');
                    if (rel === 'src/lib/session-cookie.ts') continue;
                    const fonte = fs.readFileSync(p, 'utf-8')
                        .replace(/\/\*[\s\S]*?\*\//g, '')
                        .replace(/^\s*\/\/.*$/gm, '');
                    if (/set\(\s*\{?\s*['"]?name['"]?:\s*['"]session['"]|\.set\(\s*['"]session['"]/.test(fonte)) {
                        emissores.push(rel);
                        if (!/opcoesCookieSessao/.test(fonte)) semHelper.push(rel);
                    }
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));

        expect(emissores.length, 'nenhum emissor encontrado — o teste deixou de medir algo').toBeGreaterThan(0);
        expect(
            semHelper,
            `emissor de cookie de sessão fora do helper único:\n${semHelper.join('\n')}`,
        ).toEqual([]);
    });

    it('o .env.example não documenta mais a variável do SQLite', () => {
        // DB_PATH morreu com src/lib/db.ts na TASK-070. Documentar variável que
        // não faz nada custa uma tentativa de configuração de quem for subir.
        const exemplo = fs.readFileSync(path.resolve(RAIZ, '.env.example'), 'utf-8');
        expect(exemplo, 'DB_PATH ainda documentado').not.toMatch(/DB_PATH/);
        expect(exemplo, 'DATABASE_URL não documentado').toMatch(/DATABASE_URL/);
    });
});
