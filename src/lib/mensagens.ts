// Mensagens de erro das telas, em um lugar só (TASK-136 · ADR-031).
//
// A crítica final do CR da interface do celular deu 2/4 em "recuperação de erro": as telas
// diziam "Erro de conexão." ou "Erro ao atualizar." — o problema, sem o que fazer. Para quem
// tem pouca instrução, a mensagem precisa dizer o que aconteceu e o PRÓXIMO PASSO. Quando o
// servidor manda um motivo (`data.error`), ele vem primeiro; estas são o que sobra.

/** Falha de rede: o pedido nem chegou ao sistema. */
export const SEM_CONEXAO = 'Sem conexão com o sistema. Confira a internet e tente de novo.';

/** O sistema respondeu com erro e não disse o motivo. */
export function naoDeuPara(acao: string): string {
    return `Não deu para ${acao}. Tente de novo; se continuar, avise o administrador.`;
}
