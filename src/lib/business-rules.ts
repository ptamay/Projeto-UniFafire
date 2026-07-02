// TASK-034 — regras de negócio do spec §5, centralizadas (client-safe: sem imports
// de servidor). Alterar estes valores exige Change Request no spec.md.

/** Chave em atraso: retirada há mais de N horas sem devolução (spec §5). */
export const OVERDUE_HOURS = 12;

/** Dupla confirmação saudável: portador confirma em até N minutos (spec §5, alvo ≥95%). */
export const DOUBLE_CONFIRMATION_TARGET_MINUTES = 10;
