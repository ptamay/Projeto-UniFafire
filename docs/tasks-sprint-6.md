# Sprint 6 — Observabilidade e Backups

Esta sprint foca em profissionalizar e blindar a infraestrutura de background do sistema, garantindo resiliência em rotinas críticas (como backups automáticos) e refinando melhorias de UX no escopo do sistema de usuários e logs, conforme solicitações diretas.

## TASKS

### TASK-021: Refatoração da Arquitetura de Backups (Instrumentation)
**Objetivo:** Transformar a rotina de cron-job de "funcional" para "profissional", isolando-a do ciclo de vida das APIs do Next.js.
- [x] **BDD 1:** Dado que o servidor Next.js inicia (production ou dev), o sistema deve acoplar o hook de instrumentation e iniciar o `startCronJobs` exatamente uma vez.
- [x] **BDD 2:** Dado que múltiplas requisições de API cheguem ao `db.ts`, nenhuma delas deve tentar instanciar novamente o `node-cron`.
- [x] **BDD 3:** Dado que a rotina de retenção decida apagar um arquivo, se o arquivo estiver bloqueado (lock), o sistema deve capturar a exceção e não crashar a thread.
- [x] **BDD 4:** Dado que o ambiente utilize `process.env.DB_PATH` diferente, o sistema de backup deve ler o caminho dinamicamente, abandonando a string fixa `keys.db`.

### TASK-019: Geração Automática de Nomes de Usuários (Melhoria)
**Objetivo:** Agilizar a criação de usuários e evitar colisões.
- [x] **BDD 1:** Dado que o admin crie um usuário, o campo "username" não deve ser exigido manualmente.
- [x] **BDD 2:** O sistema deve concatenar a primeira letra do primeiro nome + o último nome (`Paulo Tamay` -> `ptamay`).
- [x] **BDD 3:** Se `ptamay` já existir, usar a segunda letra do nome (`patamay`).
- [x] **BDD 4:** A UI deve oferecer um texto de "preview" interativo de qual será o nome de usuário enquanto o admin digita.

### TASK-013: Correção Visual no Painel de Logs (Quick Fix)
**Objetivo:** Eliminar o "fantasma" que misturava logs antigos na troca de abas.
- [x] **BDD 1:** Dado que o usuário clique numa nova aba em `/logs`, a tabela deve instantaneamente assumir estado vazio de carregamento até o término do debounce de 300ms, sem mostrar o cabeçalho antigo mesclado aos dados da nova página.
