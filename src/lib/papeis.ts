// O nome de cada papel como a pessoa lê — "Aluno", não "ALUNO" (TASK-133 · ADR-031).
//
// O código do papel (ALUNO, PORTEIRO…) é identificador de banco e de permissão; na tela
// ele aparecia cru, em maiúsculas, embaixo do nome de quem está com a chave. Uma fonte só
// para o rótulo: as permissões (`schemas.ts`), o menu e o Dashboard leem daqui. Módulo
// sem dependência nenhuma — o Dashboard é componente de cliente e não deve puxar o zod.

export const ROTULO_DO_PAPEL = {
    ADMIN: 'Administrador',
    GESTOR: 'Gestor',
    PORTEIRO: 'Porteiro',
    FUNCIONARIO: 'Funcionário',
    ALUNO: 'Aluno',
} as const;

/** Rótulo legível do papel; papel desconhecido volta como veio (nunca some da tela). */
export function rotuloDoPapel(papel: string | null | undefined): string {
    if (!papel) return '';
    return (ROTULO_DO_PAPEL as Record<string, string>)[papel] ?? papel;
}
