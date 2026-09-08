import { z } from 'zod';

// Roles disponíveis no sistema
export const ROLES = ['ADMIN', 'GESTOR', 'PORTEIRO', 'FUNCIONARIO', 'ALUNO'] as const;
export type Role = typeof ROLES[number];

// Permissões por role
export const ROLE_PERMISSIONS: Record<Role, {
    label: string;
    canManageKeys: boolean;      // Pode operar chaves (porteiro)
    canManageUsers: boolean;     // Pode gerenciar usuários
    canViewHistory: boolean;     // Pode ver histórico
    canViewDashboard: boolean;   // Pode ver dashboard
    canViewLogs: boolean;        // Pode ver logs de auditoria
    canManageSettings: boolean;  // Pode alterar configurações
    canConfirmTransaction: boolean; // Pode confirmar transações (usuário final)
}> = {
    ADMIN: {
        label: 'Administrador',
        canManageKeys: true,
        canManageUsers: true,
        canViewHistory: true,
        canViewDashboard: true,
        canViewLogs: true,
        canManageSettings: true,
        canConfirmTransaction: false,
    },
    GESTOR: {
        label: 'Gestor',
        canManageKeys: true,
        canManageUsers: true,
        canViewHistory: true,
        canViewDashboard: true,
        canViewLogs: false,
        canManageSettings: true,
        canConfirmTransaction: false,
    },
    PORTEIRO: {
        label: 'Porteiro',
        canManageKeys: true,
        canManageUsers: false,
        canViewHistory: true,
        canViewDashboard: true,
        canViewLogs: false,
        canManageSettings: false,
        canConfirmTransaction: false,
    },
    FUNCIONARIO: {
        label: 'Funcionário',
        canManageKeys: false,
        canManageUsers: false,
        canViewHistory: false,
        canViewDashboard: false,
        canViewLogs: false,
        canManageSettings: false,
        canConfirmTransaction: true,
    },
    ALUNO: {
        label: 'Aluno',
        canManageKeys: false,
        canManageUsers: false,
        canViewHistory: false,
        canViewDashboard: false,
        canViewLogs: false,
        canManageSettings: false,
        canConfirmTransaction: true,
    },
};

// Users
// TASK-093 (ADR-017) — `password` saiu daqui, e o único consumidor é
// `POST /api/users`. Criar usuário deixou de aceitar senha: a conta nasce com um
// código de uso único e a pessoa define a própria senha no primeiro acesso.
// Manter o campo faria a API aceitar e IGNORAR o que lhe mandam, que é a mesma
// mentira de tela que o ADR-013 veio combater — só que no contrato.
export const UserSchema = z.object({
    username: z.string().min(3, "O usuário deve ter pelo menos 3 caracteres.").max(50, "Máximo de 50 caracteres.").optional(),
    role: z.enum(ROLES).default('FUNCIONARIO'),
    full_name: z.string().min(2, "Nome completo deve ter ao menos 2 caracteres.").optional(),
    matricula: z.string().optional(),
    phone: z.string().optional(),
});

export const ChangePasswordSchema = z.object({
    userId: z.number().int().positive(),
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "A nova senha deve ter no mínimo 8 caracteres.")
});

export const ChangeRoleSchema = z.object({
    targetUserId: z.number().int().positive(),
    newRole: z.enum(ROLES)
});

// Keys
export const KeySchema = z.object({
    id: z.number().int().positive().optional(),
    name: z.string().min(2, "Nome da chave deve ter no mínimo 2 caracteres."),
    room: z.string().optional()
});

// Employees (mantido para compatibilidade com histórico)
export const TransactionSchema = z.object({
    action: z.enum(['withdraw', 'return', 'transfer']),
    key_id: z.number().int().positive("ID da chave inválido."),
    user_id: z.number().int().positive("ID do usuário inválido.").nullable().optional(),
    // Bypass (CR)
    bypassConfirmation: z.boolean().optional(),
    justification: z.string().optional(),
    observation: z.string().optional(),
});

// Settings
export const SettingsSchema = z.object({
    time: z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, "Formato de hora inválido (HH:MM).").optional(),
});
