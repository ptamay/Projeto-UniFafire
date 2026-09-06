import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-084 (Sprint 24 · CR Tipo C, ADR-013 decisão 5) — a trilha de auditoria
// para de ser inundada pelo próprio sistema. constitution §7.1.
//
// ## O que este arquivo testava antes, e por que virou o oposto
//
// Ele afirmava que `src/instrumentation.ts` exportava `register` — a prova de
// que o agendamento de backup subia junto com o servidor (TASK-021). Aquele
// agendamento morreu na TASK-070: `node-cron` precisa de processo de longa
// duração, que não existe em execução serverless.
//
// O que sobreviveu foi a casca. `register()` continuou sendo chamada a cada
// inicialização de instância, e tudo o que ela fazia era invocar
// `startCronJobs()`, cujo corpo inteiro é **gravar um log dizendo que não faz
// nada**.
//
// ## O custo medido, não estimado
//
// Em produção, menos de duas horas depois do go-live de 2026-09-06:
//
//     cron_desativado   52 linhas   ← 87% da trilha
//     route_timing       4 linhas
//     audit_action       4 linhas
//
// Em serverless isso é um cold start atrás do outro, para sempre.
//
// ## Por que é violação da §7, e não faxina cosmética
//
// A constitution §7.1 determina que `app_logs` **nunca entra em rotina de
// limpeza** — é o destino que precisa sobreviver ao REQ-014. Logo o ruído é
// PERMANENTE: não há caminho legítimo para apagá-lo depois. Ele cresce
// indefinidamente num plano de 500 MB, dentro da única tabela que responde "o
// que aconteceu?" num incidente.
//
// Uma trilha em que 87% das linhas anunciam a inexistência de um agendador
// ensina quem a lê a ignorá-la. A §7 existe para produzir o efeito contrário.

const RAIZ = process.cwd();

/** Fonte sem comentário — mesma convenção das guardas das TASK-074/075/079. */
function semComentarios(arquivo: string) {
    return fs.readFileSync(path.resolve(RAIZ, arquivo), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

describe('TASK-084 — o agendador que não existe deixa de se anunciar', () => {
    it('BDD 1: `src/instrumentation.ts` não existe', () => {
        // Removido inteiro, e não deixado como casca vazia: um hook que roda a
        // cada cold start para não fazer nada é custo sem contrapartida.
        expect(
            fs.existsSync(path.resolve(RAIZ, 'src/instrumentation.ts')),
            'o hook continua rodando a cada inicialização de instância',
        ).toBe(false);
    });

    it('BDD 1: `startCronJobs` não existe mais em src/lib/backup.ts', () => {
        expect(semComentarios('src/lib/backup.ts'), 'a função que só se anuncia continua lá')
            .not.toMatch(/export\s+async\s+function\s+startCronJobs/);
    });

    it('BDD 1: nada em src/ escreve `cron_desativado`', () => {
        const achados: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const rel = path.relative(RAIZ, p).split(path.sep).join('/');
                    if (semComentarios(rel).includes('cron_desativado')) achados.push(rel);
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(achados, `ainda inundam a trilha:\n${achados.join('\n')}`).toEqual([]);
    });
});

describe('TASK-084 — a dependência morta sai do package.json', () => {
    const pkg = () => JSON.parse(fs.readFileSync(path.resolve(RAIZ, 'package.json'), 'utf-8'));

    it('BDD 2: `node-cron` e `@types/node-cron` não são mais dependências', () => {
        const todas = { ...pkg().dependencies, ...pkg().devDependencies };
        expect(Object.keys(todas).filter(d => d.includes('node-cron')), 'dependência sem uso')
            .toEqual([]);
    });

    it('BDD 2: nada em src/ importa node-cron', () => {
        const achados: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const rel = path.relative(RAIZ, p).split(path.sep).join('/');
                    if (/from ['"]node-cron['"]|require\(['"]node-cron['"]\)/.test(semComentarios(rel))) {
                        achados.push(rel);
                    }
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(achados, 'import sem dependência declarada reprova o Gate 1').toEqual([]);
    });
});

describe('TASK-084 — o que a trilha DEVE registrar continua registrando', () => {
    it('BDD 3: o logger estruturado não foi tocado', () => {
        // A remoção é do emissor de ruído, não do mecanismo. Se este teste cair
        // junto com os de cima, a task passou do ponto.
        expect(fs.existsSync(path.resolve(RAIZ, 'src/lib/structured-logger.ts'))).toBe(true);
        expect(semComentarios('src/lib/structured-logger.ts'), 'o logger perdeu a escrita em app_logs')
            .toMatch(/app_logs/);
    });
});
