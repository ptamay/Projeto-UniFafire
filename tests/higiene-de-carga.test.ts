import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-099/100 (CR Tipo C · ADR-019) — o que o navegador baixa e o que o deploy
// carrega. REQ-032 (restrição de volume).
//
// ## Por que isto é um teste, e não uma limpeza de uma vez
//
// Os três problemas aqui são de REINCIDÊNCIA, não de estado:
//
// - um import estático de biblioteca pesada volta na primeira vez que alguém
//   precisar de PDF em outra tela e copiar a linha de cima;
// - script legado volta na primeira vez que alguém precisar de um utilitário e
//   copiar o vizinho;
// - `.vercelignore` está certo hoje e fica errado sozinho, no dia em que `src/`
//   passar a ler um caminho excluído — e essa falha **não aparece no build local**.
//
// Limpar sem guarda é adiar. Foi o que aconteceu com os scripts legados: o débito
// está registrado no `plan.md` desde a TASK-079 e nunca saiu do lugar.

const RAIZ = process.cwd();
const ler = (rel: string) => fs.readFileSync(path.resolve(RAIZ, rel), 'utf-8');
const semComentarios = (fonte: string) =>
    fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('TASK-099 — jsPDF não desce para quem só quer consultar', () => {
    it('BDD 1: `/history` não importa jspdf estaticamente', () => {
        // Import estático em componente de CLIENTE entra no bundle da rota. Medido
        // em 2026-09-08: o chunk que contém jsPDF tem 459 KB — o maior do app — e
        // desce para todo mundo que abre a tela, use ou não a exportação.
        const fonte = semComentarios(ler('src/app/history/HistoryClient.tsx'));
        expect(fonte, 'jspdf continua no carregamento inicial de /history')
            .not.toMatch(/^\s*import\s+.*from\s+['"]jspdf/m);
        expect(fonte, 'jspdf-autotable continua no carregamento inicial de /history')
            .not.toMatch(/^\s*import\s+.*from\s+['"]jspdf-autotable/m);
    });

    it('BDD 1: a exportação continua existindo, carregando sob demanda', () => {
        // Guarda contra a correção passar do ponto: tirar o import resolveria o
        // número e quebraria a feature. O histórico impresso tem uso real numa
        // portaria.
        const fonte = ler('src/app/history/HistoryClient.tsx');
        expect(fonte, 'a exportação em PDF sumiu junto com o import')
            .toMatch(/import\s*\(\s*['"]jspdf['"]\s*\)/);
    });
});

describe('TASK-100 — dependências dizem a verdade', () => {
    const pkg = JSON.parse(ler('package.json')) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
    };

    it('BDD 2: nenhuma dependência de produção fica sem uso', () => {
        // `server-only` estava declarada com ZERO importações. A varredura vale
        // mais que a remoção: dependência morta é superfície de supply chain que
        // ninguém revisa, porque ninguém sabe que está lá.
        const alvos = ['src', 'db', 'scripts', 'tests'];
        const arquivos: string[] = [];
        const varrer = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) arquivos.push(fs.readFileSync(p, 'utf-8'));
            }
        };
        alvos.forEach(a => varrer(path.resolve(RAIZ, a)));
        const tudo = arquivos.join('\n') + ler('next.config.ts');

        // `@types/*` não são importados por nome: são resolvidos pelo compilador.
        const orfas = Object.keys(pkg.dependencies)
            .filter(d => !d.startsWith('@types/'))
            .filter(d => !new RegExp(`['"]${d.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}(/|['"])`).test(tudo));

        expect(orfas, `declaradas em dependencies e nunca importadas:\n${orfas.join('\n')}`).toEqual([]);
    });

    it('BDD 2: pacote de tipos não fica em `dependencies`', () => {
        // `@types/*` existe só em build. Em `dependencies` ele engorda a árvore de
        // produção e sugere, a quem lê, que há algo de runtime ali.
        const tiposEmProd = Object.keys(pkg.dependencies).filter(d => d.startsWith('@types/'));
        expect(tiposEmProd, `tipos em dependencies: ${tiposEmProd.join(', ')}`).toEqual([]);
    });
});

describe('TASK-100 — arquivos que descrevem um sistema que não existe', () => {
    it('BDD 3: nenhum script fala com o SQLite que saiu na Sprint 21', () => {
        // Sem esta varredura a limpeza é só um dia bom: o próximo utilitário nasce
        // copiando o vizinho. É a mesma razão da guarda de `page.tsx` do ADR-015.
        const dir = path.resolve(RAIZ, 'scripts');
        const legados = fs.readdirSync(dir)
            .filter(f => /\.(js|mjs|ts)$/.test(f))
            .filter(f => /better-sqlite3|keys\.db/.test(fs.readFileSync(path.join(dir, f), 'utf-8')));
        expect(legados, `scripts que abrem um banco que não existe:\n${legados.join('\n')}`).toEqual([]);
    });

    it('BDD 3: nenhum teste é uma tautologia', () => {
        // `expect(true).toBe(true)` é PIOR que teste ausente: conta como verde,
        // aparece no relatório com nome de feature, e não afirma nada. Teste que
        // não pode falhar é ruído com aparência de cobertura.
        const dir = path.resolve(RAIZ, 'tests');
        const tautologicos = fs.readdirSync(dir)
            .filter(f => f.endsWith('.test.ts'))
            .filter(f => /expect\(\s*true\s*\)\s*\.toBe\(\s*true\s*\)/.test(fs.readFileSync(path.join(dir, f), 'utf-8')));
        expect(tautologicos, `testes que não podem falhar:\n${tautologicos.join('\n')}`).toEqual([]);
    });
});

describe('TASK-100 — o deploy só carrega o que o build lê', () => {
    const CAMINHO = '.vercelignore';

    function excluidos(): string[] {
        return ler(CAMINHO)
            .split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#'))
            .map(l => l.replace(/^\/+|\/+$/g, ''));
    }

    it('BDD 4: existe `.vercelignore`', () => {
        // ~1,47 MB de 4,1 MB versionados (35%) subiam sem o build jamais os ler.
        expect(fs.existsSync(path.resolve(RAIZ, CAMINHO)), 'o deploy carrega tudo').toBe(true);
    });

    it('BDD 4: nenhum caminho excluído é referenciado por `src/`', () => {
        // ⚠️ ESTA é a guarda que vale mais que o arquivo. Excluir diretório do
        // deploy é seguro HOJE. No dia em que alguém importar algo de `db/` num
        // Server Component, o `next build` LOCAL passa — porque localmente o
        // arquivo está lá — e a produção quebra.
        //
        // É exatamente a classe de falha que a migration da TASK-093 produziu em
        // 2026-09-08: o que existe na máquina de quem publica não é o que existe
        // no ambiente que serve. Runbook §4.2.
        const fontes: string[] = [];
        const varrer = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) varrer(p);
                else if (/\.(ts|tsx)$/.test(e.name)) fontes.push(semComentarios(fs.readFileSync(p, 'utf-8')));
            }
        };
        varrer(path.resolve(RAIZ, 'src'));
        const codigo = fontes.join('\n');

        const violados = excluidos().filter(dir =>
            // Só o que parece caminho de módulo ou de arquivo lido em runtime —
            // menção em string de texto não conta.
            new RegExp(`from\\s+['"][^'"]*${dir}/|import\\s*\\(\\s*['"][^'"]*${dir}/|readFileSync\\([^)]*${dir}/`).test(codigo),
        );
        expect(violados, `excluídos do deploy e usados por src/:\n${violados.join('\n')}`).toEqual([]);
    });

    it('BDD 4: o que o build PRECISA nunca é excluído', () => {
        // Guarda contra a correção passar do ponto, e o custo do erro é produção
        // fora do ar. Estes quatro não podem entrar na lista por descuido.
        const lista = excluidos();
        for (const essencial of ['src', 'public', 'package.json', 'next.config.ts']) {
            expect(lista, `${essencial} foi excluído do deploy`).not.toContain(essencial);
        }
    });
});
