import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-104 (CR Tipo D · ADR-021) — a §4.1 da constitution passa a descrever o
// projeto que existe.
//
// ## O defeito
//
// A cláusula mandava UP em `db/migrations/NNNN_up_*.sql` e DOWN em
// `NNNN_down_*.sql`. A realidade é `db/migrations-pg/<timestamp>_<nome>.up.sql`.
// Nem o diretório nem o padrão batiam, e ninguém percebeu por meses porque o
// Gate 2 verifica PAREAMENTO, não a convenção que a lei descreve. Uma lei que
// descreve caminhos inexistentes ensina errado quem a lê pela primeira vez — e
// quem a lê pela primeira vez é justamente quem mais depende dela.
//
// ## Por que só agora
//
// A emenda passa a EXIGIR o runner e o registro. Emendar antes de os dois
// existirem em produção deixaria a lei descrevendo algo que ainda não existe — o
// mesmo defeito, ao contrário. A adoção em produção foi feita em 2026-09-10.
//
// ## O que este teste guarda para sempre
//
// Não o texto exato: a PROPRIEDADE. Todo caminho que a §4.1 cita tem de existir,
// e o padrão que ela descreve tem de ser o dos arquivos. No dia em que o
// diretório mudar de novo, isto reprova — em vez de a lei envelhecer calada.

const RAIZ = process.cwd();
const constituicao = fs.readFileSync(path.resolve(RAIZ, '.sdd/memory/constitution.md'), 'utf-8');

/** O item 1 da seção 4, até o item 2 — com a nota da emenda. */
function clausulaInteira() {
    const secao = constituicao.slice(constituicao.indexOf('## 4.'));
    const inicio = secao.search(/^1\.\s/m);
    const fim = secao.search(/^2\.\s/m);
    return secao.slice(inicio, fim);
}

/**
 * A REGRA, sem a nota da emenda `*(Emenda ...)*`. A nota cita o padrão antigo de
 * propósito — é o registro do que mudou —, e a primeira versão destas guardas a
 * lia como se fosse a regra e reprovava a emenda correta. Mesma lição das guardas
 * de código que tiram comentário antes de varrer: o que se confere é o que a lei
 * MANDA, não o que ela conta.
 */
function clausula41() {
    return clausulaInteira().replace(/\*\(Emenda[\s\S]*?\)\*/g, '');
}

describe('TASK-104 — a §4.1 descreve o que existe', () => {
    it('BDD 1: todo padrão de arquivo citado na cláusula casa com arquivos REAIS', () => {
        // Não basta o diretório existir: `db/migrations/` existe (é o do SQLite
        // antigo), e a versão anterior desta cláusula passaria numa checagem de
        // pasta — nenhum arquivo dele, nem de nenhum outro, jamais seguiu
        // `NNNN_up_*.sql`. O que se confere é o PADRÃO contra o disco.
        const citados = [...clausula41().matchAll(/`((?:db\/[^`\s]*\/)?[^`\s/]*(?:NNNN|<timestamp>|\*)[^`\s/]*\.sql)`/g)]
            .map(m => m[1]);
        expect(citados.length, 'a cláusula não cita padrão de arquivo nenhum').toBeGreaterThan(0);

        // Padrão sem diretório (o DOWN, "com o mesmo prefixo") herda o do anterior.
        let dirAnterior = '';
        const semArquivo: string[] = [];
        for (const c of citados) {
            const dir = c.includes('/') ? c.slice(0, c.lastIndexOf('/')) : dirAnterior;
            dirAnterior = dir;
            const nome = c.slice(c.lastIndexOf('/') + 1);
            const re = new RegExp('^' + nome
                .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                .replace(/NNNN|<timestamp>/g, '\\d+')
                .replace(/<[a-z]+>/g, '[a-z0-9_]+')
                .replace(/\*/g, '.*') + '$');
            const abs = path.resolve(RAIZ, dir);
            const casam = fs.existsSync(abs) ? fs.readdirSync(abs).filter(f => re.test(f)) : [];
            if (!casam.length) semArquivo.push(`${dir}/${nome}`);
        }
        expect(semArquivo, 'a lei descreve um padrão que nenhum arquivo segue').toEqual([]);
    });

    it('BDD 1: o padrão descrito é o dos arquivos, e não o antigo', () => {
        const texto = clausula41();
        expect(texto, 'ainda descreve o padrão NNNN_up_ que nenhum arquivo segue').not.toMatch(/NNNN_up_|NNNN_down_/);
        expect(texto).toMatch(/db\/migrations-pg\/<timestamp>_<nome>\.up\.sql/);
        expect(texto).toMatch(/<timestamp>_<nome>\.down\.sql/);

        // E o padrão descrito casa com TODOS os arquivos do diretório.
        const arquivos = fs.readdirSync(path.resolve(RAIZ, 'db/migrations-pg')).filter(f => f.endsWith('.sql'));
        const fora = arquivos.filter(f => !/^\d{12}_[a-z0-9_]+\.(up|down)\.sql$/.test(f));
        expect(fora, 'arquivo fora do padrão que a lei descreve').toEqual([]);
    });

    it('BDD 2: exige aplicar pelo runner, que registra', () => {
        const texto = clausula41();
        expect(texto, 'não nomeia o runner').toMatch(/db\/runner-migracoes\.mjs/);
        expect(texto, 'não nomeia o registro').toMatch(/migracoes_aplicadas/);
        expect(fs.existsSync(path.resolve(RAIZ, 'db/runner-migracoes.mjs'))).toBe(true);
    });

    it('BDD 2: o princípio de sempre continua lá — DOWN antes, e sem DOWN é bloqueador', () => {
        // A emenda troca a DESCRIÇÃO, não o princípio. Perder o bloqueador no
        // caminho seria a correção passando do ponto.
        const texto = clausula41();
        expect(texto).toMatch(/DOWN[^.]*ANTES/);
        expect(texto).toMatch(/sem DOWN = BLOQUEADOR/);
    });

    it('BDD 3: a emenda se identifica, como a da §3.2', () => {
        expect(clausulaInteira(), 'emenda sem data, tipo e ADR — um leitor não sabe que a letra mudou')
            .toMatch(/Emenda de 2026-09-10, CR Tipo D, ADR-021/);
    });
});
