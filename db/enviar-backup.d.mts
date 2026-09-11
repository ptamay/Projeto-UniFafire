// Tipos do envio com retenção (db/enviar-backup.mjs) — TASK-113.

export interface PlanoDePoda {
    manter: string[];
    apagar: string[];
    /** Primeiro dia (AAAA-MM-DD, Recife) que fica na janela. */
    primeiroDia: string;
}

export interface OpcoesDoEnvio {
    /** URL do repositório privado (no workflow, com o token embutido). */
    remoto: string;
    arquivoLocal: string;
    agora: Date;
    /** Retenção em dias (3–30), ou `null` quando a agenda não pôde ser lida: aí nada é apagado. */
    dias: number | null;
    dirTrabalho?: string;
    log?: (mensagem: string) => void;
    /** Só para teste: simula quem grava no remoto entre o clone e o push. */
    depoisDoClone?: () => void | Promise<void>;
}

export interface ResultadoDoEnvio {
    caminho: string;
    /** `null` quando a retenção era desconhecida e nada foi planejado. */
    manter: string[] | null;
    apagar: string[];
}

export function nomeDoArquivo(agora: Date): string;
export function planejarPoda(opcoes: { arquivos: string[]; novo: string; agora: Date; dias: number }): PlanoDePoda;
export function enviarBackup(opcoes: OpcoesDoEnvio): Promise<ResultadoDoEnvio>;
