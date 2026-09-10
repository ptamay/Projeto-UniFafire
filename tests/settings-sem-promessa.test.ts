import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-082 (Sprint 24 · CR Tipo C, ADR-013 decisões 1 e 2) — a tela de
// configurações deixa de prometer o que o sistema não faz.
//
// ## O que é falso hoje, e desde quando
//
// | Na tela                        | Realidade                                  |
// |--------------------------------|--------------------------------------------|
// | "Horário do Backup"            | gravado em `settings`, nunca lido (TASK-070)|
// | "Retenção (qtd. de backups)"   | idem — e a tela promete remoção automática  |
// | "Gerar Backup Agora"           | `POST /api/backups` → 503 desde a TASK-070  |
// | "Importar Banco (.db)"         | `.db` é SQLite, fora do runtime na Sprint 21|
//
// Nenhum deles foi mentira quando nasceu. São resíduo da topologia desmontada
// entre as Sprints 21 e 23 — PM2 numa máquina, banco em arquivo, backup por
// cópia local.
//
// ## Por que remover, e não fazer funcionar
//
// Fazer o horário e a retenção funcionarem exigiria credencial de escrita no
// GitHub DENTRO da aplicação: reescrever o `cron` do workflow e apagar dumps no
// repositório privado. Superfície nova e permanente, por um controle que ninguém
// pediu e que o runbook §6 já cobre. Rejeitado no ADR-013.
//
// ## O limite: o que NÃO pode sair junto
//
// O card de confiabilidade e a lista de execuções ficam. Eles leem `backup_runs`
// — fato, não promessa — e são o único lugar do sistema onde se descobre que o
// backup parou. Há cenário afirmando isso, porque numa faxina o risco é levar
// junto o que estava certo.

const RAIZ = process.cwd();
const TELA = 'src/app/settings/SettingsClient.tsx';

function semComentarios(arquivo: string) {
    return fs.readFileSync(path.resolve(RAIZ, arquivo), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

describe('TASK-082 — os controles inertes saem da tela', () => {
    it('BDD 1: não há mais campo de horário nem de retenção de backup', () => {
        const tela = semComentarios(TELA);
        expect(tela, 'campo "Horário do Backup" continua na tela').not.toMatch(/Horário do Backup/i);
        // Precisa mirar o CAMPO, não a palavra: o texto que entra no lugar
        // explica que a retenção é o histórico do repositório privado, e essa
        // frase é verdadeira. Regex larga demais reprovaria a correção.
        expect(tela, 'campo de retenção continua na tela').not.toMatch(/Retenção \(quantidade/i);
        expect(tela, 'o input de retenção continua na tela').not.toMatch(/type="number"[^>]*max=\{50\}/);
        expect(
            tela,
            'a tela ainda promete que backups antigos são removidos — nada os remove',
        ).not.toMatch(/removidos automaticamente/i);
    });

    it('BDD 1: não há botão "Gerar Backup Agora"', () => {
        expect(semComentarios(TELA)).not.toMatch(/Gerar Backup Agora/i);
    });

    it('BDD 1: não sobra estado nem handler órfão', () => {
        // Remover o JSX e deixar o estado é meio caminho: o componente continua
        // buscando e guardando o que ninguém mostra, e o próximo leitor conclui
        // que o recurso existe em algum lugar.
        const tela = semComentarios(TELA);
        for (const orfao of ['backupTime', 'backupCount', 'generateBackup', 'generatingBkp', 'handleImportFile', 'importingDb']) {
            expect(tela, `sobrou órfão: ${orfao}`).not.toMatch(new RegExp(orfao));
        }
    });

    it('BDD 3: o card "Importar Banco (.db)" sai', () => {
        const tela = semComentarios(TELA);
        expect(tela, 'ainda oferece importar .db, formato fora do runtime desde a Sprint 21')
            .not.toMatch(/Importar Banco/i);
        expect(tela).not.toMatch(/accept="\.db"/);
    });
});

describe('TASK-082 — no lugar deles, o estado real', () => {
    it('BDD 2: a tela diz onde o backup realmente acontece', () => {
        const tela = fs.readFileSync(path.resolve(RAIZ, TELA), 'utf-8');
        expect(tela, 'a tela não informa o arranjo real de backup').toMatch(/GitHub Actions/);
        expect(tela, 'a tela não informa o horário real').toMatch(/03:00/);
    });
});

describe('TASK-082 — as rotas mortas somem', () => {
    it('BDD 4: restore e import não existem', () => {
        for (const rota of ['src/app/api/backups/restore', 'src/app/api/backups/import']) {
            expect(fs.existsSync(path.resolve(RAIZ, rota)), `${rota} ainda existe`).toBe(false);
        }
    });

    it('BDD 4: POST /api/backups não existe', () => {
        // Handler que responde 503 para sempre é pior que a ausência dele:
        // sugere capacidade em manutenção, quando a capacidade não existe mais.
        expect(semComentarios('src/app/api/backups/route.ts'), 'o POST que sempre recusa continua exportado')
            .not.toMatch(/export\s+async\s+function\s+POST/);
    });

    it('BDD 4: `createBackup` sai de src/lib/backup.ts', () => {
        expect(semComentarios('src/lib/backup.ts'), 'função cujo único propósito era recusar continua lá')
            .not.toMatch(/export\s+async\s+function\s+createBackup/);
    });

    it('BDD 4: nada em src/ chama as rotas removidas', () => {
        const achados: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.tsx?$/.test(e.name)) {
                    const rel = path.relative(RAIZ, p).split(path.sep).join('/');
                    if (/\/api\/backups\/(restore|import)/.test(semComentarios(rel))) achados.push(rel);
                }
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        expect(achados, `chamam rota removida:\n${achados.join('\n')}`).toEqual([]);
    });

    it('BDD 4: a API de settings para de aceitar o que ninguém lê', () => {
        // Os dois campos continuariam sendo gravados em `settings` por qualquer
        // cliente que os enviasse — superfície que só serve para reencher a
        // tabela com configuração que nada consome.
        const rota = semComentarios('src/app/api/settings/route.ts');
        expect(rota, 'a rota ainda grava backup_time').not.toMatch(/backup_time/);
        expect(rota, 'a rota ainda grava backup_retention_count').not.toMatch(/backup_retention_count/);
        const schemas = semComentarios('src/lib/schemas.ts');
        expect(schemas, 'o schema ainda valida campos removidos').not.toMatch(/backupTime|backupCount/);
    });
});

describe('TASK-082 — o que lê FATO permanece', () => {
    it('BDD 5: o card de confiabilidade e o último backup continuam', () => {
        // Guarda contra a faxina levar junto o que estava certo. Estes leem
        // `backup_runs`, e são o único lugar onde se descobre que o backup parou.
        //
        // TASK-111 (ADR-025): a LISTA de execuções saiu — fazia a página rolar, e o
        // usuário pediu só o estado. O que esta guarda protege não era a lista, era o
        // fato: o último backup, dito com o resultado, e a confiabilidade.
        const tela = semComentarios(TELA);
        expect(tela, 'o card de confiabilidade sumiu junto').toMatch(/descreverConfiabilidade/);
        expect(tela, 'o último backup sumiu junto').toMatch(/Último backup/);
        expect(fs.existsSync(path.resolve(RAIZ, 'src/app/api/backups/reliability/route.ts'))).toBe(true);
    });

    it('BDD 5: GET /api/backups continua listando as execuções', () => {
        expect(semComentarios('src/app/api/backups/route.ts')).toMatch(/export\s+async\s+function\s+GET/);
        expect(semComentarios('src/app/api/backups/route.ts')).toMatch(/getBackupRuns/);
    });
});

describe('TASK-082 — o resíduo da rede interna sai da config', () => {
    it('achado da TASK-084: `allowedDevOrigins` descreve uma topologia que não existe', () => {
        // Resíduo do acesso por IP da rede da instituição, removido na TASK-079.
        // É config de desenvolvimento e inofensiva — mas é da mesma família das
        // outras: descreve um mundo que acabou.
        expect(semComentarios('next.config.ts'), 'ainda libera o IP da rede interna')
            .not.toMatch(/allowedDevOrigins/);
    });
});
