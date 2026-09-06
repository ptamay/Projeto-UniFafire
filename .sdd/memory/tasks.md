# tasks.md — Micro-spec da Sprint Ativa (Sprint 24 · 🟡 padrão, com uma task 🔴)

> **Faxina da tela de configurações — CR Tipo C, ADR-013.** A primeira sprint depois do
> go-live, e ela existe porque a tela mente.
>
> Canal: Claude Code · Modelo: Sonnet 5 para as tasks de remoção, **Opus 5 para a TASK-083**
> (toca controle de sessão e senha padrão — constitution §2).
>
> Nenhum requisito muda. O sistema não ganha capacidade nenhuma: ele para de anunciar
> capacidades que não tem.

---

## O que esta sprint corrige, e por que é agora

Seis afirmações falsas na `/settings`, todas resíduo da topologia desmontada nas Sprints
21–23. Quatro são inércia — controles que gravam e ninguém lê. **Duas são defeitos vivos**,
e um deles derruba um controle de segurança da constitution §2.

E uma sétima, encontrada ao preparar esta micro-spec, que virou a mais urgente das três
tasks. Está na D3.

---

## Decisões de execução

**D1 — Remover, não consertar.** Fazer "Horário do Backup" e "Retenção" funcionarem exigiria
credencial de escrita no GitHub **dentro da aplicação**, para reescrever o `cron` do workflow
e apagar dumps no repositório privado. Superfície nova e permanente, por um controle que
ninguém pediu e que o runbook já cobre. Rejeitado no ADR-013.

**D2 — Rota morta sai junto com o botão.** `restore`, `import` e o `POST /api/backups`
respondem 503 desde as TASK-068/070. Handler que responde 503 para sempre é pior que a
ausência dele: sugere uma capacidade em manutenção, quando a capacidade não existe mais.

**D3 — `startCronJobs()` sai, e esta é a task de maior valor da sprint.** Medido em produção
em 2026-09-06, menos de duas horas depois do go-live:

```
cron_desativado   52 linhas   ← 87% da trilha
route_timing       4 linhas
audit_action       4 linhas
```

`src/instrumentation.ts` chama `startCronJobs()` a cada inicialização de instância, e a
função existe apenas para **gravar um log dizendo que não faz nada**. Em execução serverless
isso é um cold start atrás do outro. A constitution §7 diz que `app_logs` **nunca entra em
rotina de limpeza** — então esse ruído é permanente e cresce para sempre, num plano de 500 MB,
dentro da tabela que existe para responder "o que aconteceu?" num incidente.

Uma trilha de auditoria em que 87% das linhas anunciam a inexistência de um agendador é uma
trilha pior do que nenhuma: ela treina quem a lê a ignorá-la.

**D4 — A correção do dado de produção NÃO é desta sprint.** As linhas sintéticas de
`settings` (`auto_logout_time = "30"`) se corrigem por operação, não por deploy. A task
garante que um valor inválido **herdado** não quebre mais o recurso; trocar o valor é do
runbook.

---

## TASK-084: a trilha de auditoria para de ser inundada pelo próprio sistema

**Contexto**: 52 das 60 linhas de `app_logs` em produção são `cron_desativado`. Primeira task
por ser a única com efeito imediato em produção — e porque cada dia que passa acumula ruído
que a §7 proíbe limpar.

**Critérios BDD**:
- [ ] **Cenário**: O agendador que não existe deixa de se anunciar
      Dado que `node-cron` não agenda nada desde a TASK-070
      Então `startCronJobs()` não existe mais em `src/lib/backup.ts`
      E `src/instrumentation.ts` não a invoca
      E nenhuma inicialização de instância escreve em `app_logs`.
- [ ] **Cenário**: A dependência morta sai do `package.json`
      Dado que nada mais importa `node-cron`
      Então `node-cron` e `@types/node-cron` saem das dependências
      E o Gate 1 continua verde (nenhum import sem pacote declarado).
- [ ] **Cenário**: O que a trilha deve registrar continua registrando
      Dado um `audit_action` e um `route_timing`
      Quando eles ocorrem
      Então continuam gravando em `app_logs` normalmente
      E a remoção não tocou no `structured-logger`.
- [ ] **Cenário**: O `instrumentation.ts` some se não sobrar nada nele
      Dado que a única coisa que ele fazia era chamar `startCronJobs`
      Então o arquivo é removido inteiro, e não deixado como casca vazia.

---

## TASK-082: a tela de configurações deixa de prometer o que o sistema não faz

**Contexto**: ADR-013, decisões 1 e 2.

**Critérios BDD**:
- [ ] **Cenário**: Os controles inertes saem da tela
      Dada a tela `/settings`
      Então não há campo "Horário do Backup" nem "Retenção (quantidade de backups)"
      E não há botão "Gerar Backup Agora"
      E não sobra estado nem handler órfão no componente.
- [ ] **Cenário**: No lugar deles, o estado real
      Dado o card de Backup
      Então ele informa que o backup é diário às 03:00 (America/Recife) pelo GitHub Actions
      E que a retenção é o histórico do repositório privado
      E onde disparar uma execução manual.
- [ ] **Cenário**: O card "Importar Banco (.db)" sai
      Dada a tela `/settings`
      Então não há campo de importação de arquivo `.db`
      E o handler de importação não existe mais.
- [ ] **Cenário**: As rotas mortas somem
      Dado o repositório
      Então `/api/backups/restore` e `/api/backups/import` não existem
      E `POST /api/backups` não existe
      E `createBackup()` sai de `src/lib/backup.ts` — função cujo único propósito era recusar
      uma operação que ninguém consegue mais disparar é código morto.
- [ ] **Cenário**: O que lê fato permanece
      Dada a tela `/settings`
      Então o card de confiabilidade e a lista de execuções continuam lá
      E continuam lendo `backup_runs`.
- [ ] **Cenário**: O contrato acompanha
      Dado `docs/api-contract.md`
      Então as três rotas removidas não aparecem mais como disponíveis.

---

## TASK-083: o logout automático volta a disparar, e a senha padrão tem uma fonte só

**Contexto**: ADR-013, decisões 3 e 4. 🔴 **crítica** — toca controle de sessão e senha
padrão (constitution §2).

**Critérios BDD**:
- [ ] **Cenário**: Valor inválido herdado não quebra mais o logout
      Dado `settings.auto_logout_time` com um valor fora de `HH:MM` (hoje, em produção: `"30"`)
      Quando a configuração é lida
      Então a leitura recusa o valor inválido e usa o padrão explícito
      E o logout automático dispara no horário padrão em vez de nunca disparar.
- [ ] **Cenário**: A tela nunca exibe um campo de hora vazio por dado inválido
      Dado o mesmo valor inválido
      Quando a tela carrega
      Então o campo mostra o padrão em uso, não vazio.
- [ ] **Cenário**: A senha padrão de reset tem UMA fonte
      Dado que hoje `GET /api/settings` devolve `'saojose123'` e as rotas que aplicam a senha
      usam `'unifafire123'`
      Então passa a existir uma constante única
      E as três rotas a consomem
      E não há literal de senha padrão espalhado.
- [ ] **Cenário**: O ADMIN lê na tela a senha que o sistema realmente aplica
      Dada a ausência do registro em `settings`
      Quando o ADMIN reseta a senha de um usuário
      Então a senha aplicada é a mesma exibida na tela.

---

## Definition of Done da sprint

- [ ] Os 3 pares `test(TASK-NNN)` → `feat(TASK-NNN)` na ordem, suíte inteira verde a cada um
- [ ] `./scripts/ci-gates.sh` limpo (6 gates), `tsc --noEmit` 0, `eslint` 0
- [ ] `npm audit` sem HIGH/CRITICAL — lido inteiro
- [ ] `npm run build` verde **sem `DATABASE_URL` definida**
- [ ] App exercitado no navegador — **último passo, depois da suíte**
- [ ] **Verificação em PRODUÇÃO após o deploy:** `app_logs` para de receber
      `cron_desativado`. É a única prova de que a TASK-084 funcionou, e ela só existe
      depois do merge.
- [ ] Fase 11 + Memory Sync

> **Fora da DoD, porque é operação e não deploy:** corrigir as linhas sintéticas de
> `settings` em produção. Entra no runbook.
