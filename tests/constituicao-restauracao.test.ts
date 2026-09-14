import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-116 (CR Tipo D · ADR-024, decisão 5) — a §3.5 e a §4.4 da constitution passam a
// dizer o que a restauração de backup é.
//
// ## O defeito
//
// A §3.5 citava "restore de backup" entre os endpoints destrutivos — sem rota, sem fluxo.
// Até a TASK-115 não havia restauração nenhuma pela aplicação (a TASK-082 tinha removido
// a rota morta), e a cláusula nomeava algo que não existia. E a §4.4 declara o histórico
// imutável sem mencionar que agora existe UMA forma de devolvê-lo ao passado inteiro.
//
// ## Por que só agora
//
// Lição do ADR-021: emenda por último, depois de a coisa existir. A restauração está no
// ar desde a TASK-115 (#75, 2026-09-13) — rota, workflow, motor e tela. A primeira
// execução REAL em produção espera o token da TASK-114; a nota da emenda diz isso.
//
// ## O que esta guarda cobra
//
// A PROPRIEDADE, no molde das TASK-104 e 108: o que a cláusula afirma tem de ser o que o
// sistema faz. Cada rota e cada arquivo que ela cita existem; o fluxo que ela descreve é
// o do workflow; e a §4.4 continua proibindo edição e exclusão de transação individual.

const RAIZ = process.cwd();
const ler = (f: string) => fs.readFileSync(path.resolve(RAIZ, f), 'utf-8').replace(/\r\n/g, '\n');
const constituicao = () => ler('.sdd/memory/constitution.md');

/** O item `n` da seção `s`, até o próximo item — com a nota da emenda. */
function item(s: number, n: number) {
    const texto = constituicao();
    const secao = texto.slice(texto.indexOf(`## ${s}.`), texto.indexOf(`## ${s + 1}.`));
    const inicio = secao.search(new RegExp(`^${n}\\.\\s`, 'm'));
    const fim = secao.slice(inicio + 1).search(/^\d+\.\s/m);
    return fim === -1 ? secao.slice(inicio) : secao.slice(inicio, inicio + 1 + fim);
}

/** A REGRA, sem a nota `*(Emenda ...)*`, que cita o texto antigo de propósito (TASK-104). */
const regra = (s: number, n: number) => item(s, n).replace(/\*\(Emenda[\s\S]*?\)\*/g, '');

describe('TASK-116 — a §3.5 nomeia a restauração que existe', () => {
    it('BDD 1: cita a rota da restauração, e não um "restore de backup" sem endereço', () => {
        expect(regra(3, 5)).toMatch(/`\/api\/backups\/restaurar`/);
        expect(regra(3, 5), 'ainda nomeia um restore genérico').not.toMatch(/restore de backup/);
    });

    it('BDD 1: toda rota que a cláusula cita existe', () => {
        const rotas = [...regra(3, 5).matchAll(/`\/api\/([a-z/-]+)`/g)].map(m => m[1]);
        expect(rotas.length, 'a cláusula não cita rota nenhuma').toBeGreaterThanOrEqual(3);
        for (const r of rotas) {
            expect(fs.existsSync(path.resolve(RAIZ, `src/app/api/${r}/route.ts`)), `/api/${r} citada e inexistente`).toBe(true);
        }
    });

    it('BDD 2: descreve o fluxo que o workflow executa — e os arquivos citados existem', () => {
        const r = regra(3, 5);
        expect(r).toMatch(/`\.github\/workflows\/restaurar\.yml`/);
        for (const f of [...r.matchAll(/`((?:\.github|db|src)\/[^`]+\.(?:yml|mjs|ts))`/g)].map(m => m[1])) {
            expect(fs.existsSync(path.resolve(RAIZ, f)), `${f} citado e inexistente`).toBe(true);
        }
        expect(r, 'não diz que só se restaura backup verificado, da lista').toMatch(/verificado/);
        expect(r, 'não proíbe arquivo enviado (ADR-024, decisão 4)').toMatch(/nunca arquivo enviado|sem upload/i);
        expect(r, 'não exige o backup de segurança antes').toMatch(/backup de segurança/);
        expect(r, 'não diz que só as tabelas de negócio voltam').toMatch(/tabelas de negócio/);
        expect(r, 'não diz que é uma transação').toMatch(/transação/);
        expect(r, 'não diz que a trilha não volta no tempo').toMatch(/trilha de auditoria não volta/i);
        expect(r, 'não diz a confirmação forte').toMatch(/RESTAURAR/);
    });

    it('BDD 2: o que a cláusula descreve é o que o código faz', () => {
        // A cláusula não pode sobreviver ao fluxo: se o backup de segurança sair do
        // workflow, ou a trilha entrar na lista do que volta, isto reprova.
        const yml = ler('.github/workflows/restaurar.yml');
        expect(yml.indexOf('enviar-backup.mjs'), 'o workflow restaura sem backup de segurança antes')
            .toBeLessThan(yml.indexOf('restaurar-backup.mjs restaurar'));
        const motor = ler('db/restaurar-backup.mjs');
        const negocio = motor.match(/TABELAS_DE_NEGOCIO = \[([^\]]*)\]/)?.[1] ?? '';
        expect(negocio, 'a trilha passou a voltar no tempo').not.toMatch(/action_logs|audit_logs|app_logs/);
    });
});

describe('TASK-116 — a §4.4 conhece a única reversão em massa', () => {
    it('BDD 3: continua proibindo edição e exclusão de transação individual', () => {
        expect(regra(4, 4)).toMatch(/imutável/);
        expect(regra(4, 4), 'a emenda afrouxou a proibição').toMatch(/nenhuma feature nova pode permitir edição\/exclusão de transação individual/);
    });

    it('BDD 3: nomeia a restauração como a ÚNICA reversão — inteira, nunca linha a linha — e remete à §3.5', () => {
        const r = regra(4, 4);
        expect(r).toMatch(/restauração/i);
        expect(r).toMatch(/única/);
        expect(r).toMatch(/linha a linha/);
        expect(r).toMatch(/§3\.5/);
    });
});

describe('TASK-116 — a emenda diz de onde veio, e o que ainda falta', () => {
    it('BDD 4: as duas cláusulas carregam a nota com o ADR-024 e a data', () => {
        for (const [s, n] of [[3, 5], [4, 4]] as const) {
            expect(item(s, n), `§${s}.${n} sem nota de emenda`).toMatch(/\*\(Emenda de 2026-09-1\d[^)]*ADR-024/);
        }
    });

    it('BDD 4: a nota da §3.5 registra que a primeira execução real está pendente', () => {
        // Emenda que descreve um fluxo nunca executado em produção sem dizer isso seria a
        // mentira que as TASK-104 e 108 vieram corrigir.
        expect(item(3, 5)).toMatch(/primeira execução real/i);
    });
});
