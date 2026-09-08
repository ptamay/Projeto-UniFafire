import { randomInt } from 'crypto';

// TASK-093 (CR Tipo C · ADR-017) — o código de uso único que substitui a senha
// padrão compartilhada. constitution §2.1, §2.4.
//
// ## O que este módulo NÃO é
//
// Não é um gerador de senha. A distinção é o eixo inteiro do ADR-017: uma senha
// pertence à pessoa e ninguém mais pode conhecê-la; um código de acesso é um
// bilhete de entrada, de uso único e prazo curto, que existe justamente para ser
// entregue em mãos. É por isso que devolvê-lo na resposta da API não esbarra na
// §2.1 — nenhuma senha trafega.
//
// ## O alfabeto
//
// Sem `0`/`O`, `1`/`I`/`l`. Não é preciosismo tipográfico: o código é **ditado no
// balcão** e digitado por outra pessoa. Para quem escuta, "zero" e "ó" são o
// mesmo som, e na tela `1`, `I` e `l` são a mesma risquinha. Cada ambiguidade
// vira tentativa falha — e tentativa falha conta para o lockout, então o desenho
// brigaria com a defesa que o protege.
//
// Também sem minúsculas: quem transcreve à mão não preserva caixa, e um código
// que falha por causa disso manda a pessoa de volta ao balcão.

/** 31 símbolos, todos inconfundíveis quando ditos em voz alta ou lidos na tela. */
export const ALFABETO_DO_CODIGO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** 9 símbolos sobre 31 → ~44 bits. Acima do piso de 40 que o teste exige, e ainda
 *  dizível em três blocos de três sem ninguém perder a conta. */
const COMPRIMENTO = 9;

/** Quanto tempo o código vale. A pessoa está do outro lado do balcão: o prazo
 *  cobre o caminho até um computador e um contratempo, sem virar uma senha
 *  paralela que dura o dia. */
export const VALIDADE_DO_CODIGO_MINUTOS = 30;

/**
 * Um código novo, imprevisível.
 *
 * `crypto.randomInt` e não `Math.random`: o segundo é determinístico a partir de
 * um estado interno e não foi feito para nada que proteja uma conta. Um gerador
 * previsível transformaria o código na senha compartilhada de novo — bastaria
 * saber quando alguém foi resetado.
 */
export function gerarCodigoDeAcesso(): string {
    let codigo = '';
    for (let i = 0; i < COMPRIMENTO; i++) {
        codigo += ALFABETO_DO_CODIGO[randomInt(ALFABETO_DO_CODIGO.length)];
    }
    return codigo;
}

/** O instante em que um código emitido agora deixa de valer. */
export function expiracaoDoCodigo(agora: Date = new Date()): Date {
    return new Date(agora.getTime() + VALIDADE_DO_CODIGO_MINUTOS * 60_000);
}

/**
 * O código venceu?
 *
 * Sem prazo é tratado como VENCIDO, e não como eterno. É a mesma postura da
 * `lerAutoLogoutTime` (TASK-083): diante de dado que não deveria existir, recusar
 * é sempre mais seguro do que adivinhar — e aqui adivinhar para o lado permissivo
 * seria ressuscitar exatamente o acesso que não expira.
 */
export function codigoExpirou(expiraEm: Date | string | null | undefined, agora: Date = new Date()): boolean {
    if (!expiraEm) return true;
    const limite = expiraEm instanceof Date ? expiraEm : new Date(expiraEm);
    return Number.isNaN(limite.getTime()) || limite.getTime() <= agora.getTime();
}
