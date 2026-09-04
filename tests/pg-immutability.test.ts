import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { listMigrations } from '../db/migrate.mjs';

// TASK-065 (Sprint 20 · Etapa 3 do ADR-012) — imutabilidade do histórico
// (constitution §4.4 / REQ-005) e fechamento da superfície de escrita.
//
// No SQLite a imutabilidade são dois triggers com RAISE(ABORT) guardados por uma
// tabela-flag `_maintenance_mode`, criada e removida na mesma transação
// (src/lib/db-maintenance.ts). No Postgres o bypass vira set_config(..., true):
// escopo transacional por construção, o que elimina a janela em que a flag existe
// fora de uma transação e dispensa a tabela.
//
// A segunda metade da task é o mesmo assunto por outro ângulo — quem pode escrever.
// O Supabase expõe as tabelas de `public` pela API de dados com a chave anônima; a
// autorização deste sistema é sessão própria verificada server-side (constitution
// §3.2), e uma tabela alcançável por aquela chave passaria ao largo dela inteira.
//
// Como na TASK-063 (decisão D2), estes testes leem os arquivos de migration. O
// comportamento — UPDATE rejeitado, bypass transacional, ausência de leitura anônima
// — é exercido contra o Supabase via MCP e registrado no Report do Step 9.

const PG_DIR = path.resolve(process.cwd(), 'db', 'migrations-pg');

const TABELAS = [
    'users', 'keys', 'key_transactions', 'history',
    'action_logs', 'audit_logs', 'login_attempts', 'settings', 'rate_limit_hits',
];

function semComentarios(sql: string): string {
    return sql.replace(/--.*$/gm, '');
}

function migracao() {
    const m = listMigrations(PG_DIR).find(x => /imutabilidade/.test(x.name));
    if (!m) throw new Error('migration de imutabilidade Postgres não encontrada');
    return {
        up: fs.readFileSync(m.upPath, 'utf-8'),
        down: fs.readFileSync(m.downPath, 'utf-8'),
    };
}

describe('TASK-065 — imutabilidade do histórico em PL/pgSQL', () => {
    it('BDD 1/2: a função de guarda aborta UPDATE e DELETE citando REQ-005', () => {
        const up = semComentarios(migracao().up);

        expect(up, 'a guarda é uma função PL/pgSQL, não RAISE(ABORT) do SQLite')
            .toMatch(/LANGUAGE\s+plpgsql/i);
        expect(up, 'RAISE EXCEPTION ausente').toMatch(/RAISE\s+EXCEPTION/i);
        expect(up, 'a mensagem precisa citar REQ-005 para ser rastreável').toMatch(/REQ-005/);
        expect(up, 'a mensagem de DELETE precisa apontar o caminho autorizado').toMatch(/REQ-014/);
    });

    it('BDD 1/2: a função de guarda tem search_path fixo', () => {
        // Achado do get_advisors depois de aplicar a primeira versão: função sem
        // search_path declarado resolve nomes pela variável de sessão de quem a
        // dispara. Numa função que guarda a trilha de auditoria, isso é o próprio
        // controle dependendo de estado que o chamador controla. A rls_auto_enable
        // do Supabase, ao lado, já fixa o dela.
        expect(semComentarios(migracao().up)).toMatch(/SET\s+search_path\s*(?:=|TO)\s*'?pg_catalog'?/i);
    });

    it('BDD 1/2: existem triggers BEFORE UPDATE e BEFORE DELETE em history', () => {
        const up = semComentarios(migracao().up);
        expect(up).toMatch(/CREATE\s+TRIGGER\s+\w+\s+BEFORE\s+UPDATE\s+ON\s+(?:public\.)?history/i);
        expect(up).toMatch(/CREATE\s+TRIGGER\s+\w+\s+BEFORE\s+DELETE\s+ON\s+(?:public\.)?history/i);
    });

    it('BDD 3: o bypass é set_config transacional, não tabela-flag', () => {
        const up = semComentarios(migracao().up);

        expect(up, 'a guarda deve ler o ajuste de sessão').toMatch(/current_setting\(\s*'app\.maintenance_mode'/i);
        expect(up, "current_setting precisa do segundo argumento true — sem ele, ajuste ausente lança em vez de devolver NULL")
            .toMatch(/current_setting\(\s*'app\.maintenance_mode'\s*,\s*true\s*\)/i);
        expect(up, 'a tabela-flag do SQLite não deve reaparecer no Postgres')
            .not.toMatch(/_maintenance_mode/i);
    });

    it('BDD 3: nenhuma migration Postgres cria a tabela-flag do SQLite', () => {
        for (const m of listMigrations(PG_DIR)) {
            const sql = semComentarios(fs.readFileSync(m.upPath, 'utf-8'));
            expect(sql, `${m.name} recriou _maintenance_mode`).not.toMatch(/CREATE\s+TABLE\s+\S*_maintenance_mode/i);
        }
    });
});

describe('TASK-065 — superfície de escrita fechada', () => {
    it('BDD 4: UPDATE e DELETE em history revogados de PUBLIC, anon e authenticated', () => {
        const up = semComentarios(migracao().up);
        const revokes = [...up.matchAll(/REVOKE\s+([\s\S]*?)\s+ON\s+(?:TABLE\s+)?(?:public\.)?history\s+FROM\s+([^;]+);/gi)];

        expect(revokes.length, 'nenhum REVOKE sobre history').toBeGreaterThan(0);

        const verbos = revokes.map(m => m[1].toUpperCase()).join(' ');
        const papeis = revokes.map(m => m[2].toLowerCase()).join(' ');

        expect(verbos, 'UPDATE precisa ser revogado').toMatch(/UPDATE|ALL/);
        expect(verbos, 'DELETE precisa ser revogado').toMatch(/DELETE|ALL/);
        for (const papel of ['public', 'anon', 'authenticated']) {
            expect(papeis, `REVOKE não alcança ${papel}`).toMatch(new RegExp(`\\b${papel}\\b`));
        }
    });

    it('BDD 4: o UP registra que o papel de menor privilégio é da Etapa 7', () => {
        // REVOKE é defesa em profundidade enquanto a aplicação conecta com papel
        // amplo; o dono da tabela ignora REVOKE, e é o trigger que vale para todos.
        // Sem esta nota, o REVOKE parece uma garantia maior do que é.
        expect(migracao().up).toMatch(/TASK-077/);
    });

    it('BDD 5: RLS é habilitada explicitamente nas 9 tabelas', () => {
        // O projeto tem um event trigger do Supabase (ensure_rls) que liga RLS em
        // tabela nova. Depender dele é depender de configuração de projeto que pode
        // ser desligada sem tocar neste repositório — a migration declara por conta.
        const up = semComentarios(migracao().up);
        for (const tabela of TABELAS) {
            expect(up, `RLS não habilitada em ${tabela}`).toMatch(
                new RegExp(`ALTER\\s+TABLE\\s+(?:public\\.)?${tabela}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'),
            );
        }
    });

    it('BDD 5: nenhuma política de RLS é criada — o acesso anônimo não tem porta', () => {
        // RLS ligada sem política nega tudo para quem não é dono. É o estado certo:
        // a autorização deste sistema é a sessão da aplicação (§3.2), não o JWT do
        // Supabase. Criar política aqui abriria um segundo caminho de autorização.
        expect(semComentarios(migracao().up)).not.toMatch(/CREATE\s+POLICY/i);
    });

    it('BDD 5: os privilégios de anon e authenticated são revogados no schema', () => {
        const up = semComentarios(migracao().up);
        expect(up).toMatch(/REVOKE\s+ALL[\s\S]{0,80}ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM[^;]*anon/i);
        expect(up).toMatch(/REVOKE\s+ALL[\s\S]{0,80}ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM[^;]*authenticated/i);
    });

    it('BDD 5: rls_auto_enable deixa de ser chamável como RPC anônimo', () => {
        // Achado do get_advisors, não criado por nós: a função do event trigger do
        // Supabase é SECURITY DEFINER e está exposta em /rest/v1/rpc/. Revogar
        // EXECUTE não afeta o event trigger, que não passa por esse privilégio.
        const up = semComentarios(migracao().up);
        expect(up).toMatch(/REVOKE\s+(?:ALL|EXECUTE)[\s\S]{0,60}rls_auto_enable[\s\S]{0,80}FROM/i);
    });
});

describe('TASK-065 — DOWN pareado', () => {
    it('BDD 6: o DOWN remove triggers e função, e não derruba tabela', () => {
        const down = semComentarios(migracao().down);
        expect(down).toMatch(/DROP\s+TRIGGER/i);
        expect(down).toMatch(/DROP\s+FUNCTION/i);
        expect(down, 'DOWN de imutabilidade não mexe em tabela').not.toMatch(/DROP\s+TABLE/i);
    });

    it('BDD 6: o DOWN devolve os privilégios que o UP revogou', () => {
        const down = semComentarios(migracao().down);
        expect(down, 'sem GRANT de volta, o DOWN não restaura o estado exato (§4.1)')
            .toMatch(/GRANT\s+/i);
    });
});
