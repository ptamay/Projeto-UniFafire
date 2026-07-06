# tasks.md â€” Micro-spec da Sprint Ativa (Sprint 10)

## TASK-037: Endpoint e Interface para TransferÃªncia Direta de Chave (REQ-022)
**Contexto**: Permitir que uma chave atualmente emprestada (ao UsuÃ¡rio A) seja transferida diretamente para o UsuÃ¡rio B (com observaÃ§Ã£o opcional), sem precisar ser devolvida primeiro.
**CritÃ©rios BDD**:
- [x] **CenÃ¡rio**: ValidaÃ§Ã£o de estado e permissÃµes
      Dado que o usuÃ¡rio tenta transferir uma chave
      Quando a chave NÃƒO estiver emprestada OU o usuÃ¡rio nÃ£o for PORTEIRO, GESTOR ou ADMIN
      EntÃ£o a API retorna erro (400 ou 403)
- [x] **CenÃ¡rio**: TransferÃªncia bem sucedida
      Dado uma chave cujo status atual Ã© "emprestada" (UsuÃ¡rio A)
      Quando o porteiro transfere a chave para o UsuÃ¡rio B informando uma "observaÃ§Ã£o" (opcional)
      EntÃ£o o sistema insere um registro na tabela `key_transactions` indicando o repasse (tipo `transfer` ou equivalente)
      E a chave continua com status de "emprestada", mas agora associada ao UsuÃ¡rio B na interface.

## TASK-038: ExibiÃ§Ã£o de TransferÃªncias no HistÃ³rico (REQ-022)
**Contexto**: A pÃ¡gina `/history` precisa conseguir ler e exibir o novo evento de transferÃªncia corretamente, para manter a cadeia de custÃ³dia da chave clara e auditÃ¡vel.
**CritÃ©rios BDD**:
- [x] **CenÃ¡rio**: HistÃ³rico exibe evento de transferÃªncia
      Dado que uma transferÃªncia foi realizada
      Quando o porteiro acessar a tela de HistÃ³rico (`/history`)
      EntÃ£o o evento "TransferÃªncia" aparece na listagem (mostrando origem, destino e observaÃ§Ã£o, se existir)
      E o layout mobile em cards reflete essa informaÃ§Ã£o sem quebrar.

## TASK-039: ConsolidaÃ§Ã£o de Logs (REQ-023)
**Contexto**: A interface `/logs` (acessÃ­vel por ADMIN) possui 3 abas separadas com informaÃ§Ãµes redundantes, que devem ser consolidadas em uma tabela unificada com bons filtros.
**CritÃ©rios BDD**:
- [x] **CenÃ¡rio**: VisualizaÃ§Ã£o de logs centralizada e filtrÃ¡vel
      Dado que um administrador acessa `/logs`
      Quando a pÃ¡gina carrega
      EntÃ£o existe apenas uma visualizaÃ§Ã£o consolidada contendo todos os eventos de auditoria
      E os filtros (tipo de evento, perÃ­odo, usuÃ¡rio) conseguem refinar as buscas na tabela inteira.

## TASK-040: TransferÃªncia por UsuÃ¡rios Comuns (REQ-024)
**Contexto**: Permitir que usuÃ¡rios comuns transfiram chaves entre si, mediante dupla confirmaÃ§Ã£o.
**CritÃ©rios BDD**:
- [x] **CenÃ¡rio**: InÃ­cio da transferÃªncia pendente
      Dado que o usuÃ¡rio comum A possui a chave X
      Quando A tenta transferir a chave X para o usuÃ¡rio comum B
      EntÃ£o o sistema cria uma transaÃ§Ã£o de transferÃªncia com status 'pending' (aguardando confirmaÃ§Ã£o do usuÃ¡rio B)
- [x] **CenÃ¡rio**: ConfirmaÃ§Ã£o da transferÃªncia pelo destinatÃ¡rio
      Dado uma transaÃ§Ã£o pendente de transferÃªncia de A para B
      Quando B acessa o sistema (ex: via /confirm ou Dashboard) e aceita a chave
      EntÃ£o o status da chave passa para 'in_use' por B, a transaÃ§Ã£o Ã© concluÃ­da e registrada no histÃ³rico.

## TASK-041: Cancelamento de TransferÃªncias (REQ-025)
**Contexto**: Permitir que o remetente de uma transferÃªncia pendente consiga visualizar e cancelar a solicitaÃ§Ã£o antes do destinatÃ¡rio aceitÃ¡-la.
**CritÃ©rios BDD**:
- [x] **CenÃ¡rio**: VisualizaÃ§Ã£o da pendÃªncia pelo remetente
      Dado que o usuÃ¡rio A iniciou uma transferÃªncia pendente para o usuÃ¡rio B
      Quando A acessa a aba ConfirmaÃ§Ãµes ou o Dashboard
      EntÃ£o A deve conseguir visualizar o card/botÃ£o de pendÃªncia daquela transferÃªncia.
- [x] **CenÃ¡rio**: Cancelamento pelo remetente
      Dado que o usuÃ¡rio A estÃ¡ visualizando uma transferÃªncia pendente que ele iniciou
      Quando A clica em "Cancelar"
      EntÃ£o o status da transaÃ§Ã£o Ã© atualizado para 'cancelled' (cancelada) e nÃ£o pode mais ser aceita por B.
# Sprint 11

## TASK-042: Transferência no Mobile (REQ-026)
**Contexto**: Adaptar a view de cards (mobile) no DashboardClient para incluir o botão/ação de Transferir chaves e visualizar o status de 'Aguardando' / botão de Cancelar.
**Critérios BDD**:
- [x] **Cenário**: Visualização do card em telas pequenas (mobile)
      Dado que o usuário visualiza o Dashboard em dispositivo móvel (modo cards)
      Quando o usuário possui uma chave em mãos
      Então deve ser exibida uma opção para 'Transferir' a chave diretamente do card.
- [x] **Cenário**: Card de transferência pendente (remetente)
      Dado que o usuário iniciou uma transferência no mobile
      Quando ele visualiza a chave na lista de cards
      Então o status deve mostrar que a chave está com transferência pendente e oferecer a opção 'Cancelar'.
