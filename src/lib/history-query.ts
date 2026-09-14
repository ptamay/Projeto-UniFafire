import { localDayRangeUtc, localMonthRangeUtc, localHourToUtcHour } from '@/lib/time-filters';

// TASK-056 (Sprint 17) — construção da consulta do histórico.
//
// A trilha só filtrava por data/mês/hora, o que deixava sem resposta as duas
// perguntas centrais de um controle de chaves: "quem pegou a chave X?" e "o que
// o Fulano pegou?". Aqui entram portador, chave e tipo de movimentação.
//
// A montagem vive fora do componente de página para poder ser testada contra o
// banco sem renderizar nada — e para concentrar num ponto só a consulta que a
// migração para Postgres vai tornar assíncrona.

/** Vocabulário fechado de ações — também alimenta o seletor da UI. */
export const HISTORY_ACTIONS = [
    { value: 'withdraw', label: 'Retirada' },
    { value: 'return', label: 'Devolução' },
    { value: 'transfer', label: 'Transferência' },
] as const;

const ACTION_VALUES = new Set(HISTORY_ACTIONS.map(a => a.value as string));

export const HISTORY_PAGE_SIZE = 50;

export interface HistoryFilters {
    date?: string;
    month?: string;
    hour?: string;
    userId?: string;
    /**
     * TETO imposto pelo servidor, e NÃO um valor padrão para `userId`
     * (TASK-088, ADR-015 emendado).
     *
     * Quando presente, a consulta é restrita a este usuário e o `userId` vindo da
     * query string é **ignorado**. A distinção é a segurança inteira: aplicar a
     * restrição como default de `userId` deixaria um FUNCIONARIO passar
     * `?userId=outro` e ler o histórico alheio — trocando uma exposição por outra,
     * pior porque a página pareceria escopada.
     *
     * ADMIN, GESTOR e PORTEIRO chamam sem este campo e continuam podendo filtrar
     * por usuário, que é a pergunta central do sistema: "quem pegou a chave X?".
     */
    restritoAoUsuarioId?: number;
    keyId?: string;
    action?: string;
    /**
     * TASK-135 — busca livre pelo nome da chave, pela sala ou pela pessoa. Sem acento e
     * sem maiúscula dos dois lados; `%` e `_` valem como letra. Vai como PARÂMETRO, e o
     * teto (`restritoAoUsuarioId`) continua valendo: a busca estreita, nunca alarga.
     */
    q?: string;
    page?: number;
    limit?: number;
}

export interface HistoryQuery {
    sql: string;
    countSql: string;
    params: (string | number)[];
    countParams: (string | number)[];
    page: number;
    limit: number;
    offset: number;
}

const SELECT = `
        SELECT h.id, h.action, h.timestamp,
               k.name as key_name, k.room,
               COALESCE(u.full_name, u.username) as employee_name,
               p.username as confirmed_by,
               kt.justification
        FROM history h
        LEFT JOIN keys k ON h.key_id = k.id
        LEFT JOIN users u ON h.user_id = u.id
        LEFT JOIN key_transactions kt ON h.transaction_id = kt.id
        LEFT JOIN users p ON kt.porteiro_id = p.id`;

// Sem acento e sem maiúscula nos dois lados da comparação, sem depender da extensão
// `unaccent` (o Supabase a tem, a base de teste não): o banco aplica `translate` na
// coluna, e o termo chega já normalizado do JavaScript. As maiúsculas acentuadas estão no
// mapa e o `translate` vem ANTES do `lower`: com locale C, `lower('Á')` não vira `á`.
const COM_ACENTO = 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
const SEM_ACENTO = 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn';
const semAcento = (coluna: string) => `lower(translate(${coluna}, '${COM_ACENTO}', '${SEM_ACENTO}'))`;

/**
 * Termo de busca pronto para ILIKE: sem acento, minúsculo, e com `%` e `_` valendo como
 * letra. O caractere de escape é `!` (ESCAPE '!'), e não a barra invertida: a barra
 * atravessa JavaScript, template string e SQL, e em cada camada vira outra coisa.
 */
function padraoDeBusca(q: string): string {
    const termo = q.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    return `%${termo.replace(/[!%_]/g, c => '!' + c)}%`;
}

/** Id positivo, ou null quando ausente/inválido — filtro impossível é ignorado, não quebra a tela. */
function parseId(raw?: string): number | null {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}

export function buildHistoryQuery(filters: HistoryFilters): HistoryQuery {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    // Marcador posicional NUMERADO do Postgres. O indice sai do tamanho corrente
    // de `params`, e nao de contagem manual: assim numero e valor nao podem
    // divergir conforme os filtros entram e saem. Trocar $n entre dois filtros
    // nao daria erro de sintaxe — daria o resultado errado, em silencio.
    const p = (deslocamento = 0) => `$${params.length + 1 + deslocamento}`;

    // Filtros temporais: faixa [início, fim) em UTC a partir do fuso do operador (TASK-055).
    if (filters.date) {
        const { startIso, endIso } = localDayRangeUtc(filters.date);
        conditions.push(`h.timestamp >= ${p()} AND h.timestamp < ${p(1)}`);
        params.push(startIso, endIso);
    }
    if (filters.month) {
        const { startIso, endIso } = localMonthRangeUtc(filters.month);
        conditions.push(`h.timestamp >= ${p()} AND h.timestamp < ${p(1)}`);
        params.push(startIso, endIso);
    }
    if (filters.hour) {
        // to_char no lugar de strftime. O fuso NAO se move para o SQL:
        // localHourToUtcHour (TASK-055) ja converte a hora do operador para UTC.
        conditions.push(`to_char(h.timestamp AT TIME ZONE 'UTC', 'HH24') = ${p()}`);
        params.push(localHourToUtcHour(filters.hour));
    }

    // O teto vence o filtro. Ver `restritoAoUsuarioId` na interface: se isto
    // virar `filters.userId ?? filters.restritoAoUsuarioId`, a restricao passa a
    // ser sobrescrivivel pela URL e o escopo deixa de existir.
    const userId = filters.restritoAoUsuarioId ?? parseId(filters.userId);
    if (userId !== null && userId !== undefined) {
        conditions.push(`h.user_id = ${p()}`);
        params.push(userId);
    }

    const keyId = parseId(filters.keyId);
    if (keyId !== null) {
        conditions.push(`h.key_id = ${p()}`);
        params.push(keyId);
    }

    // Ação fora do vocabulário conhecido é descartada: um valor arbitrário vindo
    // da URL não deve virar condição nem filtrar tudo para fora sem explicação.
    if (filters.action && ACTION_VALUES.has(filters.action)) {
        conditions.push(`h.action = ${p()}`);
        params.push(filters.action);
    }

    if (filters.q && filters.q.trim()) {
        const i = p();
        const casa = (coluna: string) => `${semAcento(coluna)} ILIKE ${i} ESCAPE '!'`;
        conditions.push(`(${casa('k.name')} OR ${casa("COALESCE(k.room, '')")} OR ${casa('COALESCE(u.full_name, u.username)')})`);
        params.push(padraoDeBusca(filters.q));
    }

    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

    const limit = filters.limit ?? HISTORY_PAGE_SIZE;
    const page = Math.max(1, Math.floor(filters.page ?? 1) || 1);
    const offset = (page - 1) * limit;

    return {
        sql: `${SELECT}${where} ORDER BY h.timestamp DESC LIMIT ${p()} OFFSET ${p(1)}`,
        // A contagem leva as mesmas junções da busca (`k`, `u`): sem elas, a condição do `q`
        // referenciaria tabelas que não estão na consulta.
        countSql: `SELECT COUNT(*) as total FROM history h LEFT JOIN keys k ON h.key_id = k.id LEFT JOIN users u ON h.user_id = u.id${where}`,
        params: [...params, limit, offset],
        countParams: params,
        page,
        limit,
        offset,
    };
}
