import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { query, queryOne, execute, getPool } from '@/lib/pg';
import { bootstrapAdmin, gerarSenha, CUSTO_BCRYPT } from '../db/bootstrap-admin.mjs';

// TASK-080 (Sprint 22 · Etapa 7a do ADR-012) — bootstrap do primeiro ADMIN.
//
// Numa base Supabase vazia NÃO EXISTE caminho para autenticar: `scripts/init-db.js`
// só fala SQLite e saiu do `postinstall` na TASK-071, nenhuma migration de
// `db/migrations-pg/` insere usuário, e toda rota exige sessão — `/api/users`
// exige papel ADMIN. O sistema subiria e ninguém entraria.
//
// O `admin`/`admin` do SQLite não serve de modelo: nasceu numa intranet fechada.
// Aqui a exposição é pública, e senha padrão previsível é uma conta ADMIN
// entregue a quem chegar primeiro.
//
// ## O que estes testes medem
//
// Não é "o usuário foi criado" — isso qualquer INSERT faz. É o conjunto de
// recusas: recusa em base povoada, recusa a senha previsível, recusa a deixar a
// senha em qualquer trilha. Um bootstrap que só sabe criar passa no caminho
// feliz e falha exatamente onde importa.

vi.mock('next/headers', () => ({
    cookies: () => ({
        get: vi.fn().mockReturnValue({ value: 'token-de-teste' }),
        set: vi.fn(),
    }),
    headers: () => Promise.resolve(new Headers()),
}));

const RAIZ = process.cwd();

/** Executor mínimo que o script aceita: qualquer coisa com `.query`. É o que
 *  mantém `db/` independente de `src/` — o script não importa o bundle da app. */
function executor() {
    return getPool();
}

async function baseVazia() {
    await execute(
        'TRUNCATE users, keys, key_transactions, history, action_logs, audit_logs, login_attempts, settings, rate_limit_hits RESTART IDENTITY CASCADE',
    );
}

function login(body: Record<string, unknown>) {
    return new Request('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
    }) as never;
}

/** Fonte do script, sem comentários — para asserções que não podem casar com prosa. */
function fonteSemComentarios(rel: string) {
    return fs.readFileSync(path.resolve(RAIZ, rel), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

beforeEach(async () => {
    await baseVazia();
});

describe('TASK-080 — cria o primeiro ADMIN numa base vazia', () => {
    it('BDD 1: cria exatamente um ADMIN, com troca de senha obrigatória', async () => {
        const r = await bootstrapAdmin(executor());

        const users = await query<{ username: string; role: string; active: boolean; requires_password_change: boolean }>(
            'SELECT username, role, active, requires_password_change FROM users',
        );
        expect(users, 'devia criar exatamente um usuário').toHaveLength(1);
        expect(users[0].role).toBe('ADMIN');
        expect(users[0].active).toBe(true);
        expect(
            users[0].requires_password_change,
            'sem isto a senha temporária vira permanente',
        ).toBe(true);
        expect(users[0].username).toBe(r.username);
    });

    it('BDD 1: o hash é bcrypt com custo >= 10 (constitution §1.1)', async () => {
        const r = await bootstrapAdmin(executor());

        const u = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users');
        const hash = u!.password_hash;

        // $2a$/$2b$ + custo em dois dígitos. Ler o custo do próprio hash é o que
        // prova o parâmetro usado — uma constante no código provaria só a intenção.
        const m = /^\$2[aby]\$(\d{2})\$/.exec(hash);
        expect(m, `hash não é bcrypt: ${hash.slice(0, 10)}`).not.toBeNull();
        expect(Number(m![1]), 'custo abaixo do mínimo constitucional').toBeGreaterThanOrEqual(10);
        expect(CUSTO_BCRYPT).toBeGreaterThanOrEqual(10);

        // E o hash tem de conferir com a senha devolvida — senão o operador
        // recebe uma senha que não entra.
        expect(await bcrypt.compare(r.senha, hash), 'a senha devolvida não abre o hash gravado').toBe(true);
    });

    it('BDD 5: a criação fica registrada em audit_logs', async () => {
        await bootstrapAdmin(executor());

        const trilha = await queryOne<{ action: string; details: string; actor_id: number }>(
            'SELECT action, details, actor_id FROM audit_logs ORDER BY id DESC LIMIT 1',
        );
        expect(trilha, 'nenhuma entrada de auditoria').toBeDefined();
        expect(trilha!.action).toMatch(/BOOTSTRAP/i);
        expect(trilha!.actor_id, 'a entrada tem de apontar para o usuário criado').toBeGreaterThan(0);
    });
});

describe('TASK-080 — recusa em base que já tem usuário', () => {
    it('BDD 2: recusa e não altera nada', async () => {
        await execute(
            "INSERT INTO users (username, password_hash, role) VALUES ('ja_existe', 'hash-qualquer', 'ALUNO')",
        );
        const antes = await query('SELECT id, username, password_hash, role FROM users ORDER BY id');

        await expect(
            bootstrapAdmin(executor()),
            'base povoada tem de ser recusada',
        ).rejects.toThrow();

        const depois = await query('SELECT id, username, password_hash, role FROM users ORDER BY id');
        expect(depois, 'a recusa alterou linhas existentes').toEqual(antes);
        expect(depois, 'a recusa criou usuário mesmo assim').toHaveLength(1);
    });

    it('BDD 2: a recusa é explícita sobre o motivo', async () => {
        await execute(
            "INSERT INTO users (username, password_hash, role) VALUES ('ja_existe', 'h', 'ADMIN')",
        );
        await expect(bootstrapAdmin(executor())).rejects.toThrow(/j[áa] (existe|tem)|n[ãa]o (est[áa] )?vazia|povoad/i);
    });

    it('BDD 2: a garantia vive no banco, não na disciplina de quem chama', () => {
        // O check-then-insert em dois passos é uma corrida: entre a contagem e o
        // INSERT, outra execução cabe. A recusa tem de ser da própria escrita —
        // uma condição no SQL —, não de um `if` no JavaScript.
        const fonte = fonteSemComentarios('db/bootstrap-admin.mjs');
        expect(
            fonte,
            'a exclusividade precisa estar no SQL (NOT EXISTS), não só em código',
        ).toMatch(/NOT\s+EXISTS/i);
    });
});

describe('TASK-080 — a senha inicial nunca é previsível', () => {
    it('BDD 3: gerarSenha não repete e tem entropia adequada', () => {
        const amostra = new Set(Array.from({ length: 50 }, () => gerarSenha()));
        expect(amostra.size, 'gerador repetiu valores em 50 chamadas').toBe(50);

        for (const s of amostra) {
            expect(s.length, `senha curta demais: ${s.length} caracteres`).toBeGreaterThanOrEqual(24);
        }
    });

    it('BDD 3: não há senha padrão embutida no código', () => {
        const fonte = fonteSemComentarios('db/bootstrap-admin.mjs');
        // O antecessor SQLite fazia exatamente isto: bcrypt.hashSync('admin', 10).
        expect(fonte, 'senha literal embutida — foi o erro do init-db.js').not.toMatch(
            /(senha|password|pass)\s*[=:]\s*['"][^'"]+['"]/i,
        );
        expect(fonte, "literal 'admin' como credencial").not.toMatch(/hash\w*\(\s*['"]admin['"]/i);
    });

    it('BDD 3: a senha usada é a devolvida ao operador, e ela é impressa uma vez só', async () => {
        const r = await bootstrapAdmin(executor());
        expect(typeof r.senha).toBe('string');
        expect(r.senha.length).toBeGreaterThanOrEqual(24);
    });
});

describe('TASK-080 — a senha não vaza para trilha nenhuma (constitution §6.1)', () => {
    it('BDD 4: nem a senha nem o hash aparecem em audit_logs ou action_logs', async () => {
        const r = await bootstrapAdmin(executor());
        const u = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users');

        const linhas = await query<{ texto: string }>(
            `SELECT coalesce(details, '') || ' ' || coalesce(action, '') AS texto FROM audit_logs
             UNION ALL
             SELECT coalesce(details, '') || ' ' || coalesce(action, '') || ' ' || coalesce(target, '') FROM action_logs`,
        );
        const tudo = linhas.map(l => l.texto).join('\n');

        expect(tudo, 'a senha em claro foi parar na trilha').not.toContain(r.senha);
        expect(tudo, 'o hash foi parar na trilha').not.toContain(u!.password_hash);
    });

    it('BDD 4: o script não escreve a senha em arquivo', () => {
        const fonte = fonteSemComentarios('db/bootstrap-admin.mjs');
        expect(fonte, 'gravar a senha em disco recria o problema que o .env resolve').not.toMatch(
            /writeFileSync|appendFileSync|createWriteStream/,
        );
    });
});

describe('TASK-080 — a primeira entrada força a troca de senha', () => {
    it('BDD 6: login sem newPassword devolve 403 REQUIRE_PASSWORD_CHANGE, e com ela entra', async () => {
        const r = await bootstrapAdmin(executor());
        const { POST } = await import('@/app/api/auth/login/route');

        const primeira = await POST(login({ username: r.username, password: r.senha }));
        expect(primeira.status, 'a troca obrigatória não foi exigida').toBe(403);
        expect((await primeira.json()).error).toBe('REQUIRE_PASSWORD_CHANGE');

        const segunda = await POST(login({
            username: r.username,
            password: r.senha,
            newPassword: 'senha-nova-do-admin',
        }));
        expect(segunda.status, 'a troca não completou').toBe(200);

        const u = await queryOne<{ requires_password_change: boolean }>(
            'SELECT requires_password_change FROM users WHERE username = $1', [r.username],
        );
        expect(u!.requires_password_change, 'a flag continuou ligada após a troca').toBe(false);
    });

    it('BDD 6: a senha temporária deixa de valer depois da troca', async () => {
        const r = await bootstrapAdmin(executor());
        const { POST } = await import('@/app/api/auth/login/route');

        await POST(login({ username: r.username, password: r.senha, newPassword: 'senha-nova-do-admin' }));
        await execute('DELETE FROM login_attempts');
        await execute('DELETE FROM rate_limit_hits');

        const comAntiga = await POST(login({ username: r.username, password: r.senha }));
        expect(comAntiga.status, 'a senha temporária ainda entra').toBe(401);
    });
});

describe('TASK-080 — o bootstrap não é alcançável pela aplicação', () => {
    it('BDD 7: nenhuma rota ou módulo de src/ importa o script', () => {
        const alvos: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const fonte = fs.readFileSync(p, 'utf-8').replace(/^\s*\/\/.*$/gm, '');
                    if (/bootstrap-admin/.test(fonte)) alvos.push(p);
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(
            alvos,
            `o bootstrap virou superfície HTTP:\n${alvos.join('\n')}`,
        ).toEqual([]);
    });

    it('BDD 7: o script vive em db/, fora do bundle', () => {
        expect(fs.existsSync(path.resolve(RAIZ, 'db/bootstrap-admin.mjs'))).toBe(true);
    });

    it('o antecessor SQLite não sobrevive ao lado — dois caminhos, um deles com senha padrão', () => {
        // `scripts/init-db.js` cria admin/admin se não houver usuário `admin`.
        // Mantê-lo é deixar de pé um segundo bootstrap, previsível, que o
        // postinstall já rodou automaticamente um dia.
        expect(
            fs.existsSync(path.resolve(RAIZ, 'scripts/init-db.js')),
            'init-db.js ainda existe: há dois caminhos de criação do primeiro usuário',
        ).toBe(false);
    });
});
