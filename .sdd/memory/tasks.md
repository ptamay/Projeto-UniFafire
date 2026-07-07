# tasks.md — Micro-spec da Sprint Ativa (Sprint 12 · 🔴 crítica)

> REQ-027 (ADR-008) — Solicitação de chave em uso ao portador (fluxo "pull").
> Reutiliza a máquina de `transfer` com papéis invertidos: `user_id` = solicitante
> (já confirmado ao iniciar) · `porteiro_id` = portador atual (pendente de aceite).
> Sem migration (nenhuma alteração de schema). Fatias verticais, TDD atômico.

## TASK-043: API — solicitação de chave em uso e aceite pela contraparte (REQ-027)
**Contexto**: Um usuário comum (FUNCIONARIO/ALUNO) que NÃO está com a chave pode solicitá-la
diretamente ao portador atual. A solicitação nasce como transação `transfer` pendente onde o
solicitante já consentiu (iniciou) e o portador precisa aceitar. O aceite reusa
`POST /api/transactions/[id]/user-confirm`, que deve reconhecer o portador comum como a
contraparte válida (`tx.porteiro_id === session.id`) — sem conceder esse poder por papel.

**Critérios BDD**:
- [ ] **Cenário**: Criação da solicitação pull
      Dado que a chave X está `in_use` com o usuário A (portador)
      E que o usuário B (comum) não está com a chave
      Quando B envia `action: 'transfer'` para a chave X com destino a si mesmo
      Então o sistema cria uma `key_transactions` `transfer` com status `pending`,
        `user_id` = B, `porteiro_id` = A, `user_confirmed_at` preenchido e `porteiro_confirmed_at` NULL
      E a chave permanece `in_use` com A até o aceite.
- [ ] **Cenário**: Portador aceita e a chave muda de mãos
      Dado uma solicitação pull pendente (B solicitou a chave de A)
      Quando A confirma via `user-confirm`
      Então a transação passa a `completed`, `keys.user_id` passa a B, a chave segue `in_use`
      E um registro `transfer` é gravado no histórico.
- [ ] **Cenário**: Autorização estrita do aceite (anti-escalação)
      Dado uma solicitação pull pendente (B solicitou a chave de A)
      Quando um terceiro usuário comum C (que não é A nem B) chama `user-confirm`
      Então a API retorna 403 e a transação permanece `pending`.
- [ ] **Cenário**: Recusa = cancelamento pelo portador
      Dado uma solicitação pull pendente (B solicitou a chave de A)
      Quando A cancela a transação via `/cancel`
      Então o status vira `cancelled`, a chave continua `in_use` com A e B não pode mais aceitá-la.
- [ ] **Cenário**: Bloqueio por pendência existente
      Dado que já existe uma transação pendente para a chave X
      Quando outro usuário tenta solicitar a mesma chave
      Então a API rejeita (400) sem criar segunda transação.
- [ ] **Cenário** (regressão preservada): solicitante deve ser o destino
      Dado um usuário comum B iniciando a solicitação
      Quando o destino informado não é o próprio B
      Então a API rejeita (403) — usuário comum só solicita a chave para si mesmo.

## TASK-044: UI — solicitar a chave e aceitar/recusar (REQ-027)
**Contexto**: No Dashboard, todo usuário já vê quem é o portador da chave em uso. Falta ao
não-portador a ação de solicitar. No mobile, o toque no card em uso (hoje inerte para o
não-portador) passa a oferecer "Solicitar esta chave"; no desktop, um botão na linha. O
portador aceita ou recusa em `/confirm`, com texto contextual de quem pediu.

**Critérios BDD**:
- [ ] **Cenário**: Ação de solicitar no card mobile / linha desktop
      Dado que a chave X está `in_use` com A e o usuário B (comum) não é o portador
      Quando B abre o Dashboard
      Então B vê o portador A e uma ação "Solicitar" para a chave X
      E ao confirmar, uma solicitação pull é enviada (toast de sucesso).
- [ ] **Cenário**: Estado "já solicitada"
      Dado que existe uma solicitação pendente para a chave X
      Quando qualquer usuário visualiza o card/linha de X
      Então o estado exibido é "Aguardando"/"já solicitada" e a ação de solicitar não se repete
      E o solicitante e o portador têm a opção de cancelar.
- [ ] **Cenário**: Aceite/recusa pelo portador em /confirm
      Dado que B solicitou a chave que está com A
      Quando A acessa `/confirm`
      Então A vê um card contextual ("B solicitou a chave X que está com você") com aceitar e recusar
      E aceitar completa a transferência; recusar cancela a pendência.
- [ ] **Cenário**: Não-portador não vê Devolver para chave alheia
      Dado que a chave X está com A
      Quando B (comum, não portador) visualiza X
      Então B não vê "Devolver" nem "Transferir" — apenas "Solicitar" (regressão do quick-fix preservada).

## TASK-045: E2E smoke do fluxo pull (REQ-027)
**Contexto**: Cobrir o fluxo pull ponta a ponta pela UI real em desktop e mobile (Playwright),
já que a task toca o fluxo crítico de troca de posse de chave (spec §4).

**Critérios BDD**:
- [ ] **Cenário**: Ciclo pull completo em desktop e mobile
      Dado o aluno A com a chave em uso e o aluno B sem a chave
      Quando B solicita a chave pela UI e A aceita em `/confirm`
      Então a chave aparece como em uso por B ao fim do fluxo, nos dois viewports (375×812 e 1280×800)
      E nenhuma tela gera scroll horizontal (REQ-016).
