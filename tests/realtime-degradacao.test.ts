import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    deveFazerPollingLargo, INTERVALO_POLLING_LARGO,
    type EstadoSinal,
} from '@/lib/realtime-sinal';

// TASK-073 (Sprint 25 · Etapa 5 do ADR-012) — sem WebSocket, a tela não congela.
// REQ-032.
//
// ## Por que esta task não é polimento
//
// Antes da TASK-072, o pior caso era 3 s de defasagem. Depois dela, sem esta, o
// pior caso vira **defasagem infinita**: a assinatura falha, ninguém é avisado, e
// a tela mostra para sempre o estado de quando carregou. O porteiro entrega uma
// chave que a tela diz estar disponível e que outro já levou.
//
// Trocar 3 s por infinito seria piorar o sistema com a desculpa de melhorá-lo.
//
// ## Por que "qualquer coisa que não seja assinado" é a regra certa
//
// `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`, "sem as variáveis de ambiente" e "ainda
// conectando" são estados diferentes com a MESMA consequência: não estou
// recebendo sinal. Distinguí-los na decisão só criaria caminhos para esquecer um.
//
// E incluir `conectando` sai de graça: o intervalo largo tem o primeiro disparo
// lá na frente, então uma conexão que se estabelece em poucos segundos cancela o
// polling antes de ele custar uma requisição sequer. É o que dispensa um timeout
// de conexão separado — menos um número mágico para acertar.

const RAIZ = process.cwd();

function semComentarios(arquivo: string) {
    return fs.readFileSync(path.resolve(RAIZ, arquivo), 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

describe('TASK-073 — a decisão de degradar é pura e testável fora do navegador', () => {
    it('BDD 4: só "assinado" dispensa o polling largo', () => {
        const estados: [EstadoSinal, boolean][] = [
            ['assinado', false],
            ['falhou', true],
            ['sem-configuracao', true],
            ['conectando', true],
        ];
        for (const [estado, esperado] of estados) {
            expect(deveFazerPollingLargo(estado), `estado "${estado}"`).toBe(esperado);
        }
    });

    it('BDD 1: assinatura que nunca conecta acaba em polling — sem timeout separado', () => {
        // `conectando` já pede polling. Como o primeiro disparo do intervalo largo
        // está longe, uma conexão normal o cancela antes de custar requisição —
        // e uma conexão que nunca vem simplesmente deixa o polling acontecer.
        expect(deveFazerPollingLargo('conectando')).toBe(true);
        expect(INTERVALO_POLLING_LARGO, 'o intervalo precisa ser folgado o bastante para a conexão vencer a corrida')
            .toBeGreaterThanOrEqual(15000);
    });

    it('o intervalo largo é MUITO maior que os 3 s que a sprint removeu', () => {
        // O REQ-032 tem duas metades, e esta é a segunda: o polling de 3 s
        // projetava ~10,5 mi de requisições/mês para 10 usuários. Degradar para
        // outro polling de 3 s não resolveria a cota — só o sincronismo.
        expect(INTERVALO_POLLING_LARGO).toBeGreaterThan(3000 * 4);
    });
});

describe('TASK-073 — nenhuma tela fica sem rede de segurança', () => {
    const COMPONENTES = [
        'src/app/components/DashboardClient.tsx',
        'src/app/components/PendingInline.tsx',
        'src/app/components/Sidebar.tsx',
        'src/app/confirm/ConfirmClient.tsx',
    ];

    it('BDD 1: os quatro usam o hook que JÁ inclui a degradação', () => {
        // Se um componente assinasse o sinal cru, ele ficaria sem fallback — e o
        // defeito só apareceria no dia em que o Realtime caísse. O hook combinado
        // torna impossível esquecer.
        const crus = COMPONENTES.filter(c => {
            const fonte = semComentarios(c);
            return /useSinalDeMudanca\s*\(/.test(fonte) && !/useAtualizacaoDeChaves\s*\(/.test(fonte);
        });
        expect(crus, `assinam o sinal sem rede de segurança:\n${crus.join('\n')}`).toEqual([]);
    });

    it('BDD 2: os dois mecanismos nunca rodam juntos', () => {
        // Assinatura ativa E polling largo ao mesmo tempo seria pagar as duas
        // contas. O intervalo tem de ser limpo quando o estado vira "assinado".
        const fonte = semComentarios('src/lib/realtime-sinal.ts');
        expect(fonte, 'o polling largo não é desligado quando a assinatura volta')
            .toMatch(/clearInterval/);
    });
});

describe('TASK-073 — sem as variáveis do Supabase, o sistema funciona', () => {
    it('BDD 3: a ausência de configuração é um estado previsto, não um erro', () => {
        expect(deveFazerPollingLargo('sem-configuracao'), 'sem Realtime a tela ficaria parada')
            .toBe(true);
    });

    it('BDD 3: nada no cliente exige as variáveis para renderizar', () => {
        // Um `throw` na ausência das variáveis transformaria "ambiente sem
        // Realtime" em "aplicação que não sobe" — e é o ambiente de qualquer
        // desenvolvedor rodando contra o container.
        const fonte = semComentarios('src/lib/realtime-sinal.ts');
        expect(fonte, 'o módulo lança quando falta configuração').not.toMatch(/throw\s+new\s+Error/);
    });
});
