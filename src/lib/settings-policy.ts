// TASK-083 (Sprint 24 · CR Tipo C, ADR-013 decisões 3 e 4) — a política das
// configurações que têm consequência. constitution §2.
//
// ## Por que este módulo existe
//
// Duas configurações do sistema não são preferências: uma derruba sessões e a
// outra define a senha que um usuário recebe. Elas estavam espalhadas — o valor
// padrão num lugar, a validação em outro, e um terceiro lugar com um padrão
// diferente. Cada dispersão dessas foi um defeito real:
//
// - `auto_logout_time` valia `"30"` em produção. A tela e o consumidor esperam
//   `HH:MM`; a comparação nunca casava e **o logout jamais disparou**.
// - `default_reset_password` tinha DOIS padrões: `'saojose123'` na rota que a
//   exibe e `'unifafire123'` nas que a aplicam. O ADMIN leria uma e o sistema
//   aplicaria outra.
//
// Aqui é o único lugar onde esses valores existem. É puro de propósito: o
// `Sidebar` (cliente) e as rotas (servidor) importam o mesmo módulo, e não há
// como um lado divergir do outro sem que este arquivo mude.

/** Horário em que o sistema força o logout de todos. */
export const AUTO_LOGOUT_PADRAO = '18:30';

/** Senha aplicada quando um usuário é criado sem senha ou tem o acesso resetado.
 *  UM valor, consumido pela rota que o exibe e pelas duas que o aplicam. */
export const SENHA_PADRAO_RESET = 'unifafire123';

const HORA_VALIDA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Lê um horário de logout vindo do banco, recusando o que não for `HH:MM`.
 *
 * ## Por que validar na LEITURA, se o POST já valida
 *
 * O schema do POST protege o que entra **a partir de agora**. Não protege nada
 * do que já está gravado: um valor herdado de um seed, de uma migração ou de uma
 * versão anterior do schema nunca passou por aquela fronteira, e por isso passa
 * por baixo dela. Foi exatamente o caso do `"30"` em produção — carga sintética
 * da TASK-067, escrita antes de a validação existir.
 *
 * Validação só na entrada assume que a entrada sempre existiu. Dado herdado é a
 * refutação dessa premissa.
 *
 * Recusar e usar o padrão é preferível a propagar: um horário inválido não
 * "desliga" o logout automático — desliga em silêncio, que é a pior forma.
 */
export function lerAutoLogoutTime(bruto: string | null | undefined): string {
    if (typeof bruto !== 'string') return AUTO_LOGOUT_PADRAO;
    const limpo = bruto.trim();
    return HORA_VALIDA.test(limpo) ? limpo : AUTO_LOGOUT_PADRAO;
}

/**
 * O relógio CRUZOU o horário de logout entre a verificação anterior e esta?
 *
 * ## Por que cruzamento, e não igualdade nem `>=`
 *
 * A versão anterior comparava `agora === alvo` a cada 60 s. Um tick atrasado
 * pula o minuto e o logout não acontece naquele dia — e navegadores estrangulam
 * timers em aba de fundo, então o atraso é o caso comum, não o raro. Igualdade
 * exata sobre um alvo móvel falha por construção.
 *
 * `agora >= alvo` consertaria o disparo e quebraria outra coisa: qualquer login
 * depois do horário cairia fora imediatamente, tornando o sistema inutilizável à
 * noite. A borda que interessa é a **transição** — a sessão estava aberta antes
 * do horário e o horário chegou.
 *
 * Comparação de strings `HH:MM` é lexicográfica e, com zero à esquerda, coincide
 * com a cronológica. Não há data envolvida: o alvo é uma hora do dia.
 */
export function cruzouOHorario(anterior: string, agora: string, alvo: string): boolean {
    return anterior < alvo && agora >= alvo;
}
