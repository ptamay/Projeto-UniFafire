// TASK-080 (Sprint 22 · Etapa 7a do ADR-012) — bootstrap do primeiro ADMIN.
//
// Numa base Postgres vazia não existe caminho para autenticar: toda rota exige
// sessão e `/api/users` exige papel ADMIN. Sem este script o sistema sobe e
// ninguém entra.
//
// ## Por que script, e não rota
//
// Uma rota de bootstrap seria superfície de ataque PERMANENTE para um uso
// ÚNICO: mesmo protegida por token, ela existe em toda requisição, para sempre,
// e a proteção vira mais uma coisa que pode ser implementada errado. Este
// arquivo vive em `db/`, junto de `migrate.mjs` e `load-pg.mjs`, fora do bundle
// da aplicação — não é alcançável pela internet.
//
// ## Por que não copiar o `scripts/init-db.js`
//
// O antecessor SQLite criava `admin`/`admin` quando não achava usuário `admin`.
// Aquilo nasceu numa intranet fechada. Aqui a exposição é pública, e senha
// padrão previsível é uma conta ADMIN entregue a quem chegar primeiro. Este
// script não tem senha embutida: gera uma aleatória e a imprime uma vez.
//
// ## A exclusividade vive no SQL
//
// Contar linhas e depois inserir é uma corrida — entre a contagem e o INSERT
// cabe outra execução. Por isso a condição está na própria escrita
// (`WHERE NOT EXISTS`): o banco recusa, não o JavaScript. É a mesma lição da
// TASK-070, em que o bypass da imutabilidade deixou de depender de quem chamava
// remover a flag e passou a ser descartado pelo próprio Postgres.
//
// Uso:
//   node db/bootstrap-admin.mjs                  usuário `admin`, senha gerada
//   node db/bootstrap-admin.mjs <username>       outro nome de usuário
//   BOOTSTRAP_ADMIN_PASSWORD=... node db/...     senha escolhida pelo operador
// Requer DATABASE_URL no ambiente.

import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';

/** Constitution §1.1: senhas exclusivamente com bcrypt, custo ≥ 10. */
export const CUSTO_BCRYPT = 10;

export const USERNAME_PADRAO = 'admin';

/** Erro de recusa — separado para que quem chama distinga "não fiz porque não
 *  devia" de "quebrou". O código de saída do CLI depende dessa diferença. */
export class BootstrapRecusado extends Error {
    constructor(message) {
        super(message);
        this.name = 'BootstrapRecusado';
    }
}

/**
 * Senha temporária aleatória. 24 bytes = 192 bits de entropia, muito acima do
 * necessário — o custo de exagerar aqui é zero, já que ela é digitada uma vez e
 * trocada em seguida. `base64url` para não gerar caractere que atrapalhe a
 * cópia do terminal.
 */
export function gerarSenha() {
    return randomBytes(24).toString('base64url');
}

/**
 * Cria o usuário ADMIN inicial. Recusa se `users` já tiver qualquer linha.
 *
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[], rowCount: number | null }> }} executor
 *        Qualquer coisa com `.query` — Pool, Client ou o pool de `src/lib/pg`.
 *        Receber o executor em vez de criar um é o que mantém `db/` sem
 *        dependência de `src/`, e o que permite testar contra o container.
 * @param {{ username?: string, senha?: string }} [opts]
 * @returns {Promise<{ id: number, username: string, senha: string }>}
 */
export async function bootstrapAdmin(executor, opts = {}) {
    const username = opts.username ?? USERNAME_PADRAO;
    const senha = opts.senha ?? gerarSenha();

    const hash = await bcrypt.hash(senha, CUSTO_BCRYPT);

    // A condição de exclusividade é do banco. Se qualquer linha existir em
    // `users`, o SELECT não produz tupla e o INSERT não escreve nada — sem
    // janela entre verificar e agir.
    const criado = await executor.query(
        `INSERT INTO users (username, password_hash, role, active, requires_password_change)
         SELECT $1, $2, 'ADMIN', true, true
          WHERE NOT EXISTS (SELECT 1 FROM users)
         RETURNING id`,
        [username, hash],
    );

    if (criado.rows.length === 0) {
        throw new BootstrapRecusado(
            'A tabela `users` já tem usuário — a base não está vazia. ' +
            'O bootstrap cria APENAS o primeiro acesso; para criar outros usuários, ' +
            'entre no sistema com um ADMIN e use /users.',
        );
    }

    const id = criado.rows[0].id;

    // Trilha: o que aconteceu, quem virou ADMIN e por qual caminho. Sem a senha
    // e sem o hash (constitution §6.1) — o `details` é lido por gente com acesso
    // ao log, que não é a mesma coisa que ter a credencial.
    await executor.query(
        `INSERT INTO audit_logs (actor_id, target_user_id, action, details)
         VALUES ($1, $1, 'BOOTSTRAP_ADMIN', $2)`,
        [id, `Usuário ADMIN inicial "${username}" criado pelo bootstrap (TASK-080). ` +
             'Senha temporária: troca obrigatória no primeiro acesso.'],
    );

    return { id, username, senha };
}

// --- Execução direta ---------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { default: pg } = await import('pg');

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL ausente no ambiente.');
        process.exit(2);
    }

    const pool = new pg.Pool({
        connectionString,
        ssl: connectionString.includes('supabase.') ? { rejectUnauthorized: false } : undefined,
    });

    try {
        const r = await bootstrapAdmin(pool, {
            username: process.argv[2] || undefined,
            senha: process.env.BOOTSTRAP_ADMIN_PASSWORD || undefined,
        });

        // Única saída da senha em todo o sistema. Não vai para arquivo nem para
        // trilha: quem roda o script tem de copiá-la agora.
        console.log('');
        console.log('  Usuário ADMIN inicial criado.');
        console.log('');
        console.log(`    usuário : ${r.username}`);
        console.log(`    senha   : ${r.senha}`);
        console.log('');
        console.log('  Esta senha NÃO será exibida de novo e não fica gravada em lugar nenhum.');
        console.log('  O primeiro login exige trocá-la.');
        console.log('');
    } catch (e) {
        if (e instanceof BootstrapRecusado) {
            console.error(`Recusado: ${e.message}`);
            process.exit(1);
        }
        throw e;
    } finally {
        await pool.end();
    }
}
