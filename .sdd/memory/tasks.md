# tasks.md — Micro-spec da Sprint Ativa (Sprint 10)

## TASK-037: Endpoint e Interface para Transferência Direta de Chave (REQ-022)
**Contexto**: Permitir que uma chave atualmente emprestada (ao Usuário A) seja transferida diretamente para o Usuário B (com observação opcional), sem precisar ser devolvida primeiro.
**Critérios BDD**:
- [ ] **Cenário**: Validação de estado e permissões
      Dado que o usuário tenta transferir uma chave
      Quando a chave NÃO estiver emprestada OU o usuário não for PORTEIRO, GESTOR ou ADMIN
      Então a API retorna erro (400 ou 403)
- [ ] **Cenário**: Transferência bem sucedida
      Dado uma chave cujo status atual é "emprestada" (Usuário A)
      Quando o porteiro transfere a chave para o Usuário B informando uma "observação" (opcional)
      Então o sistema insere um registro na tabela `key_transactions` indicando o repasse (tipo `transfer` ou equivalente)
      E a chave continua com status de "emprestada", mas agora associada ao Usuário B na interface.

## TASK-038: Exibição de Transferências no Histórico (REQ-022)
**Contexto**: A página `/history` precisa conseguir ler e exibir o novo evento de transferência corretamente, para manter a cadeia de custódia da chave clara e auditável.
**Critérios BDD**:
- [ ] **Cenário**: Histórico exibe evento de transferência
      Dado que uma transferência foi realizada
      Quando o porteiro acessar a tela de Histórico (`/history`)
      Então o evento "Transferência" aparece na listagem (mostrando origem, destino e observação, se existir)
      E o layout mobile em cards reflete essa informação sem quebrar.

## TASK-039: Consolidação de Logs (REQ-023)
**Contexto**: A interface `/logs` (acessível por ADMIN) possui 3 abas separadas com informações redundantes, que devem ser consolidadas em uma tabela unificada com bons filtros.
**Critérios BDD**:
- [ ] **Cenário**: Visualização de logs centralizada e filtrável
      Dado que um administrador acessa `/logs`
      Quando a página carrega
      Então existe apenas uma visualização consolidada contendo todos os eventos de auditoria
      E os filtros (tipo de evento, período, usuário) conseguem refinar as buscas na tabela inteira.
