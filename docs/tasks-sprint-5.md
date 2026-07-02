# Planejamento da Sprint 5

## Tarefas Aprovadas

### TASK-017: Suporte PWA (Progressive Web App)
- **Objetivo:** Tornar a aplicação instalável nativamente em celulares e tablets.
- **Implementação:**
  - Configurar o pacote `@ducanh2912/next-pwa` no Next.js.
  - Adicionar o `manifest.json`, ícones da UniFafire e meta tags correspondentes.
  - Habilitar suporte básico a Service Workers para cache local.

### TASK-018: Esqueci minha senha (Instrucional)
- **Objetivo:** Informar aos usuários o processo padrão para reset de senha, sem necessitar de envio de e-mails.
- **Implementação:**
  - Criar link "Esqueci minha senha" na UI de Login.
  - Exibir popup ou mensagem clara instruindo o usuário a procurar a administração.

### TASK-019: Geração Automática de Usuário
- **Objetivo:** Simplificar a tela de cadastro e garantir nomes de usuários únicos dinamicamente (ex: `tbraga`, `tibraga`).
- **Implementação:**
  - Remover a requisição do `username` na UI `UsersClient.tsx`.
  - A API `POST /api/users` receberá o Nome Completo e gerará o `username` verificando o banco recursivamente.
  - Feedback ao administrador de qual foi a string gerada.
