import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-108 (CR Tipo D · ADR-022) — a §4.2 da constitution passa a exigir o teste de
// migração que o projeto de fato faz.
//
// ## O defeito
//
// A cláusula mandava testar "UP + DOWN contra uma CÓPIA do banco (`backups/`…)" e
// nunca aplicar "direto em `keys.db` de produção". O meio envelheceu no go-live — e o
// princípio não era cumprido: nenhum DOWN tinha rodado uma vez sequer, e o UP contra
// cópia de produção tinha acontecido uma vez. A lei afirmava um teste que não existia.
//
// ## Por que só agora
//
// Pela lição do ADR-021: a emenda EXIGE a ida e volta (TASK-106) e o ensaio sobre a
// cópia (TASK-107). Emendar antes de os dois existirem repetiria o defeito do texto
// antigo — afirmar uma verificação que ninguém executa.
//
// ## O que este teste guarda
//
// A PROPRIEDADE, como o da TASK-104: o que a cláusula afirma que é verificado tem de
// SER verificado — o teste que ela invoca existe e cobre todas as migrations, e a
// ferramenta que ela pressupõe existe. Se um dos dois sumir, a lei volta a mentir, e
// isto reprova.

const RAIZ = process.cwd();
const ler = (f: string) => fs.readFileSync(path.resolve(RAIZ, f), 'utf-8');
const constituicao = ler('.sdd/memory/constitution.md');

/** O item 2 da seção 4, até o item 3 — com a nota da emenda. */
function clausulaInteira() {
    const secao = constituicao.slice(constituicao.indexOf('## 4.'));
    return secao.slice(secao.search(/^2\.\s/m), secao.search(/^3\.\s/m));
}

/** A REGRA, sem a nota `*(Emenda ...)*`, que cita o texto antigo de propósito
 *  (lição da TASK-104: a guarda lia a nota como regra e reprovava a emenda certa). */
const regra = () => clausulaInteira().replace(/\*\(Emenda[\s\S]*?\)\*/g, '');

describe('TASK-108 — a §4.2 não descreve mais o meio que acabou', () => {
    it('BDD 1: nem `keys.db`, nem `backups/` como cópia do banco', () => {
        expect(regra(), 'a regra ainda manda usar o SQLite de desenvolvimento como se fosse produção')
            .not.toMatch(/keys\.db/);
        expect(regra(), 'a regra ainda aponta a pasta de cópias do SQLite').not.toMatch(/`backups\/`/);
    });
});

describe('TASK-108 — o que a §4.2 afirma é o que a suíte e o runner fazem', () => {
    it('BDD 2: exige a ida e volta — e o teste que a verifica existe e cobre TODAS', () => {
        expect(regra()).toMatch(/ida e volta/i);
        expect(regra()).toMatch(/UP\s*→\s*DOWN\s*→\s*UP/);
        expect(regra(), 'a regra não diz QUEM verifica').toMatch(/suíte/);

        // "Para todas" só é verdade se o teste percorre o diretório, e não uma lista
        // fixa — lista fixa esquece a migration de amanhã.
        const teste = ler('tests/ida-e-volta-migracoes.test.ts');
        expect(teste, 'o teste da ida e volta não percorre o diretório de migrations').toMatch(/listarMigracoes\(/);
    });

    it('BDD 2: exige o ensaio sobre a cópia quando toca dados — e a ferramenta e a guarda existem', () => {
        expect(regra()).toMatch(/toca dados/i);
        expect(regra()).toMatch(/cópia restaurada do backup/i);
        expect(regra(), 'a regra não diz onde fica o registro').toMatch(/\.ensaio\.md/);

        const runner = ler('db/runner-migracoes.mjs');
        expect(runner, 'a regra pressupõe um comando de ensaio que não existe').toMatch(/export async function ensaiar\(/);
        expect(fs.existsSync(path.resolve(RAIZ, 'tests/ensaio-de-migracao.test.ts')),
            'sem a guarda, "com o resultado registrado" vira pedido de boa vontade').toBe(true);
    });

    it('BDD 2: o princípio fica, e mais forte — produção nunca é o primeiro banco', () => {
        expect(regra()).toMatch(/Produção nunca é o primeiro banco a ver uma migration/);
        expect(regra()).toMatch(/base descartável/);
    });

    it('BDD 3: a emenda se identifica, como as da §3.2 e da §4.1', () => {
        expect(clausulaInteira()).toMatch(/Emenda de 2026-09-10, CR Tipo D, ADR-022/);
    });
});
