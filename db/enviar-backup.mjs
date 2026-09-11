// TASK-113 (ADR-024, decisão 2) — envia o dump verificado ao repositório privado e
// aplica a retenção, apagando DE VERDADE o que sai da janela.
//
// ## Por que reescrever o histórico
//
// Tirar um arquivo da pasta não o apaga: ele continua no histórico do git, com a PII de
// todo mundo, para sempre. Com retenção conhecida, este script publica o repositório
// como UM commit sem pai, só com os arquivos da janela, e força o push. O que sai da
// janela deixa de ser alcançável por qualquer ref. (O GitHub remove fisicamente os
// objetos inalcançáveis na coleta de lixo dele, em prazo que não controlamos — runbook
// §6.2.)
//
// ## As guardas
//
// - só é chamado DEPOIS da restauração de verificação, no mesmo job (`backup.yml`);
// - o dump novo é sempre mantido: o repositório nunca termina sem backup;
// - retenção fora de 3–30 dias é recusada, não corrigida;
// - retenção DESCONHECIDA (`--dias ""`: a agenda não pôde ser lida) não apaga nada —
//   só acrescenta o dump, num commit comum;
// - arquivo que não tem nome de backup nunca é apagado;
// - o push forçado leva `--force-with-lease`: se o remoto mudou depois do clone, é
//   recusado em vez de atropelar quem gravou no meio.
//
// Uso (no workflow):
//   GH_TOKEN=... BACKUP_REPO=dono/repo node db/enviar-backup.mjs --arquivo dump.sql.gz --dias "$RETENCAO"
// Imprime `destino=<repo>:<caminho>` no formato do `$GITHUB_OUTPUT`.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { OFFSET_RECIFE_HORAS, LIMITES } from '../src/lib/agenda-backup.mjs';

const DIA_MS = 86_400_000;
const PREFIXO = 'backups/';
// `backups/AAAA/MM/AAAA-MM-DDTHHMMSSZ.sql.gz` (desde a TASK-113) ou o nome por dia de
// antes dela, `backups/AAAA/MM/AAAA-MM-DD.sql.gz` — que era a data UTC de uma execução
// às ~06h UTC, ou seja, o mesmo dia em Recife.
const NOME_DE_BACKUP = /^backups\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?\.sql\.gz$/;

const doisDigitos = (n) => String(n).padStart(2, '0');

/** O caminho do dump no repositório, com hora (UTC): dois backups no mesmo dia não se
 *  sobrescrevem. Sem ":" — o repositório é clonado em Windows. */
export function nomeDoArquivo(agora) {
    const a = agora.getUTCFullYear();
    const m = doisDigitos(agora.getUTCMonth() + 1);
    const d = doisDigitos(agora.getUTCDate());
    const hms = [agora.getUTCHours(), agora.getUTCMinutes(), agora.getUTCSeconds()].map(doisDigitos).join('');
    return `${PREFIXO}${a}/${m}/${a}-${m}-${d}T${hms}Z.sql.gz`;
}

/** 'AAAA-MM-DD' do instante no horário de Recife. */
function diaEmRecife(instanteMs) {
    return new Date(instanteMs + OFFSET_RECIFE_HORAS * 3600_000).toISOString().slice(0, 10);
}

/** O dia (de Recife) de um arquivo de backup, ou null se o nome não é de backup. */
function diaDoArquivo(caminho) {
    const m = NOME_DE_BACKUP.exec(caminho);
    if (!m) return null;
    const [, data, hh, mm, ss] = m;
    if (hh === undefined) return data;
    return diaEmRecife(Date.parse(`${data}T${hh}:${mm}:${ss}Z`));
}

/**
 * O que fica e o que sai. A janela é de DIAS de Recife, contando hoje: com 7, ficam
 * hoje e os 6 anteriores — com um backup por dia, exatamente 7 arquivos.
 */
export function planejarPoda({ arquivos, novo, agora, dias }) {
    const [min, max] = LIMITES.dias;
    if (!Number.isInteger(dias) || dias < min || dias > max) {
        throw new Error(`retenção inválida (${dias}): tem de ser um inteiro de ${min} a ${max} dias — nada é apagado`);
    }
    if (!NOME_DE_BACKUP.test(novo)) {
        throw new Error(`o dump novo tem nome fora do padrão (${novo}) — nada é apagado`);
    }
    if (!arquivos.includes(novo)) {
        throw new Error(`o dump novo (${novo}) não está entre os arquivos — nada é apagado`);
    }
    const primeiroDia = diaEmRecife(agora.getTime() - (dias - 1) * DIA_MS);
    const manter = [];
    const apagar = [];
    for (const arquivo of arquivos) {
        const dia = diaDoArquivo(arquivo);
        // Nome que não é de backup: não se apaga o que não se entende.
        if (arquivo === novo || dia === null || dia >= primeiroDia) manter.push(arquivo);
        else apagar.push(arquivo);
    }
    return { manter, apagar, primeiroDia };
}

function ocultarCredencial(texto) {
    return String(texto).replace(/\/\/[^/@\s]+@/g, '//***@');
}

function git(cwd, args) {
    try {
        return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (e) {
        // A URL do remoto carrega o token; a mensagem de erro do git pode repeti-la.
        throw new Error(ocultarCredencial(`git ${args[0]} falhou: ${e.stderr || e.message}`));
    }
}

/**
 * Clona, acrescenta o dump e, com retenção conhecida, publica só a janela como um commit
 * sem pai. `depoisDoClone` existe para o teste simular quem grava no remoto no meio.
 */
export async function enviarBackup({ remoto, arquivoLocal, agora, dias, dirTrabalho = os.tmpdir(), log = () => {}, depoisDoClone }) {
    const tamanho = fs.existsSync(arquivoLocal) ? fs.statSync(arquivoLocal).size : 0;
    if (tamanho === 0) throw new Error(`dump ausente ou vazio (${arquivoLocal}) — nada é enviado nem apagado`);

    const dir = fs.mkdtempSync(path.join(dirTrabalho, 'destino-'));
    try {
        git(dirTrabalho, ['clone', '--quiet', '--depth', '1', remoto, dir]);
        const ramo = git(dir, ['symbolic-ref', '--short', 'HEAD']);
        const base = git(dir, ['rev-parse', 'HEAD']);
        git(dir, ['config', 'user.name', 'backup-bot']);
        git(dir, ['config', 'user.email', 'backup-bot@users.noreply.github.com']);
        await depoisDoClone?.();

        const caminho = nomeDoArquivo(agora);
        fs.mkdirSync(path.dirname(path.join(dir, caminho)), { recursive: true });
        fs.copyFileSync(arquivoLocal, path.join(dir, caminho));
        git(dir, ['add', '--', caminho]);

        if (dias === null) {
            // Retenção desconhecida: acrescenta, e só. Push comum — nada é reescrito.
            git(dir, ['commit', '--quiet', '-m', `backup verificado ${agora.toISOString()} (retenção desconhecida: nada apagado)`]);
            git(dir, ['push', '--quiet', 'origin', `HEAD:refs/heads/${ramo}`]);
            log(`[retenção] desconhecida — ${caminho} enviado, nenhum backup apagado`);
            return { caminho, manter: null, apagar: [] };
        }

        const arquivos = git(dir, ['ls-files', '-z']).split('\0').filter(Boolean);
        const { manter, apagar, primeiroDia } = planejarPoda({ arquivos, novo: caminho, agora, dias });
        for (const arquivo of apagar) git(dir, ['rm', '--quiet', '--', arquivo]);

        const backups = manter.filter(a => NOME_DE_BACKUP.test(a)).sort();
        git(dir, ['checkout', '--quiet', '--orphan', 'retencao']);
        git(dir, ['commit', '--quiet', '-m',
            `backup verificado ${agora.toISOString()}; retenção ${dias} dias (desde ${primeiroDia}, Recife): ${backups.length} backup(s)`]);
        git(dir, ['push', '--quiet', `--force-with-lease=refs/heads/${ramo}:${base}`, 'origin', `HEAD:refs/heads/${ramo}`]);
        log(`[retenção] ${dias} dias, desde ${primeiroDia}: ${backups.length} mantido(s), ${apagar.length} apagado(s)` +
            (apagar.length ? ` — ${apagar.join(', ')}` : ''));
        return { caminho, manter, apagar };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function argumento(nome) {
    const i = process.argv.indexOf(`--${nome}`);
    return i === -1 ? undefined : process.argv[i + 1];
}

const ESTE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === ESTE) {
    const arquivo = argumento('arquivo');
    const brutoDias = (argumento('dias') ?? '').trim();
    // Vazio = a agenda não pôde ser lida. Qualquer outra coisa tem de ser número — e o
    // `planejarPoda` recusa o que estiver fora da faixa.
    const dias = brutoDias === '' ? null : Number(brutoDias);
    const repo = process.env.BACKUP_REPO;
    const remoto = process.env.BACKUP_REMOTO
        ?? `https://x-access-token:${process.env.GH_TOKEN}@github.com/${repo}.git`;
    try {
        if (!arquivo) throw new Error('uso: node db/enviar-backup.mjs --arquivo <dump.sql.gz> --dias <3–30 | "">');
        const r = await enviarBackup({ remoto, arquivoLocal: path.resolve(arquivo), agora: new Date(), dias, log: m => console.error(m) });
        process.stdout.write(`destino=${repo}:${r.caminho}\n`);
    } catch (e) {
        console.error(ocultarCredencial(`[enviar-backup] ${e?.message || e}`));
        process.exit(1);
    }
}
