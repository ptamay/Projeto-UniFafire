import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TASK-092 (REQ-032 · CR Tipo C, ADR-016) — a função executa na mesma região do
// banco.
//
// ## O defeito
//
// `X-Vercel-Id: gru1::iad1::…` — a requisição entra em São Paulo e a função
// executa em Washington, com o banco em `sa-east-1`, São Paulo. Cada ida ao banco
// atravessa as Américas duas vezes para voltar a poucos quilômetros de onde saiu.
//
// Medido em 2026-09-07, em duas rotas nas mesmas condições:
//
//   /login       não toca o banco   mediana  86 ms   mínimo  82 ms
//   /api/health  um `SELECT 1`      mediana 335 ms   mínimo 331 ms
//   diferença                               249 ms          249 ms
//
// Idêntica na mediana e no mínimo — assinatura de distância, não de trabalho.
//
// ## Não é regressão
//
// Não existe `vercel.json` e a região nunca foi escolhida. `iad1` é o padrão da
// plataforma, e ele existe porque a maioria das fontes de dados externas fica na
// costa leste dos EUA. Não é o caso deste sistema.
//
// ## Por que isto é um teste, e não só um arquivo
//
// A configuração vale enquanto ninguém a desfizer sem perceber. Um teste que
// apenas verificasse "o arquivo existe" não pegaria a única mudança que importa:
// alguém trocar a região. E há uma segunda forma de quebrar que não tem sintoma
// local nenhum — ver o terceiro cenário.

const RAIZ = process.cwd();
const VERCEL_JSON = path.resolve(RAIZ, 'vercel.json');

/** Regiões da Vercel pela região AWS que representam. A função tem de rodar na
 *  MESMA que o banco: é isso, e não o nome `gru1`, que o ADR-016 decide. */
const REGIAO_AWS: Record<string, string> = {
    gru1: 'sa-east-1',
    iad1: 'us-east-1',
    cle1: 'us-east-2',
    sfo1: 'us-west-1',
    pdx1: 'us-west-2',
};

function lerConfig(): { regions?: string[] } {
    return JSON.parse(fs.readFileSync(VERCEL_JSON, 'utf-8'));
}

describe('TASK-092 — a função roda na mesma região do banco', () => {
    it('BDD 1: existe `vercel.json` e ele fixa a região', () => {
        // Em ARQUIVO e não no painel: configuração que só existe no painel é
        // invisível para quem lê o repositório, não aparece em revisão de PR e
        // some se o projeto for recriado. Foi assim que a região errada passou
        // dois meses sem ninguém notar.
        expect(fs.existsSync(VERCEL_JSON), 'a região está entregue ao padrão da plataforma').toBe(true);
        expect(lerConfig().regions, '`vercel.json` existe e não declara região').toBeDefined();
    });

    it('BDD 1: a região da função é a MESMA região AWS do banco', () => {
        // O que o ADR-016 decide não é o nome `gru1` — é que função e banco fiquem
        // juntos. Se um dia o projeto Supabase mudar de região, este cenário
        // reprova e obriga a olhar, em vez de deixar os 249 ms voltarem calados.
        const runbook = fs.readFileSync(path.resolve(RAIZ, 'docs/runbook-deploy.md'), 'utf-8');
        const doBanco = runbook.match(/\b(sa|us|eu|ap|ca|me|af)-[a-z]+-\d\b/)?.[0];
        expect(doBanco, 'o runbook não declara mais a região do Supabase').toBeDefined();

        const daFuncao = lerConfig().regions![0];
        expect(
            REGIAO_AWS[daFuncao],
            `função em ${daFuncao} (${REGIAO_AWS[daFuncao] ?? 'região desconhecida'}) e banco em ${doBanco}`,
        ).toBe(doBanco);
    });

    it('BDD 2: declara UMA região só — mais que isso quebra TODO deploy', () => {
        // Guarda contra a correção passar do ponto, e ela não tem sintoma local:
        // o plano Hobby permite UMA região, e a documentação da Vercel é explícita
        // — "deploying to more regions than your plan allows causes the deployment
        // to fail BEFORE the build step". Um segundo item aqui, acrescentado com a
        // melhor das intenções ("redundância"), passa em tudo que roda nesta
        // máquina e derruba a publicação.
        const regions = lerConfig().regions!;
        expect(regions, `o plano gratuito aceita uma região, e há ${regions.length}`).toHaveLength(1);
    });
});
