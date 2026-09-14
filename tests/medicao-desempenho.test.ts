import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { semConsulta, deveMedirDesempenho } from '@/lib/medicao-desempenho';

// TASK-126 (CR Tipo C, ADR-028) — o desempenho medido no navegador.
//
// A §7.2 mede o servidor. O que a pessoa vê — a tela aparecer, o toque
// responder, o layout pular — nunca teve número: as queixas do ADR-018 e do
// ADR-027 só existiram como relato. O Vercel Speed Insights mede isso em quem
// usa de verdade, e cada ponto de medição leva a URL da página para a Vercel.
//
// ## O que estes cenários guardam
//
// 1. A URL sai SEM query string. Os filtros do Histórico andam nela — `userId`,
//    `keyId`, `date`, `hour` — e juntos dizem quem pegou qual chave e quando. O
//    caminho basta para medir (§6.1, minimização).
// 2. Um importador só. Se outro arquivo desenhar `<SpeedInsights>` direto, ele
//    manda a URL inteira e o item 1 vira letra morta sem nenhum sintoma.
// 3. Só na Vercel. Em desenvolvimento o pacote baixa um script de
//    `va.vercel-scripts.com` — a E2E e o CI passariam a depender de rede de
//    terceiro —, e um `next start` local pediria `/_vercel/...`, que o proxy
//    responde com 307 (medido em produção: `/_vercel/insights/` → 307).
//
// O que NENHUM teste daqui alcança: o caminho aleatório que a v2 do pacote usa
// em produção (*resilient intake*) é gerado no build da Vercel. Se o proxy o
// deixa passar só se prova no deploy — critério de aceite do ADR-028.

const RAIZ = process.cwd();
const SRC = path.resolve(RAIZ, 'src');
const COMPONENTE = 'src/app/components/MedicaoDeDesempenho.tsx';
const LAYOUT_RAIZ = 'src/app/layout.tsx';

function ler(relativo: string): string {
    return fs.readFileSync(path.resolve(RAIZ, relativo), 'utf-8');
}

function arquivosDe(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const completo = path.join(dir, e.name);
        if (e.isDirectory()) return arquivosDe(completo);
        return /\.(tsx?|mjs|js)$/.test(e.name) ? [completo] : [];
    });
}

describe('TASK-126 — a URL medida sai sem query string', () => {
    it('BDD 1: tira os filtros do Histórico e o fragmento da URL', () => {
        const evento = semConsulta({
            type: 'vital',
            url: 'https://projeto-uni-fafire.vercel.app/history?userId=5&keyId=3&date=2026-09-14&hour=08#topo',
            route: '/history',
        });
        expect(evento).toEqual({
            type: 'vital',
            url: 'https://projeto-uni-fafire.vercel.app/history',
            route: '/history',
        });
    });

    it('BDD 1: tira também da rota, e aceita URL relativa', () => {
        // A rota vem do `usePathname`, que não traz query — mas o pacote a monta
        // substituindo valores da query na URL quando a rota não tem segmento
        // dinâmico. Não custa nada garantir aqui em vez de confiar nisso.
        expect(semConsulta({ type: 'vital', url: '/logs?page=2', route: '/logs?page=2' }))
            .toEqual({ type: 'vital', url: '/logs', route: '/logs' });
    });

    it('BDD 1: URL sem query passa intacta, e rota ausente continua ausente', () => {
        const evento = { type: 'vital' as const, url: 'https://projeto-uni-fafire.vercel.app/keys' };
        expect(semConsulta(evento)).toEqual(evento);
        expect(semConsulta(evento)).not.toHaveProperty('route');
    });
});

describe('TASK-126 — só a Vercel carrega a medição', () => {
    it('BDD 3: VERCEL=1 mede; ausente, vazio ou outro valor, não', () => {
        expect(deveMedirDesempenho({ VERCEL: '1' })).toBe(true);
        expect(deveMedirDesempenho({})).toBe(false);
        expect(deveMedirDesempenho({ VERCEL: '' })).toBe(false);
        expect(deveMedirDesempenho({ VERCEL: '0' })).toBe(false);
    });

    it('BDD 3: o layout raiz desenha o componente SÓ sob a condição da Vercel', () => {
        const layout = ler(LAYOUT_RAIZ);
        expect(layout, 'o layout raiz não desenha a medição').toMatch(/<MedicaoDeDesempenho\s*\/>/);
        expect(
            layout,
            'o componente aparece fora da condição — a E2E e o CI passariam a baixar script de terceiro',
        ).toMatch(/\{\s*deveMedirDesempenho\(process\.env\)\s*&&\s*<MedicaoDeDesempenho\s*\/>\s*\}/);
        // Uma ocorrência só: a condição acima não protege uma segunda, solta.
        expect(layout.match(/<MedicaoDeDesempenho\b/g)).toHaveLength(1);
    });
});

describe('TASK-126 — um importador só do pacote', () => {
    it('BDD 2: só o componente próprio importa `@vercel/speed-insights`', () => {
        const importadores = arquivosDe(SRC)
            .filter(f => /['"]@vercel\/speed-insights(\/[\w-]+)?['"]/.test(fs.readFileSync(f, 'utf-8')))
            .map(f => path.relative(RAIZ, f).split(path.sep).join('/'));
        expect(importadores).toEqual([COMPONENTE]);
    });

    it('BDD 2: o componente entrega o `beforeSend` que tira a query', () => {
        // Sem os comentários: o próprio componente CITA `<SpeedInsights>` ao
        // explicar por que existe, e a contagem abaixo contaria a citação.
        const componente = ler(COMPONENTE).replace(/^\s*\/\/.*$/gm, '');
        expect(componente).toMatch(/^['"]use client['"]/);
        expect(componente, 'o `<SpeedInsights>` sai sem o filtro da URL').toMatch(
            /<SpeedInsights\b[^>]*\bbeforeSend=\{semConsulta\}/,
        );
        expect(componente.match(/<SpeedInsights\b/g)).toHaveLength(1);
    });
});
