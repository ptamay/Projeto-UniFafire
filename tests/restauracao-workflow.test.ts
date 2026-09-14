import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-115 (CR Tipo D · ADR-024, decisão 4) — ciclo 3: o workflow de restauração.
//
// YAML não tem teste de comportamento; o comportamento está em `db/restaurar-backup.mjs`,
// testado contra bancos de verdade. O que se guarda aqui é a ORQUESTRAÇÃO — a lição do
// go-live (o backup passou em 25 testes e falhou nas três primeiras execuções reais) — e
// ela só fica provada rodando. Por isso existe o `ensaio`: faz o caminho inteiro em
// produção e desfaz no fim.
//
// ## O que estas guardas cobram
//
// - só dispara à mão (é o que a tela faz), nunca por agenda ou push;
// - nunca ao mesmo tempo que um backup: mesmo grupo de concorrência;
// - a ordem: validar → baixar o escolhido → backup de SEGURANÇA verificado e guardado →
//   restaurar o escolhido numa base descartável → trocar em produção;
// - o pedido (`inputs`) nunca é colado dentro de um `run:` — injeção de script. Vai por
//   `env:`, e o caminho é validado pelo padrão exato antes de qualquer uso (§1.5);
// - as mesmas invariantes do backup.yml: `--schema=public`, base descartável esvaziada,
//   `ON_ERROR_STOP=1`, nenhum artefato neste repositório público.

const RAIZ = process.cwd();
const ARQUIVO = path.resolve(RAIZ, '.github/workflows/restaurar.yml');
const existe = fs.existsSync(ARQUIVO);
const bruto = existe ? fs.readFileSync(ARQUIVO, 'utf-8').replace(/\r\n/g, '\n') : '';
/** Sem comentários: o cabeçalho EXPLICA o que o workflow faz, e uma guarda que achasse a
 *  palavra no comentário passaria cega (TASK-110). */
const YML = bruto.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
/** Os passos, em ordem, cada um como texto. */
const passos = () => YML.split(/\n\s{6}- (?=name:|uses:|run:)/).slice(1);
const indice = (re: RegExp) => passos().findIndex(p => re.test(p));

describe('TASK-115 — o workflow de restauração existe e só roda à mão', () => {
    it('BDD 9: existe, dispara só por workflow_dispatch, com arquivo, quem pediu e ensaio', () => {
        expect(existe, '.github/workflows/restaurar.yml não existe').toBe(true);
        const on = YML.match(/^on:\s*\n((?:[ \t]+.*\n?)+)/m)?.[1] ?? '';
        expect(on).toMatch(/workflow_dispatch:/);
        expect(on, 'restauração por agenda ou push').not.toMatch(/schedule:|push:|pull_request:/);
        for (const input of ['arquivo', 'pedido_por', 'ensaio']) expect(on, input).toMatch(new RegExp(`\\n\\s+${input}:`));
        expect(on).toMatch(/ensaio:[\s\S]*?type:\s*boolean/);
    });

    it('BDD 9: nunca ao mesmo tempo que um backup — o mesmo grupo de concorrência, sem cancelar', () => {
        const grupo = (y: string) => y.match(/^concurrency:\s*\n\s+group:\s*(\S+)/m)?.[1];
        const backup = fs.readFileSync(path.resolve(RAIZ, '.github/workflows/backup.yml'), 'utf-8').replace(/\r\n/g, '\n');
        expect(grupo(YML)).toBeTruthy();
        expect(grupo(YML)).toBe(grupo(backup));
        expect(YML).toMatch(/cancel-in-progress:\s*false/);
    });

    it('BDD 9: o token padrão só lê (TASK-110)', () => {
        expect(YML).toMatch(/^permissions:\s*\n\s+contents:\s*read\s*$/m);
    });
});

describe('TASK-115 — o pedido nunca vira comando', () => {
    it('BDD 10: nenhum `run:` interpola inputs — eles entram por env', () => {
        // `${{ inputs.arquivo }}` dentro de um `run:` é colado no script ANTES de o shell
        // rodar: um "arquivo" com `$(...)` executaria o que viesse. Por env, é só texto.
        const runs = YML.match(/run:\s*(\|[\s\S]*?(?=\n\s{6}- |\n\s{0,4}\S|$)|.*)/g) ?? [];
        expect(runs.length).toBeGreaterThan(0);
        for (const r of runs) {
            expect(r, 'input interpolado dentro de um run').not.toMatch(/\$\{\{\s*(inputs|github\.event\.inputs)\./);
        }
        expect(YML, 'os inputs não chegam por env').toMatch(/:\s*\$\{\{\s*inputs\.arquivo\s*\}\}/);
    });
});

describe('TASK-115 — a ordem: nada é trocado sem backup de segurança verificado', () => {
    it('BDD 11: validar → baixar → segurança (gerar, verificar, enviar, registrar) → descartável → produção', () => {
        const ordem = [
            indice(/restaurar-backup\.mjs validar/),
            indice(/test -f/),
            indice(/pg_dump/),
            indice(/verify-dump-cli/),
            indice(/enviar-backup\.mjs/),
            indice(/backup-run\.mjs --ok/),
            indice(/gunzip -c "\$ARQUIVO_ALVO"/),
            indice(/restaurar-backup\.mjs restaurar/),
        ];
        expect(ordem.every(i => i >= 0), `passo faltando: ${JSON.stringify(ordem)}`).toBe(true);
        expect([...ordem].sort((a, b) => a - b), `fora de ordem: ${JSON.stringify(ordem)}`).toEqual(ordem);
    });

    it('BDD 11: nenhum passo até a troca em produção é pulável', () => {
        const ate = indice(/restaurar-backup\.mjs restaurar/);
        expect(ate, 'sem o passo da troca, esta guarda passaria em branco').toBeGreaterThanOrEqual(0);
        for (const p of passos().slice(0, ate + 1)) {
            expect(p, 'continue-on-error deixaria restaurar sem segurança').not.toMatch(/continue-on-error/);
            expect(p, 'if: always() deixaria restaurar sem segurança').not.toMatch(/if:\s*always\(\)/);
        }
    });

    it('BDD 11: uma falha fica na trilha — mas recusa não vira "falha" em dobro', () => {
        const falhou = passos().find(p => /restaurar-backup\.mjs falhou/.test(p)) ?? '';
        expect(falhou, 'nenhum passo registra a falha').toBeTruthy();
        expect(falhou).toMatch(/if:\s*failure\(\)/);
        expect(falhou, 'a recusa (já registrada) viraria também RESTAURACAO_FALHOU').toMatch(/recusada\s*!=\s*'true'/);
    });

    it('BDD 11: o ensaio chega ao motor como --ensaio, só quando pedido', () => {
        expect(YML).toMatch(/--ensaio/);
        expect(YML).toMatch(/"\$ENSAIO"\s*=\s*"true"/);
    });
});

describe('TASK-115 — as invariantes do backup.yml valem aqui', () => {
    it('BDD 12: --schema=public, base descartável esvaziada, ON_ERROR_STOP=1', () => {
        expect(YML).toMatch(/--schema=public/);
        expect(YML).toMatch(/DROP SCHEMA IF EXISTS public CASCADE/);
        const restauracoes = YML.match(/psql "\$VERIFICACAO_URL"[^\n]*/g) ?? [];
        expect(restauracoes.length).toBeGreaterThan(0);
        for (const r of restauracoes) expect(r).toMatch(/ON_ERROR_STOP=1/);
    });

    it('BDD 12: nada vira artefato deste repositório público, e nenhum segredo é literal', () => {
        expect(YML).not.toMatch(/upload-artifact/);
        expect(YML).not.toMatch(/postgresql:\/\/[^$\s]*:[^$\s]*@(?!\$\{VERIFICACAO_HOST\})/);
        expect(YML).toMatch(/secrets\.PROD_DATABASE_URL/);
    });
});
