// A trilha de ações lida em português (TASK-137 · emenda do ADR-031).
//
// O código gravado em `action_logs.action` (LOGIN_SUCCESS, KEY_RETURNED…) é o registro da
// trilha e não muda — a trilha é imutável (ADR-026), e filtros e relatórios dependem dele.
// O que muda é a LEITURA: a tela dos Logs mostra a ação em palavra, com o código pequeno ao
// lado. `tests/trilha-legivel.test.ts` confere que todo código que o sistema grava tem
// rótulo aqui — um código novo sem rótulo apareceria cru, sem nenhum teste perceber.
//
// Módulo sem dependência de servidor: os Logs são componente de cliente.

import { rotuloDoPapel } from './papeis';

export const ROTULO_DA_ACAO: Record<string, string> = {
    // Entrada e saída
    LOGIN_SUCCESS: 'Entrou no sistema',
    LOGIN_FAILED: 'Senha errada ao entrar',
    LOGOUT: 'Saiu do sistema',
    RATE_LIMIT_EXCEEDED: 'Tentativas demais ao entrar',
    ACCOUNT_LOCKOUT: 'Conta bloqueada por tentativas',
    // Senha e perfil
    CHANGE_PASSWORD: 'Trocou a senha',
    PASSWORD_RESET: 'Senha redefinida',
    RESET_PASSWORD: 'Gerou código de acesso',
    CHANGE_ROLE: 'Mudou o perfil de acesso',
    UPDATE_PROFILE: 'Atualizou o próprio perfil',
    // Usuários
    CREATE_USER: 'Cadastrou usuário',
    UPDATE_USER: 'Editou usuário',
    DELETE_USER: 'Removeu usuário',
    REACTIVATE_USER: 'Reativou usuário',
    // Chaves
    CREATE_KEY: 'Cadastrou chave',
    UPDATE_KEY: 'Editou chave',
    DELETE_KEY: 'Removeu chave',
    // Movimentação
    TRANSACTION_INITIATED: 'Iniciou movimentação',
    TRANSACTION_BYPASS: 'Movimentou sem confirmação',
    TRANSACTION_CANCELLED: 'Cancelou movimentação',
    KEY_WITHDRAWN: 'Chave retirada',
    KEY_RETURNED: 'Chave devolvida',
    KEY_TRANSFERRED: 'Chave passada para outra pessoa',
    // Limpeza
    CLEAR_HISTORY: 'Limpou o histórico',
    CLEAR_DATABASE: 'Limpou o banco de dados',
    // Backup e restauração
    BACKUP_AGENDA_ALTERADA: 'Mudou a agenda do backup',
    BACKUP_MANUAL_SOLICITADO: 'Pediu backup agora',
    BACKUP_MANUAL_FALHOU: 'Backup pedido falhou',
    RESTAURACAO_SOLICITADA: 'Pediu restauração',
    RESTAURACAO_ENSAIADA: 'Ensaiou restauração',
    RESTAURACAO_RECUSADA: 'Restauração recusada',
    RESTAURACAO_FALHOU: 'Restauração falhou',
    BACKUP_RESTAURADO: 'Backup restaurado',
};

/** A ação em palavra; código desconhecido volta como foi gravado (a trilha não esconde nada). */
export function rotuloDaAcao(codigo: string | null | undefined): string {
    if (!codigo) return '';
    return ROTULO_DA_ACAO[codigo] ?? codigo;
}

// O alvo gravado quando não é uma chave nem uma pessoa. "System" e "Self" não dizem nada a
// quem lê (a ação já diz "Entrou no sistema", "Trocou a senha"): somem da linha.
const ALVOS: Record<string, string> = {
    System: '',
    Self: '',
    'History Table': 'Histórico',
    Database: 'Banco de dados',
    settings: 'Configurações',
    backup: 'Backup',
};

/** O alvo do registro como a pessoa lê; nome de chave ou de usuário passa como está. */
export function alvoLegivel(alvo: string | null | undefined): string {
    if (!alvo) return '';
    return ALVOS[alvo] ?? alvo;
}

// Os detalhes que o sistema gravava em inglês até a TASK-137. Desde ela, são gravados em
// português; os registros antigos continuam como foram gravados e são LIDOS por esta tabela.
// Cada linha é o texto exato (ou o molde) que o código escrevia.
const DETALHES_ANTIGOS: [RegExp, (...partes: string[]) => string][] = [
    [/^User logged in$/, () => 'Entrou com usuário e senha'],
    [/^Invalid password$/, () => 'Senha errada'],
    [/^User changed their password via security page$/, () => 'Trocou a senha na tela de segurança'],
    [/^User changed default password on first login$/, () => 'Trocou a senha no primeiro acesso'],
    [/^User updated their own profile$/, () => 'Atualizou o próprio perfil'],
    [/^Updated user info$/, () => 'Dados do usuário atualizados'],
    [/^User reactivated with new data$/, () => 'Usuário reativado com dados novos'],
    [/^IP (.+) limit exceeded$/, ip => `Tentativas demais do IP ${ip}`],
    [/^Account locked out for IP (.+)$/, ip => `Conta bloqueada para o IP ${ip}`],
    [/^Changed role from (\S+) to (\S+)$/, (de, para) => `Perfil: ${rotuloDoPapel(de)} → ${rotuloDoPapel(para)}`],
    [/^New user created with role: (\S+)$/, papel => `Perfil: ${rotuloDoPapel(papel)}`],
    [/^Deleted user (.+) \((\S+)\)$/, (u, papel) => `Usuário ${u} (${rotuloDoPapel(papel)}) removido`],
    [/^Room: N\/A$/, () => 'Sem sala'],
    [/^Room: (.+)$/, sala => `Sala: ${sala}`],
    [/^Deleted key (.+) - (.+)$/, (chave, sala) => `Chave ${chave} (${sala}) removida`],
    [/^Changed from: (.+) to (.+)$/, (antes, depois) => `Era ${antes}, agora ${depois}`],
];

/** O detalhe do registro em português: os antigos, gravados em inglês, pela tabela acima. */
export function detalheLegivel(detalhe: string | null | undefined): string {
    if (!detalhe) return '';
    for (const [molde, traduzir] of DETALHES_ANTIGOS) {
        const m = detalhe.match(molde);
        if (m) return traduzir(...m.slice(1));
    }
    return detalhe;
}
