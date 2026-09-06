# ADR-014 — rotas que validam sessão e não papel

- **Status:** Aceito
- **Data:** 2026-09-06 · **emendado no mesmo dia** (achado 2: `GET /api/settings`)
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

### Achado 2 — `GET /api/settings` devolve a senha padrão de reset a qualquer um

Encontrado minutos depois do primeiro, pelo mesmo método. O handler do `GET`
**não tem checagem nenhuma** — nem de sessão. Ele se apoia inteiramente no proxy,
que garante que há sessão e deliberadamente não avalia papel. A resposta:

```json
{ "autoLogoutTime": "18:30", "defaultResetPassword": "trocar123" }
```

`autoLogoutTime` é legítimo para todo papel — o `Sidebar` precisa dele para forçar
o logout no horário. `defaultResetPassword` não é.

**E este é explorável até escalada de privilégio.** A cadeia foi verificada no
código, não suposta. Em `login/route.ts:78-88`, quando `requires_password_change`
está ligado, o login aceita `username + password + newPassword` e **troca a senha
na hora**, sem exigir nada além da senha atual — que é justamente a padrão:

1. Um ALUNO lê `defaultResetPassword` em `/api/settings`.
2. Um ADMIN reseta o acesso de alguém — fluxo normal, rotineiro.
3. Antes de a vítima entrar, o atacante faz login com o username dela, a senha
   padrão, e **uma senha nova que ele escolhe**.
4. A conta passa a ser dele, com `requires_password_change` já desligado. A vítima
   encontra a senha "errada" e pede outro reset, sem motivo aparente.

A janela é entre o reset e o primeiro login da vítima — horas ou dias. Se o alvo
do reset for GESTOR ou ADMIN, **o atacante herda o papel**.

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

**Achado 2:** `GET /api/settings` passa a devolver `defaultResetPassword` apenas a
quem pode resetar senha — **ADMIN e GESTOR**, o mesmo conjunto do `POST` e das
rotas de reset. `autoLogoutTime` continua indo para todos os papéis, porque todo
papel precisa dele.

Escolhido **omitir o campo** em vez de recusar a requisição inteira: negar o `GET`
a papéis baixos quebraria o logout automático de todo mundo, para proteger um
campo que aqueles papéis não precisam ver. Resposta com menos campos é a resposta
certa aqui — o consumidor de baixo privilégio nunca leu esse campo.

**Achado 1:** alinhar a rota de métricas com as duas irmãs: restringir a **ADMIN, GESTOR e PORTEIRO**, que é
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
  outra rota fica sem a checagem que declara precisar ✅
- **TASK-087** — `GET /api/settings` para de entregar a senha padrão de reset a
  quem não pode resetar senha
- **TASK-086** — `docs/api-contract.md`, com a superfície real e a matriz de papéis

> **Fora deste ADR, e é decisão do usuário:** o conceito de "senha padrão de reset"
> compartilhada é frágil por natureza — qualquer um que a conheça tem a janela do
> item 4 acima, e ela é visível na tela de Configurações para ADMIN e GESTOR. A
> alternativa é senha aleatória por reset, exibida uma vez a quem reseta. Isso é
> **feature nova, Tipo A**, e precisa de sprint própria. Fica registrado aqui
> porque a correção da TASK-087 fecha o acesso, não a fragilidade do conceito.
