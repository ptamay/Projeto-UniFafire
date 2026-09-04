// PERFIL DE AMBIENTE (constitution §8) — TASK-060, extraído na TASK-076.
//
// Vivia dentro de `security-profile.ts`, que importa `./pg`. O `proxy.ts` roda
// no **Edge Runtime**, onde o driver Postgres não existe — então qualquer coisa
// que o proxy precise consultar sobre o ambiente tem de morar num módulo SEM
// dependência de runtime Node. Daí este arquivo não importar nada.
//
// O default é `production`: ausência ou erro de configuração nunca pode relaxar
// um controle de segurança. Só o literal exato 'dev' seleciona o perfil frouxo.

export type AppEnv = 'dev' | 'production';

export function appEnv(): AppEnv {
    return process.env.APP_ENV === 'dev' ? 'dev' : 'production';
}
