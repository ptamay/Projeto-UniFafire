import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { findDelayedKeys } from '@/lib/business-rules';

// TASK-058 — render determinístico entre servidor e cliente.
//
// O componente é renderizado duas vezes: no servidor (SSR) e de novo no cliente,
// durante a hidratação. Se a saída depender do relógio, os dois instantes caem em
// segundos — ou horas — diferentes, o React acusa "Hydration failed" e DESCARTA a
// árvore vinda do servidor, re-renderizando tudo no cliente. O defeito é uma
// corrida: some quando SSR e hidratação caem no mesmo segundo, o que o torna
// intermitente e fácil de confundir com ruído.
//
// Não há ambiente de DOM configurado neste projeto (vitest roda em 'node', sem
// testing-library), então a garantia é dividida em duas: um guard estático sobre
// o padrão no fonte, e o teste unitário da regra que dependia do relógio — agora
// pura, recebendo o instante como argumento em vez de lê-lo do ambiente.

const CLIENT_DIR = path.resolve(process.cwd(), 'src/app');

function listarTsx(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return listarTsx(full);
        return entry.name.endsWith('.tsx') ? [full] : [];
    });
}

describe('TASK-058 — nenhum valor dependente do relógio dentro do JSX', () => {
    // `${new Date()` (template literal, dentro de handler) é legítimo: só interessa
    // a interpolação JSX, que roda no render.
    const PADRAO = /(?<!\$)\{\s*(new Date\(\)|Date\.now\(\)|Math\.random\(\))/;

    it('nenhum componente interpola relógio ou aleatoriedade no render', () => {
        const infratores: string[] = [];

        for (const file of listarTsx(CLIENT_DIR)) {
            const linhas = fs.readFileSync(file, 'utf-8').split('\n');
            linhas.forEach((linha, i) => {
                if (PADRAO.test(linha)) {
                    infratores.push(`${path.relative(process.cwd(), file)}:${i + 1} → ${linha.trim().slice(0, 90)}`);
                }
            });
        }

        expect(infratores, `render dependente do relógio:\n${infratores.join('\n')}`).toEqual([]);
    });
});

describe('TASK-058 — regra de atraso recebe o instante, não o lê do ambiente', () => {
    const RETIRADA = '2026-08-20T09:00:00.000Z';
    const chaves = [
        { id: 1, name: 'Chave Lab', status: 'in_use', in_use_since: RETIRADA },
        { id: 2, name: 'Chave Aud', status: 'available', in_use_since: null },
        { id: 3, name: 'Chave Bib', status: 'in_use', in_use_since: null },
    ];

    it('não acusa atraso antes do limite', () => {
        const onzeHorasDepois = Date.parse('2026-08-20T20:00:00.000Z');
        expect(findDelayedKeys(chaves, onzeHorasDepois)).toEqual([]);
    });

    it('acusa atraso passado o limite, com as horas decorridas', () => {
        const quinzeHorasDepois = Date.parse('2026-08-21T00:00:00.000Z');
        const atrasadas = findDelayedKeys(chaves, quinzeHorasDepois);

        expect(atrasadas).toHaveLength(1);
        expect(atrasadas[0].id).toBe(1);
        expect(atrasadas[0].diffHours).toBe(15);
    });

    it('ignora chave disponível e chave sem data de retirada', () => {
        const muitoDepois = Date.parse('2026-09-01T00:00:00.000Z');
        expect(findDelayedKeys(chaves, muitoDepois).map(k => k.id)).toEqual([1]);
    });

    it('é determinística: o mesmo instante devolve sempre o mesmo resultado', () => {
        const instante = Date.parse('2026-08-21T00:00:00.000Z');
        expect(findDelayedKeys(chaves, instante)).toEqual(findDelayedKeys(chaves, instante));
    });
});

describe('TASK-058 — limiar de atraso preserva o comportamento original', () => {
    const chaves = [{ id: 1, status: 'in_use', in_use_since: '2026-08-20T09:00:00.000Z' }];

    it('fração acima do limite conta como atraso, e as horas exibidas são arredondadas para baixo', () => {
        // 12h30 após a retirada: passou do limite de 12h, mas arredonda para 12.
        const doze_e_meia = Date.parse('2026-08-20T21:30:00.000Z');
        const atrasadas = findDelayedKeys(chaves, doze_e_meia);

        expect(atrasadas, 'comparar o valor arredondado excluiria este caso').toHaveLength(1);
        expect(atrasadas[0].diffHours).toBe(12);
    });

    it('exatamente no limite ainda não é atraso', () => {
        expect(findDelayedKeys(chaves, Date.parse('2026-08-20T21:00:00.000Z'))).toEqual([]);
    });
});
