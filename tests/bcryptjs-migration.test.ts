import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

// TASK-071 (Sprint 21 · Etapa 4 do ADR-012) — `bcrypt` → `bcryptjs`.
//
// `bcrypt` é addon nativo: precisa compilar contra o Node do ambiente. Em build
// serverless isso é fonte de falha por ABI incompatível ou binário ausente para a
// plataforma alvo. `bcryptjs` é implementação pura em JS.
//
// O que esta task NÃO pode quebrar: os hashes já gravados no banco. As duas
// implementações produzem e leem o MESMO formato — o teste abaixo prova isso com
// um hash gerado pela implementação NATIVA antes da troca, não por uma das duas
// contra si mesma. Se este teste passar, ninguém troca de senha por causa da
// migração.

// Gerado por `bcrypt` (addon nativo) em 2026-09-03, antes da substituição.
// É fixture de teste, não credencial de nenhum ambiente.
const SENHA_ORIGINAL = 'senha-de-fixture-task-071';
const HASH_NATIVO = '$2b$10$xzNTtnOWB417IPYGpLo8/OMFCK.uvFe8y9l7Ef3pnE6HMYsGoTEba';

const pkg = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8'),
) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

describe('TASK-071 — compatibilidade com os hashes já gravados', () => {
    it('BDD 1: hash gerado pelo bcrypt nativo continua validando com bcryptjs', async () => {
        await expect(bcrypt.compare(SENHA_ORIGINAL, HASH_NATIVO)).resolves.toBe(true);
    });

    it('BDD 1: senha errada contra o mesmo hash continua sendo recusada', async () => {
        await expect(bcrypt.compare('senha-errada', HASH_NATIVO)).resolves.toBe(false);
    });

    it('BDD 1: o hash novo tem o mesmo prefixo de formato do antigo', async () => {
        const novo = await bcrypt.hash(SENHA_ORIGINAL, 10);
        expect(novo.slice(0, 4)).toBe(HASH_NATIVO.slice(0, 4));
        await expect(bcrypt.compare(SENHA_ORIGINAL, novo)).resolves.toBe(true);
    });
});

describe('TASK-071 — custo e árvore de dependências', () => {
    it('BDD 2: o custo gravado no hash é ≥ 10 (constitution §1.1)', async () => {
        const novo = await bcrypt.hash('outra-senha-qualquer', 10);
        const custo = Number(novo.split('$')[2]);
        expect(custo).toBeGreaterThanOrEqual(10);
    });

    it('BDD 3: nenhum addon nativo de hash sobra em dependencies', () => {
        expect(pkg.dependencies, 'bcrypt nativo ainda em dependencies').not.toHaveProperty('bcrypt');
        expect(pkg.dependencies).toHaveProperty('bcryptjs');
    });

    it('BDD 3: @types/bcrypt sai junto', () => {
        expect(pkg.devDependencies ?? {}).not.toHaveProperty('@types/bcrypt');
    });

    it('BDD 3: nenhum arquivo de src/ importa mais o bcrypt nativo', () => {
        const alvos: string[] = [];
        const varrer = (dir: string) => {
            for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, entrada.name);
                if (entrada.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(entrada.name)) {
                    const conteudo = fs.readFileSync(p, 'utf-8');
                    // `from 'bcrypt'` exato — `from 'bcryptjs'` não pode casar.
                    if (/from\s+['"]bcrypt['"]/.test(conteudo)) alvos.push(p);
                }
            }
        };
        varrer(path.resolve(process.cwd(), 'src'));
        expect(alvos, `ainda importam o addon nativo:\n${alvos.join('\n')}`).toEqual([]);
    });
});
