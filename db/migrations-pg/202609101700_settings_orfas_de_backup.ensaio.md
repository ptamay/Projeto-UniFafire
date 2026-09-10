# Ensaio — 202609101700_settings_orfas_de_backup

> Gerado por `node db/runner-migracoes.mjs ensaiar` (TASK-107 · ADR-022). **Não editar à
> mão:** a guarda confere o checksum, e o ensaio de outra versão do UP não vale.

- up (sha256): add7ea04afdf72f1809ceb170646327aad2fa7486af4f4daf74a35e307d1c8c1
- ensaiado em: 2026-09-10
- sobre: backups/2026/09/2026-09-10.sql.gz (cópia restaurada em base descartável)
- por que exige ensaio: `DELETE FROM settings WHERE key IN ('backup_time', 'backup_retention_co`
- resultado: ok

## Linhas por comando

| comando | linhas |
|---|---|
| DELETE | 2 |

## Tabelas cuja contagem mudou

| tabela | antes | depois |
|---|---|---|
| settings | 3 | 1 |

## Ida e volta sobre os dados

UP → DOWN → schema idêntico ao de antes → UP de novo: **ok**.
