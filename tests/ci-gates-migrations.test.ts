import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// TASK-059 (Sprint 19) — o Gate 2 precisa REPROVAR de fato.
//
// `scripts/ci-gates.sh` procurava UPs em `supabase/migrations/*.sql` e
// `migrations/*.sql`. As migrações reais deste projeto vivem em `db/migrations/`,
// e nenhum daqueles dois diretórios existe — então o gate imprimia "Nenhuma
// migration encontrada — pulando" e passava sempre. Nunca reprovou nada desde
// que foi escrito. A regra (constitution §4.1) estava coberta apenas por
// tests/migrations.test.ts, não pelo gate que deveria barrá-la no push.
//
// Um gate que não pode falhar não é um gate.

const SCRIPT = path.resolve(process.cwd(), 'scripts/check-migrations.mjs');
let tmp: string;

function rodar(dir: string): { ok: boolean; saida: string } {
    try {
        const out = execFileSync('node', [SCRIPT, dir], { encoding: 'utf-8' });
        return { ok: true, saida: out };
    } catch (e) {
        const err = e as { stdout?: string; stderr?: string };
        return { ok: false, saida: `${err.stdout || ''}${err.stderr || ''}` };
    }
}

beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate2-')); });
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

function fixture(nome: string, arquivos: string[]): string {
    const dir = path.join(tmp, nome);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of arquivos) fs.writeFileSync(path.join(dir, f), '-- noop');
    return dir;
}

describe('TASK-059 — Gate 2 de migrations reprova UP sem DOWN', () => {
    it('aprova quando todo UP tem DOWN pareado', () => {
        const dir = fixture('pareado', ['202601010000_a.up.sql', '202601010000_a.down.sql']);
        expect(rodar(dir).ok, 'par completo deveria passar').toBe(true);
    });

    it('REPROVA quando falta o DOWN — o caso que o gate deixava passar', () => {
        const dir = fixture('sem-down', ['202601010000_a.up.sql']);
        const r = rodar(dir);

        expect(r.ok, 'UP sem DOWN tem de reprovar').toBe(false);
        expect(r.saida).toMatch(/202601010000_a/);
    });

    it('REPROVA um par incompleto no meio de vários corretos', () => {
        const dir = fixture('misto', [
            '202601010000_a.up.sql', '202601010000_a.down.sql',
            '202601020000_b.up.sql', '202601020000_b.down.sql',
            '202601030000_c.up.sql', // sem down
        ]);
        const r = rodar(dir);

        expect(r.ok).toBe(false);
        expect(r.saida).toMatch(/202601030000_c/);
    });

    it('REPROVA diretório inexistente em vez de pular calado', () => {
        // A falha original: apontar para diretório que não existe passava batido.
        const r = rodar(path.join(tmp, 'nao-existe'));

        expect(r.ok, 'diretório ausente não pode ser tratado como "nada a verificar"').toBe(false);
    });

    it('aprova as migrations reais do projeto', () => {
        const r = rodar(path.resolve(process.cwd(), 'db/migrations'));
        expect(r.ok, `db/migrations deveria estar íntegro:\n${r.saida}`).toBe(true);
    });
});

describe('TASK-059 — ci-gates.sh aponta para o diretório real', () => {
    it('o Gate 2 não procura mais em caminho inexistente', () => {
        const sh = fs.readFileSync(path.resolve(process.cwd(), 'scripts/ci-gates.sh'), 'utf-8');
        const gate2 = sh.slice(sh.indexOf('Gate 2'), sh.indexOf('Gate 3'));

        expect(gate2, 'Gate 2 deve invocar o verificador').toMatch(/check-migrations\.mjs/);
        expect(gate2, 'não pode mais varrer supabase/migrations inexistente')
            .not.toMatch(/supabase\/migrations\/\*\.sql/);
    });
});
