# Runbook de Operação — UniFafire · Sistema de Gerenciamento de Chaves

> ## ➜ O runbook vivo é **[`runbook-deploy.md`](./runbook-deploy.md)**
>
> Deploy, secrets, migrations, bootstrap do primeiro ADMIN, backup, restauração,
> ping de saúde e incidentes estão lá.

## Por que este arquivo ficou

O conteúdo original (TASK-036, Sprint 7) descrevia a topologia anterior — PM2
numa máquina da instituição, banco em arquivo `keys.db`, atalhos `.bat`,
restauração por botão na tela de configurações. **Nada disso existe desde a
Sprint 23** (TASK-079), e cada uma dessas instruções levaria quem a seguisse a
procurar um arquivo, um serviço ou um botão que não está mais lá — no dia em que
menos se pode perder tempo.

O arquivo não foi apagado porque guarda uma evidência de conformidade que não se
refaz: o ensaio de restauração exigido pela constitution §4.3.

## Evidência histórica — ensaio de restauração (TASK-036)

| Data | Procedimento | Resultado |
|---|---|---|
| 2026-07-02 | Restauração manual em sandbox: cópia → backup → corrupção proposital do banco → restauração pelo procedimento da época → verificação | ✅ `PRAGMA integrity_check = ok`; 18 usuários e 12 registros de histórico preservados (contagens idênticas pré/pós) |

> ⚠️ **Este ensaio validou um procedimento que não existe mais.** Ele foi feito
> sobre SQLite (`PRAGMA integrity_check`), com cópia de arquivo. Serve como
> registro de que o ensaio foi conduzido no seu tempo — **não** como evidência de
> que a restauração atual funciona.
>
> O ensaio do procedimento vigente está pendente e é rastreado em
> [`runbook-deploy.md` §6.6](./runbook-deploy.md#66-ensaio-de-restauração-semestral--constitution-43).
