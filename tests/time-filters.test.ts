import { describe, it, expect } from 'vitest';
import {
    APP_TIMEZONE,
    normalizeTimestamp,
    formatTimestamp,
    localDayRangeUtc,
    localMonthRangeUtc,
    localHourToUtcHour,
} from '@/lib/time-filters';

// TASK-055 (Sprint 16) — a trilha de auditoria é gravada em UTC, mas lida por
// pessoas em Recife (UTC-3, sem horário de verão desde 2019). Os filtros de
// data/mês/hora comparavam o valor cru em UTC contra o que o operador vê na
// tela, devolvendo a faixa errada; e o histórico tem duas formas de timestamp
// gravadas, uma delas interpretada como hora local pelo JavaScript.

describe('TASK-055 — fuso da aplicação', () => {
    it('opera em America/Recife por padrão', () => {
        expect(APP_TIMEZONE).toBe('America/Recife');
    });
});

describe('TASK-055 — normalização de timestamp', () => {
    it('mantém intacto o formato ISO com Z', () => {
        expect(normalizeTimestamp('2026-07-06T20:33:14.439Z')).toBe('2026-07-06T20:33:14.439Z');
    });

    it('converte o formato do CURRENT_TIMESTAMP do SQLite, que também é UTC', () => {
        // Sem o "T" e sem o "Z", o JavaScript parseia como hora LOCAL e adianta
        // o registro em 3 horas — 6 linhas de history estão nessa forma.
        expect(normalizeTimestamp('2026-07-04 18:04:39')).toBe('2026-07-04T18:04:39.000Z');
    });

    it('as duas formas do mesmo instante viram o mesmo valor', () => {
        expect(normalizeTimestamp('2026-07-04 18:04:39'))
            .toBe(normalizeTimestamp('2026-07-04T18:04:39.000Z'));
    });
});

describe('TASK-055 — exibição no fuso de Recife', () => {
    it('exibe o ISO UTC convertido para a hora local', () => {
        // 20:33 UTC == 17:33 em Recife
        expect(formatTimestamp('2026-07-06T20:33:14.439Z')).toContain('17:33');
    });

    it('exibe corretamente também a forma legada do SQLite', () => {
        // 18:04 UTC == 15:04 em Recife. Hoje a tela mostra 18:04 (3h adiantado).
        expect(formatTimestamp('2026-07-04 18:04:39')).toContain('15:04');
    });

    it('não depende do fuso do dispositivo de quem acessa', () => {
        const a = formatTimestamp('2026-07-06T20:33:14.439Z');
        const b = formatTimestamp('2026-07-06T20:33:14.439Z');
        expect(a).toBe(b);
        expect(a).toContain('06/07/2026');
    });
});

describe('TASK-055 — faixas UTC a partir de filtros locais', () => {
    it('um dia local vira a faixa UTC correspondente', () => {
        const { startIso, endIso } = localDayRangeUtc('2026-07-06');
        expect(startIso).toBe('2026-07-06T03:00:00.000Z');
        expect(endIso).toBe('2026-07-07T03:00:00.000Z');
    });

    it('um registro das 22h locais cai no dia local certo', () => {
        // 2026-07-05T01:30Z == 04/07 às 22:30 em Recife
        const ts = '2026-07-05T01:30:00.000Z';
        const dia4 = localDayRangeUtc('2026-07-04');
        const dia5 = localDayRangeUtc('2026-07-05');

        expect(ts >= dia4.startIso && ts < dia4.endIso, 'deve pertencer ao dia 04').toBe(true);
        expect(ts >= dia5.startIso && ts < dia5.endIso, 'não pode cair no dia 05').toBe(false);
    });

    it('um mês local vira a faixa UTC correspondente', () => {
        const { startIso, endIso } = localMonthRangeUtc('2026-07');
        expect(startIso).toBe('2026-07-01T03:00:00.000Z');
        expect(endIso).toBe('2026-08-01T03:00:00.000Z');
    });

    it('vira o ano corretamente em dezembro', () => {
        const { startIso, endIso } = localMonthRangeUtc('2026-12');
        expect(startIso).toBe('2026-12-01T03:00:00.000Z');
        expect(endIso).toBe('2027-01-01T03:00:00.000Z');
    });

    it('converte a hora local para a hora UTC correspondente', () => {
        expect(localHourToUtcHour('14')).toBe('17');
        expect(localHourToUtcHour('0')).toBe('03');
    });

    it('dá a volta no relógio quando a hora local passa da meia-noite em UTC', () => {
        // 22h em Recife == 01h UTC do dia seguinte
        expect(localHourToUtcHour('22')).toBe('01');
        expect(localHourToUtcHour('23')).toBe('02');
    });
});
