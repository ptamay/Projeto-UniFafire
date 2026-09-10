# Ensaio — 202609090900_sem_senha_compartilhada

> Gerado por `node db/runner-migracoes.mjs ensaiar` (TASK-107 · ADR-022). **Não editar à
> mão:** a guarda confere o checksum, e o ensaio de outra versão do UP não vale.

- up (sha256): 98d690567622dc808e49a9f226b500888a5ffadb5e0b28970635e03cc857456f
- ensaiado em: 2026-09-10
- sobre: backups/2026/09/2026-09-09.sql.gz (cópia restaurada em base descartável)
- por que exige ensaio: `DELETE FROM settings WHERE key = 'default_reset_password'` · `UPDATE users SET password_hash = NULL WHERE requires_password_change A`
- resultado: ok

## Linhas por comando

| comando | linhas |
|---|---|
| DELETE | 1 |
| UPDATE | 0 |

## Tabelas cuja contagem mudou

| tabela | antes | depois |
|---|---|---|
| settings | 4 | 3 |

## Ida e volta sobre os dados

UP → DOWN → schema idêntico ao de antes → UP de novo: **ok**.
