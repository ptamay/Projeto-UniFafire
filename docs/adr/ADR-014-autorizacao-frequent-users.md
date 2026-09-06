# ADR-014 — `/api/metrics/frequent-users` valida sessão, não papel

- **Status:** Aceito
- **Data:** 2026-09-06
- **Tipo de Change Request:** C (mudança em feature já implementada)
- **Relacionado:** constitution §3.2, REQ-021 (Ação Rápida Inteligente), ADR-003
- **Origem:** enumeração da superfície de API para escrever `docs/api-contract.md`

## Contexto

Ao enumerar as rotas para escrever o contrato de API — um débito registrado na
Sprint 24 —, a comparação lado a lado das três rotas de métricas expôs uma
assimetria:

| Rota | Checagem de papel |
|---|---|
| `/api/metrics/business` | `['ADMIN','GESTOR','PORTEIRO'].includes(session.role)` |
| `/api/metrics/frequent-keys` | `['ADMIN','GESTOR','PORTEIRO'].includes(session.role)` |
| `/api/metrics/frequent-users` | **nenhuma** — só `verifySession` |

A rota confirma que há sessão válida e segue. Qualquer usuário autenticado —
**incluindo ALUNO e FUNCIONARIO** — pode chamar
`/api/metrics/frequent-users?keyId=N` e receber, dos cinco usuários que mais
retiraram aquela chave:

- `id`, `username`, `full_name`
- `role`
- a contagem de retiradas

`keyId` é um inteiro sequencial. Enumerar é trivial. O resultado é um mapa de quem
frequenta qual sala.

## Por que a guarda existente não guarda

O único consumidor é `DashboardClient.tsx:532`, e ele chama a rota dentro de
`if (isPorteiroOrAdmin)`. **Isso é gating de interface, não autorização.** A
constitution §3.2 trata o caso pelo nome:

> "Toda rota de API valida a sessão E a permissão no servidor. Checagem só no
> client = vulnerabilidade, não feature."

O proxy da TASK-077 também não cobre: ele garante que existe sessão — e foi
deliberado que ele **não** autorize papel, porque roda no Edge Runtime sem acesso
ao banco e porque duplicar a decisão criaria dois lugares para divergir. A
verificação de papel é do handler, por desenho. Este handler não a faz.

## O que torna isto uma exposição de dados pessoais

Não é vazamento de credencial nem de chave. É pior do que parece à primeira
vista e menos grave do que um vazamento de senha: são **nomes reais, matrículas
implícitas no username, papéis e padrões de comportamento** de funcionários e
alunos, servidos a qualquer um que tenha uma conta no sistema — incluindo o perfil
com menos privilégio de todos.

## Decisão

Alinhar a rota com as duas irmãs: restringir a **ADMIN, GESTOR e PORTEIRO**, que é
exatamente o conjunto que a interface já pressupõe.

**Não é mudança de comportamento para nenhum uso legítimo.** O único consumidor já
só chama a rota nesse perfil; o que muda é que agora o servidor garante o que a
tela presumia.

## Alternativas consideradas

**Remover a rota.** Rejeitada: ela tem consumidor real e entrega valor — a Ação
Rápida ordena os sugeridos por frequência (REQ-021). Removê-la degradaria uma
feature entregue para consertar uma checagem ausente.

**Devolver menos dados a papéis baixos** (por exemplo, só a contagem, sem nomes).
Rejeitada: não há caso de uso para um ALUNO consumir esta rota. Meia-autorização
é mais superfície para manter e raciocinar, não menos.

**Confiar no gating de interface.** É o estado atual, e é o que a §3.2 nomeia como
vulnerabilidade.

## Consequências

**Positivas**
- Fecha a exposição, e alinha as três rotas de métricas na mesma regra.
- O contrato de API nasce descrevendo a superfície correta, e não uma com defeito.

**Negativas / riscos**
- Nenhum uso legítimo é afetado. Se alguma tela futura precisar da informação para
  papéis menores, isso volta como Change Request próprio — com o caso de uso na
  mão, que é o que falta hoje.

## Como isto passou

Vale registrar, porque a lição é reutilizável: a rota foi escrita com a checagem
de sessão e sem a de papel, e **nada acusou**. Não há teste que exija papel por
rota, o proxy por desenho não cobre, e a tela nunca a chamou de um perfil baixo —
então o defeito não tinha sintoma. Foi preciso **enumerar a superfície inteira e
comparar rotas irmãs** para vê-lo.

O débito do `api-contract.md`, aberto na Sprint 24, pagou-se antes mesmo de o
arquivo existir.

## Implementação

Pelo ciclo TDD, nunca ad-hoc:

- **TASK-085** — `/api/metrics/frequent-users` passa a validar papel, e nenhuma
  outra rota fica sem a checagem que declara precisar
- **TASK-086** — `docs/api-contract.md`, com a superfície real e a matriz de papéis
