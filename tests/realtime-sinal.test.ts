import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { query, execute } from '@/lib/pg';

// TASK-072 (Sprint 25 · Etapa 5 do ADR-012) — o sinal substitui os quatro
// pollings. REQ-032, constitution §3.2.
//
// ## Por que o mecanismo óbvio está fora
//
// `postgres_changes` autoriza POR RLS. Este sistema tem RLS ligado e ZERO
// políticas — nega tudo a `anon` — e não usa Supabase Auth: as sessões são JWTs
// nossos, então para o Supabase todo usuário daqui é `anon`. O cliente receberia
// nada, e fazê-lo receber exigiria abrir as tabelas de chaves para a chave
// anônima, que vai no bundle do navegador.
//
// Seria trocar 3 s de defasagem por uma leitura pública das tabelas, ao largo do
// `proxy.ts` e da checagem de papel. A §3.2 não admite isso.
//
// ## O que estes cenários fixam
//
// Que o Realtime carrega SINAL e nunca DADO. Os dois primeiros describes existem
// para que ninguém "otimize" isso depois enfiando o payload na mensagem: seria a
// mesma exposição pela porta dos fundos, sem passar por RLS nenhuma.

const RAIZ = process.cwd();
const MIGRATIONS = path.resolve(RAIZ, 'db', 'migrations-pg');

function semComentarios(arquivo: string) {
    return fs.readFileSync(path.resolve(RAIZ, arquivo), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

function migrationDoSinal(): { up: string; down: string; nome: string } {
    const ups = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.up.sql'));
    const alvo = ups.find(f => fs.readFileSync(path.join(MIGRATIONS, f), 'utf-8').includes('realtime.send'));
    if (!alvo) return { up: '', down: '', nome: '' };
    const nome = alvo.replace(/\.up\.sql$/, '');
    const down = path.join(MIGRATIONS, `${nome}.down.sql`);
    return {
        nome,
        up: fs.readFileSync(path.join(MIGRATIONS, alvo), 'utf-8'),
        down: fs.existsSync(down) ? fs.readFileSync(down, 'utf-8') : '',
    };
}

describe('TASK-072 — o banco anuncia a mudança, e não o conteúdo dela', () => {
    it('BDD 1: existe migration do sinal, com DOWN pareado (§4.1)', () => {
        const m = migrationDoSinal();
        expect(m.nome, 'nenhuma migration chama realtime.send').not.toBe('');
        expect(m.down, `DOWN ausente para ${m.nome}`).not.toBe('');
        expect(m.down, 'o DOWN não derruba os triggers').toMatch(/DROP TRIGGER/i);
    });

    it('BDD 1: a carga da mensagem não carrega dado de negócio', () => {
        // O sinal existe para dizer "algo mudou". No minuto em que ele passar a
        // levar id, nome ou usuário, vira leitura pública das tabelas por outro
        // caminho — sem RLS, sem proxy, sem checagem de papel.
        const { up } = migrationDoSinal();
        const chamada = up.match(/realtime\.send\s*\([\s\S]*?\)/)?.[0] ?? '';
        expect(chamada, 'realtime.send não foi encontrada').not.toBe('');
        for (const vazamento of ['NEW', 'OLD', 'row_to_json', 'to_jsonb']) {
            expect(chamada, `a carga do sinal referencia "${vazamento}"`)
                .not.toMatch(new RegExp(`\\b${vazamento}\\b`));
        }
    });

    it('BDD 1: o sinal é melhor-esforço e nunca derruba a escrita', () => {
        // Um mecanismo de notificação que pode abortar a transação que notifica é
        // pior que não ter notificação: uma indisponibilidade do Realtime viraria
        // indisponibilidade de retirar chave.
        const { up } = migrationDoSinal();
        expect(up, 'sem EXCEPTION, uma falha do realtime derruba a operação de chave')
            .toMatch(/EXCEPTION\s+WHEN/i);
    });
});

describe('TASK-072 — toda escrita dispara, venha de onde vier', () => {
    beforeEach(async () => {
        await execute('DELETE FROM realtime_sinais_enviados');
    });

    it('BDD 2: escrita em `keys` emite exatamente um sinal', async () => {
        await execute("INSERT INTO keys (name, room, status) VALUES ('Sala Sinal', '101', 'available')");
        const sinais = await query<{ topic: string; event: string; payload: unknown }>(
            'SELECT topic, event, payload FROM realtime_sinais_enviados',
        );
        expect(sinais.length, 'a escrita não emitiu sinal').toBe(1);
        expect(sinais[0].topic).toBe('chaves');
        expect(JSON.stringify(sinais[0].payload), 'a carga levou conteúdo').toBe('{}');
    });

    it('BDD 2: escrita em `key_transactions` também emite', async () => {
        const [k] = await query<{ id: number }>(
            "INSERT INTO keys (name, room, status) VALUES ('Sala Tx', '102', 'available') RETURNING id",
        );
        await execute('DELETE FROM realtime_sinais_enviados');
        await execute(
            "INSERT INTO key_transactions (key_id, user_id, status) VALUES ($1, 1, 'pending')",
            [k.id],
        );
        const sinais = await query('SELECT 1 FROM realtime_sinais_enviados');
        expect(sinais.length, 'transação não emitiu sinal').toBeGreaterThan(0);
    });

    it('BDD 2: um sinal por INSTRUÇÃO, não por linha', async () => {
        // Cota do plano gratuito é por MENSAGEM. Uma devolução em lote de 30
        // chaves não pode virar 30 mensagens quando uma resolve.
        await execute(
            "INSERT INTO keys (name, room, status) VALUES ('L1','201','available'), ('L2','202','available'), ('L3','203','available')",
        );
        const sinais = await query('SELECT 1 FROM realtime_sinais_enviados');
        expect(sinais.length, 'emitiu um sinal por linha em vez de um por instrução').toBe(1);
    });
});

describe('TASK-072 — nenhuma tabela publicada, nenhuma política afrouxada', () => {
    it('BDD 3: `pg_policies` em public continua vazia', async () => {
        const politicas = await query('SELECT 1 FROM pg_policies WHERE schemaname = $1', ['public']);
        expect(politicas.length, 'alguém criou política RLS — o dado passou a sair sem passar pelo servidor')
            .toBe(0);
    });

    it('BDD 3: nenhuma migration desta sprint cria política para anon', () => {
        const { up } = migrationDoSinal();
        expect(up, 'a migration do sinal cria política').not.toMatch(/CREATE\s+POLICY/i);
        expect(up, 'a migration publica tabela no realtime').not.toMatch(/ALTER\s+PUBLICATION/i);
    });
});

describe('TASK-072 — o cliente refaz a busca pelas rotas autenticadas', () => {
    it('BDD 4: nenhum componente lê dado do Supabase direto', () => {
        const achados: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const rel = path.relative(RAIZ, p).split(path.sep).join('/');
                    const fonte = semComentarios(rel);
                    // A regra e sobre o CLIENTE Supabase, nao sobre a palavra
                    // `.from`: `Array.from(...)` e legitimo e aparece em tres
                    // telas. So interessa arquivo que fala com o Supabase — e
                    // nele, `.from()` (leitura de tabela) e `postgres_changes`
                    // sao as duas portas pelas quais o dado sairia direto para o
                    // navegador, sem passar pelo servidor.
                    const falaComSupabase = /@supabase\/supabase-js|createClient\s*\(/.test(fonte);
                    if (falaComSupabase && /\.from\s*\(|postgres_changes/.test(fonte)) achados.push(rel);
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(achados, `leem dado do Supabase sem passar pelo servidor:\n${achados.join('\n')}`).toEqual([]);
    });
});

describe('TASK-072 — os quatro pollings de 3 s deixam de existir', () => {
    const COMPONENTES = [
        'src/app/components/DashboardClient.tsx',
        'src/app/components/PendingInline.tsx',
        'src/app/components/Sidebar.tsx',
        'src/app/confirm/ConfirmClient.tsx',
    ];

    it('BDD 5: nenhum dos quatro tem mais intervalo de 3.000 ms', () => {
        const restantes = COMPONENTES.filter(c => /setInterval\([\s\S]{0,120}?,\s*3000\s*\)/.test(semComentarios(c)));
        expect(restantes, `ainda fazem polling de 3 s:\n${restantes.join('\n')}`).toEqual([]);
    });

    it('BDD 5: o relógio e o logout automático NÃO foram levados junto', () => {
        // Guarda contra a remoção passar do ponto: nenhum dos dois é polling de
        // dados, e os dois têm função própria.
        expect(semComentarios('src/lib/use-client-clock.ts'), 'o relógio do cliente sumiu')
            .toMatch(/setInterval/);
        expect(semComentarios('src/app/components/Sidebar.tsx'), 'o logout automático sumiu')
            .toMatch(/cruzouOHorario/);
    });
});
