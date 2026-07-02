# Planejamento da Sprint 4 (Qualidade, Relatórios e Operacional)

A **Sprint 4** foca na maturidade operacional do Projeto UniFafire. Com a segurança blindada e as regras de negócio garantidas por testes automatizados, agora o foco é dar visibilidade total aos dados já gerados pelo sistema, gerar relatórios para tomadas de decisão e aplicar testes visuais (E2E) para garantir a integridade da Interface do Usuário.

## Metas e Backlog (Tasks)

### TASK-013: Interface de Auditoria e Logs de Segurança
- [ ] Criar a rota de API (`GET /api/audit/action-logs` e `GET /api/audit/security-logs`) para resgatar os eventos do banco.
- [ ] Construir a UI `/dashboard/audit` acessível apenas para Administradores.
- [ ] Adicionar paginação e filtros (por IP, ação, data e usuário).

### TASK-014: Painel de Notificações e Alertas (Atrasos)
- [ ] Desenvolver lógica no backend para identificar chaves em uso além do tempo limite esperado.
- [ ] Criar um pop-up (ou painel lateral) no Dashboard indicando pendências críticas.
- [ ] Criar sistema de notificação via toast para quando o porteiro aprovar uma chave do aluno em tempo real.

### TASK-015: Exportação e Geração de Relatórios (PDF/CSV)
- [ ] Integrar biblioteca de exportação (`jspdf` e `jspdf-autotable` ou lógica de CSV).
- [ ] Adicionar botão "Exportar para PDF" na tela de histórico de chaves.
- [ ] Adicionar exportação CSV na tela de logs de auditoria (TASK-013).

### TASK-016: Testes End-to-End no Frontend (Playwright)
- [ ] Configurar o **Playwright** no ecossistema do projeto.
- [ ] Escrever o fluxo E2E crítico 1: Login Completo (Admin).
- [ ] Escrever o fluxo E2E crítico 2: Fluxo do Aluno solicitando chave e Porteiro aprovando.

---

## 🚀 Fase de Implementação

Nossa primeira tarefa será a **TASK-013**, onde abriremos o "cofre" de dados que construímos até aqui, permitindo que a escola finalmente audite quem logou de onde, quem errou senhas repetidamente e quem alterou dados críticos, tudo de forma amigável em uma tabela moderna.
