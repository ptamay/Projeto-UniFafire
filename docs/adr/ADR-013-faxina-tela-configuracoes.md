# ADR-013 — A tela de configurações deixa de prometer o que o sistema não faz

- **Status:** Aceito
- **Data:** 2026-09-06
- **Tipo de Change Request:** C (mudança em feature já implementada)
- **Relacionado:** ADR-012 (migração Supabase + Vercel), REQ-031, constitution §4.3 e §7
- **Origem:** revisão da tela `/settings` logo após o go-live de 2026-09-06

## Contexto

O go-live expôs uma tela de configurações que descreve um sistema que deixou de
existir. Seis afirmações dela são falsas hoje, e todas nasceram verdadeiras: são
resíduo da topologia anterior (PM2 numa máquina da instituição, banco SQLite em
arquivo, backup por cópia local), desmontada entre as Sprints 21 e 23.

**Os quatro controles inertes:**

1. **"Horário do Backup"** — gravado em `settings.backup_time`. Nenhum código o lê
   desde que o agendamento saiu do `node-cron` (TASK-070). O horário real é o
   `cron` de `.github/workflows/backup.yml`.
2. **"Retenção (quantidade de backups)"** — gravado em
   `settings.backup_retention_count`, também sem leitor. A tela ainda afirma que
   "backups mais antigos serão removidos automaticamente"; **nada remove**. A
   retenção real é o histórico do repositório privado de dumps.
3. **Botão "Gerar Backup Agora"** — `POST /api/backups` responde 503 desde a
   TASK-070. A geração é do job agendado.
4. **Card "Importar Banco (.db)"** — oferece substituir o banco por um arquivo
   **SQLite**, formato que saiu do runtime na Sprint 21. As rotas
   `/api/backups/restore` e `/api/backups/import` respondem 503 desde a TASK-068.

**E dois defeitos encontrados ao verificar os quatro acima:**

5. **O logout automático não dispara.** `Sidebar.tsx` compara a hora corrente
   (`"14:35"`) com `settings.auto_logout_time`, cujo valor em produção é `"30"` —
   não é um horário. A comparação nunca casa. O `<input type="time">` da tela
   também não consegue exibir `"30"`, então o campo aparece **vazio**. Este é
   diferente dos quatro primeiros: o recurso *deveria* funcionar, o consumidor
   está correto, e o que está errado é o dado.
6. **`default_reset_password` tem dois padrões divergentes.**
   `GET /api/settings` devolve `'saojose123'` na ausência do registro; as rotas
   que de fato aplicam a senha (`users/route.ts`, `users/reset-password/route.ts`)
   usam `'unifafire123'`. Se a linha sumir, o ADMIN lê uma senha na tela e o
   sistema aplica outra. Hoje está latente — a linha existe —, e `'saojose'` é o
   nome antigo do projeto, anterior ao próprio UniFafire.

### Como os dados sintéticos chegaram à produção

Na limpeza da base para o go-live, `settings` foi **deliberadamente preservada**,
sob o argumento de que era "configuração do sistema, não dado sintético". O
argumento estava errado: as quatro linhas eram da carga sintética da TASK-067.

```
auto_logout_time        = 30           ← quebra o logout automático
backup_time             = 02:00        ← inerte
backup_retention_count  = 7            ← inerte
default_reset_password  = trocar123    ← em uso, mas valor de teste
```

É a origem direta do defeito 5. Registrado aqui porque a lição é reutilizável:
**"configuração" não é sinônimo de "legítimo"** — uma tabela de configuração
povoada por seed sintético carrega valores de teste para produção sem nenhum
sintoma no momento da carga.

## Decisão

**Remover o que não é verdade e mostrar o que é.** A tela passa a refletir o
sistema que existe, em vez de descrever o que foi desmontado.

1. **Os controles de agendamento e retenção saem**, junto com o botão de geração
   manual. No lugar, texto informativo com o estado real: backup diário às 03:00
   (America/Recife) pelo GitHub Actions, retenção pelo histórico do repositório
   privado, e onde disparar uma execução manual (`Run workflow`).
2. **O card "Importar Banco (.db)" sai, e com ele as rotas** `backups/restore` e
   `backups/import`. Restaurar passa a ser exclusivamente o procedimento com
   credencial do `docs/runbook-deploy.md` §6.5.
3. **O logout automático volta a funcionar**, com o valor de `auto_logout_time`
   validado na escrita **e** na leitura — hoje o schema valida no POST, mas nada
   protege um valor herdado.
4. **O padrão de `default_reset_password` passa a ser único**, definido num lugar
   só e consumido pelas três rotas.

**O que permanece:** o card de confiabilidade do backup e a lista de execuções
(TASK-075). Eles leem `backup_runs` — fato, não promessa — e são o único lugar do
sistema onde se descobre que o backup parou.

## Alternativas consideradas

**Fazer os controles funcionarem de verdade.** O horário teria de reescrever o
`cron` do workflow e a retenção teria de apagar dumps antigos no repositório
privado. Ambos exigem credencial de escrita no GitHub **dentro da aplicação** —
superfície de ataque nova e permanente, em favor de um controle que ninguém
pediu e que o runbook já cobre. Rejeitada.

**Deixar como está.** Rejeitada pelo mesmo motivo que motivou a TASK-075: a única
leitura que importa numa tela de operação é a ruim, e um controle que finge
funcionar é pior que a ausência dele. O operador só descobre no incidente.

**Trocar a importação de `.db` por carga de CSV/planilha.** É feature nova, não
faxina — seria Tipo A, com sprint própria. A skill `carga-dados` existe para
isso. Fora de escopo deste ADR.

## Consequências

**Positivas**
- A tela deixa de afirmar o falso; o que ela mostra passa a ser verificável.
- Duas rotas somem da superfície pública (`restore`, `import`).
- O logout automático — um controle de segurança da constitution §2 — volta a
  funcionar.
- A divergência de senha padrão deixa de existir antes de causar incidente.

**Negativas / riscos**
- Quem esperava configurar o horário do backup pela tela precisa do runbook. É
  troca deliberada: o horário é infraestrutura, e infraestrutura tem runbook.
- Remover rotas é mudança de contrato. Nenhum cliente externo consome esta API
  (aplicação e tela são o mesmo deploy), então o risco é baixo — mas o
  `docs/api-contract.md` precisa acompanhar.
- As linhas sintéticas de `settings` em produção precisam ser corrigidas por
  operação, não por deploy. Fica no runbook.

## Implementação

Pelo ciclo TDD normal, **nunca ad-hoc** (regra `40-change-request.md`):

- **TASK-082** — a tela de configurações deixa de prometer o que o sistema não faz
- **TASK-083** — o logout automático volta a disparar, e a senha padrão tem uma
  fonte só

Ambas no backlog do `plan.md`.
