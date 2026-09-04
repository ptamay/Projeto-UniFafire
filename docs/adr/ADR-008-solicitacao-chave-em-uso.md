# ADR-008: Solicitação de Chave em Uso ao Portador (fluxo "pull")

## Contexto e Problema
Os fluxos de transferência existentes (REQ-022/024/026, ADR-004/005/007) são todos "push":
quem está com a chave escolhe para quem passá-la. A regra de negócio, porém, também exige o
caminho inverso — qualquer usuário vê no Dashboard quem está com a chave e pode **solicitá-la
diretamente ao portador** (prioridade mobile: tocar no card da chave em uso), sem envolver a
portaria.

Antes deste CR, o toque no card de uma chave em uso caía no fluxo de *devolução* — combinado
com a ausência de verificação de posse na API de `return` (corrigida em quick-fix, commit
`9fe0005`), um usuário comum conseguia criar uma devolução "pré-confirmada" em nome do portador,
quebrando a premissa da dupla confirmação. O quick-fix fechou o buraco, mas deixou o toque do
não-portador sem ação útil (apenas um toast informativo). O REQ-027 preenche esse vazio com o
fluxo correto.

## Decisão
Reutilizar a máquina de transações `transfer` existente, invertendo os papéis:

1. **Criação (pull):** o solicitante inicia `transfer` sobre uma chave `in_use` que não é dele.
   A transação nasce com `user_id` = solicitante (destinatário da chave, com `user_confirmed_at`
   preenchido — iniciar é consentir) e `porteiro_id` = **portador atual** (contraparte, com
   `porteiro_confirmed_at` NULL — é ele quem precisa aceitar). É o espelho exato do push do
   REQ-024, onde `porteiro_id` = remetente já confirmado.
2. **Aceite:** `POST /api/transactions/[id]/user-confirm` passa a aceitar a confirmação do lado
   da contraparte também quando `tx.porteiro_id === session.id` (hoje esse lado é restrito aos
   papéis ADMIN/GESTOR/PORTEIRO). Ao completar, o código existente já faz o certo:
   `keys.user_id` ← `tx.user_id`.
3. **Recusa/cancelamento:** sem endpoint novo — recusar é cancelar. O endpoint `/cancel` já
   autoriza `user_id` (solicitante), `porteiro_id` (portador) e, após o quick-fix, qualquer
   PORTEIRO/GESTOR/ADMIN (destrava pendências abandonadas).
4. **UI:** no card mobile (e linha desktop) de chave em uso, o não-portador ganha a ação
   "Solicitar esta chave" (o toque no card deixa de ser inerte); o portador segue vendo
   Devolver/Transferir; havendo pendência, o card mostra "já solicitada". O portador aceita ou
   recusa em `/confirm`, que ganha o texto contextual "Fulano solicitou a chave que está com você".
5. **Concorrência:** a regra existente de uma transação pendente por chave permanece — dois
   solicitantes simultâneos não coexistem, e retirada/devolução seguem bloqueadas enquanto a
   solicitação estiver aberta.

## Consequências
- **Positivas:** cumpre a regra de negócio com o mínimo de código novo (sem migration — o gate
  de migration não se aplica); o fluxo pull herda auditoria, histórico, polling e cancelamento
  do REQ-024/025; a dupla confirmação é preservada (quem cede a chave sempre consente).
- **Negativas:** aprofunda o polimorfismo do `porteiro_id` (agora significa "contraparte que
  cede/valida": portaria no withdraw/return, remetente no push, portador no pull). Aceito e
  documentado aqui como decisão consciente — renomear a coluna exigiria migration e retrabalho
  em todas as queries sem ganho funcional. Se um novo fluxo voltar a esticar esse significado,
  criar coluna própria (`counterparty_id`) via migration pareada.
- **Risco:** o aceite pela contraparte comum abre o lado "porteiro" da confirmação para usuários
  sem papel de portaria — a autorização deve ser estrita (`tx.porteiro_id === session.id`, nunca
  por papel), coberta por teste de regressão na sprint de implementação.
