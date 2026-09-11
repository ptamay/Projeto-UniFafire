// TASK-112 (ADR-024) — a agenda do backup: o que o ADMIN configura, e quando o
// workflow deve executar. TASK-113: e por quantos dias os dumps ficam guardados
// (`db/enviar-backup.mjs` aplica).
//
// JavaScript puro, de propósito: a rota da aplicação (`src/`) e o script do workflow
// (`db/agenda-backup.mjs`, no GitHub Actions) usam a MESMA política. `db/` pode
// importar de `src/`; o contrário não — `db/` nem sobe para a Vercel (TASK-100).
//
// Horário de Recife = UTC−3 o ano inteiro: Pernambuco não tem horário de verão desde
// 2000, e o Brasil aboliu em 2019. Offset fixo em vez de fuso nomeado para não depender
// da base de fusos do ambiente que roda (runner do Actions, função da Vercel).

export const OFFSET_RECIFE_HORAS = -3;

/** Chaves em `settings`. NÃO são as antigas `backup_time`/`backup_retention_count`:
 *  aquelas vieram da carga sintética da TASK-067, e reaproveitá-las faria um valor
 *  válido e esquecido virar, em silêncio, a agenda de produção. */
export const CHAVES = {
    hora: 'backup_hora',
    vezes: 'backup_vezes_por_dia',
    // TASK-113 — também nova: `backup_retention_count` valia "7" em produção e contava
    // ARQUIVOS, não dias. Saiu na migration `202609101700_settings_orfas_de_backup`.
    dias: 'backup_retencao_dias',
};

export const AGENDA_PADRAO = { hora: 3, vezes: 1, dias: 7 };

/** Mínimo de 1 vez por dia: é o RPO de 24 h da constitution §4.3. Até 4: mais que
 *  isso guarda dumps com PII por uma precisão que o atraso do GitHub desfaz.
 *  Retenção de 3 a 30 dias (TASK-113, ADR-024 decisão 2): abaixo de 3, um dump ruim e
 *  verificado por azar deixaria pouca escolha; acima de 30, é PII guardada sem motivo. */
export const LIMITES = { hora: [0, 23], vezes: [1, 4], dias: [3, 30] };

function inteiroNaFaixa(bruto, [min, max], padrao) {
    const s = String(bruto ?? '').trim();
    if (!/^-?\d+$/.test(s)) return padrao;
    const n = Number(s);
    return n >= min && n <= max ? n : padrao;
}

/**
 * A agenda a partir das linhas de `settings` ({chave: valor}). Valida na LEITURA,
 * campo a campo: valor herdado inválido cai no padrão daquele campo. É a lição da
 * Sprint 24 — um `"30"` de carga sintética manteve o logout inerte em produção porque
 * só o POST validava.
 */
export function lerAgenda(settings) {
    return {
        hora: inteiroNaFaixa(settings?.[CHAVES.hora], LIMITES.hora, AGENDA_PADRAO.hora),
        vezes: inteiroNaFaixa(settings?.[CHAVES.vezes], LIMITES.vezes, AGENDA_PADRAO.vezes),
        dias: inteiroNaFaixa(settings?.[CHAVES.dias], LIMITES.dias, AGENDA_PADRAO.dias),
    };
}

/** As horas do dia (de Recife) em que há backup, em ordem: espaçadas igualmente a
 *  partir da hora escolhida. 24 é divisível por 1, 2, 3 e 4. */
export function horariosDoDia({ hora, vezes }) {
    const passo = 24 / vezes;
    return Array.from({ length: vezes }, (_, k) => (hora + k * passo) % 24).sort((a, b) => a - b);
}

/** O instante (UTC) do último horário agendado que já passou até `agora`. */
export function ultimoHorarioVencido(agora, agenda) {
    const offsetMs = OFFSET_RECIFE_HORAS * 3600_000;
    const local = new Date(agora.getTime() + offsetMs);
    const inicioDoDiaLocalUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMs;
    let melhor = null;
    for (const dias of [0, -1]) {
        for (const h of horariosDoDia(agenda)) {
            const t = inicioDoDiaLocalUtc + dias * 86_400_000 + h * 3600_000;
            if (t <= agora.getTime() && (melhor === null || t > melhor)) melhor = t;
        }
    }
    return new Date(melhor);
}

/**
 * O portão do workflow. NÃO pergunta "é a hora?": o GitHub atrasa agendas sob carga, e
 * um disparo das 03:00 que sai às 04:05 pularia o dia inteiro. Pergunta: **há um
 * horário vencido sem backup bem-sucedido depois dele?** Recupera disparo atrasado ou
 * perdido, e não duplica o que já foi feito.
 *
 * Uma falha não conta como feito: o portão tenta de novo na hora seguinte, até
 * conseguir — o RPO pede um backup, e não uma tentativa.
 */
export function deveExecutar({ agora, agenda, ultimoSucesso }) {
    const horario = ultimoHorarioVencido(agora, agenda);
    const executar = !ultimoSucesso || ultimoSucesso.getTime() < horario.getTime();
    return { executar, horario };
}

/** "03:00 e 15:00" — para a tela. */
export function descreverHorarios(agenda) {
    const hs = horariosDoDia(agenda).map(h => `${String(h).padStart(2, '0')}:00`);
    return hs.length === 1 ? hs[0] : `${hs.slice(0, -1).join(', ')} e ${hs[hs.length - 1]}`;
}
