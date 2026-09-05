import { formatTimestamp } from './time-filters';

// TASK-075 (Sprint 23 · Etapa 7b do ADR-012) — como a confiabilidade do backup
// se apresenta. REQ-009, spec §5.
//
// ## Por que isto não vive no JSX
//
// A versão anterior desenhava o bloco assim:
//
//     {bkpReliability && bkpReliability.totalDays > 0 && ( ... )}
//
// Quando não havia execução nenhuma, o bloco inteiro sumia da tela. E "sem
// backup nenhum" é justamente a leitura que essa métrica existe para dar: a
// única condição em que ela precisa gritar é a única em que ela ficava calada.
// Uma tela sem bloco é indistinguível de uma tela em que está tudo bem.
//
// Condicional em componente não tem teste. A decisão de qual estado mostrar
// passa a ser função pura, testada nos quatro casos; o componente só renderiza o
// que ela responder. Mesma razão que tirou a reconciliação do YAML do workflow
// na TASK-078: a parte que decide fica onde dá para verificar.
//
// ## Por que este arquivo é separado de `backup.ts`
//
// `backup.ts` lê o Postgres e por isso importa `pg`. Este módulo é importado
// pelo `SettingsClient`, que é componente de cliente — juntá-los arrastaria o
// driver do banco para o bundle do navegador.

/** O que a métrica responde. `percent` é `null` quando não houve execução
 *  DENTRO da janela — nunca 0, que significa "rodou e falhou". */
export interface BackupReliability {
    totalDays: number;
    successDays: number;
    percent: number | null;
    lastRun: {
        ranAt: string;
        succeeded: boolean;
        sizeBytes: number | null;
        error: string | null;
        destination: string | null;
    } | null;
}

export type EstadoConfiabilidade = 'sem-execucao' | 'parada' | 'falhando' | 'parcial' | 'integra';

export interface DescricaoConfiabilidade {
    estado: EstadoConfiabilidade;
    /** Tom visual. Só `integra` é bom — o alvo da spec §5 é 100%. */
    tom: 'bom' | 'ruim' | 'alerta';
    titulo: string;
    detalhe: string;
}

/**
 * Traduz a métrica no que a tela mostra.
 *
 * Os cinco estados existem porque três deles se pareciam:
 *
 * - `sem-execucao` — nada registrado, nunca. O backup não está montado.
 * - `parada`       — já rodou, mas nada na janela. É o pior tipo de silêncio:
 *                    parece igual ao anterior no número, e não é igual em nada
 *                    mais. Alguém confiou e o mecanismo parou.
 * - `falhando`     — rodou e nenhum dia terminou bem. 0% é um número REAL aqui.
 * - `parcial`      — rodou, alguns dias falharam. Abaixo do alvo.
 * - `integra`      — 100% dos dias com execução terminaram verificados.
 */
export function descreverConfiabilidade(m: BackupReliability, dias = 30): DescricaoConfiabilidade {
    if (m.percent === null) {
        if (!m.lastRun) {
            return {
                estado: 'sem-execucao',
                tom: 'alerta',
                titulo: 'Nenhuma execução de backup registrada',
                detalhe:
                    'O backup automático ainda não rodou. Enquanto isso, não há cópia dos dados ' +
                    'para restaurar.',
            };
        }
        return {
            estado: 'parada',
            tom: 'ruim',
            titulo: `Sem execução nos últimos ${dias} dias`,
            detalhe: `A última execução foi em ${formatTimestamp(m.lastRun.ranAt)} e ` +
                `${m.lastRun.succeeded ? 'terminou verificada' : 'FALHOU'}.`,
        };
    }

    const contagem = `${m.successDays} de ${m.totalDays} dias com backup verificado`;

    if (m.percent === 0) {
        return {
            estado: 'falhando',
            tom: 'ruim',
            titulo: '0% — todas as execuções falharam',
            detalhe: `${contagem}. ` +
                (m.lastRun?.error ? `Último erro: ${m.lastRun.error}` : 'Verifique a execução do workflow.'),
        };
    }

    if (m.percent < 100) {
        return {
            estado: 'parcial',
            tom: 'ruim',
            titulo: `${m.percent}% de confiabilidade (alvo: 100%)`,
            detalhe: `${contagem} nos últimos ${dias} dias.`,
        };
    }

    return {
        estado: 'integra',
        tom: 'bom',
        titulo: '100% de confiabilidade',
        detalhe: `${contagem} nos últimos ${dias} dias.`,
    };
}
