/**
 * Tema claro/escuro — uma decisão só, aplicada antes da primeira pintura
 * (TASK-132 · ADR-031 · REQ-033e).
 *
 * Sem escolha salva, segue o aparelho (`prefers-color-scheme`); com escolha salva,
 * ela vence. Antes o escuro era o padrão absoluto: quem usa o celular no pátio, no
 * sol, com o aparelho no modo claro, abria o sistema escuro.
 *
 * A chave e os valores do `localStorage` ('theme' = 'light' | 'dark') são os que o
 * botão de tema já gravava — quem escolheu antes continua com a sua escolha.
 */

export type Tema = 'light' | 'dark';

export const CHAVE_TEMA = 'theme';

/** A decisão, sem navegador: testável e igual à do script abaixo. */
export function temaInicial(salvo: string | null, prefereClaro: boolean): Tema {
    if (salvo === 'light' || salvo === 'dark') return salvo;
    return prefereClaro ? 'light' : 'dark';
}

/**
 * Roda no `<head>`, antes de o corpo aparecer: aplicado num `useEffect`, o tema de
 * quem prefere claro piscaria escuro a cada carregamento. O `try` cobre o
 * `localStorage` bloqueado (aba anônima com cookies bloqueados), que lança: sem ele,
 * o script derrubaria o `<head>`; com ele, a página abre no padrão do CSS (escuro).
 * Mesma regra de `temaInicial` — o teste roda os dois e compara.
 */
export const SCRIPT_TEMA =
    `(function(){try{var s=localStorage.getItem('${CHAVE_TEMA}');` +
    `var claro=s==='light'||(s!=='dark'&&window.matchMedia('(prefers-color-scheme: light)').matches);` +
    `if(claro)document.documentElement.classList.add('light-mode');}catch(e){}})();`;

/** O tema em vigor, lido do documento — quem aplicou foi o script do `<head>`. */
export function temaAtual(): Tema {
    return document.documentElement.classList.contains('light-mode') ? 'light' : 'dark';
}

/** Troca o tema e grava a escolha: a partir daí ela vence o aparelho. */
export function aplicarTema(tema: Tema): void {
    document.documentElement.classList.toggle('light-mode', tema === 'light');
    try {
        localStorage.setItem(CHAVE_TEMA, tema);
    } catch {
        // Armazenamento bloqueado: o tema vale só para esta visita.
    }
}
