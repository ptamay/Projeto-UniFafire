# spec.md — O Quê & Por Quê (UniFafire · Sistema de Gerenciamento de Chaves)

> Perspectiva de produto, agnóstica de tecnologia. Gerado na Fase 6 a partir do
> `overview.md`, `handoff.md` e das Fases 1–3. Mudanças de escopo entram primeiro
> no Changelog abaixo, depois no `plan.md`.

## Changelog
| Data | Versão | Alteração | Motivo |
|------|--------|-----------|--------|
| 2026-07-02 | 1.0 | Criação inicial (baseline do sistema legado + requisitos de estabilização) | — |
| 2026-07-02 | 1.1 | REQ-016 — responsividade mobile em todas as telas (Change Request Tipo C, ADR-001) | Funcionários e alunos solicitam, confirmam e devolvem chaves pelo celular; UI atual só tem adaptação parcial em 5 arquivos |
| 2026-07-02 | 1.2 | REQ-017 a REQ-020 — CR retroativo: features entregues nas Sprints 4–6 sem passar por Change Request (ADR-002) | Reconciliação: eliminar escopo fantasma — o que está em produção deve estar no spec |
| 2026-07-04 | 1.3 | REQ-021 — Bypass de dupla confirmação e UI Inteligente (CR Tipo C, ADR-003) | Otimizar rotina da portaria e acomodar usuários sem celular; evitar bloqueios no fluxo. |
| 2026-07-06 | 1.4 | REQ-022 e REQ-023 — Transferência direta de chaves e consolidação das abas de logs (CR Tipo C, ADR-004) | Otimizar processo de repasse de chaves e melhorar UX da auditoria. |
| 2026-07-06 | 1.5 | REQ-024 — Transferência de chaves entre usuários sem privilégios (CR Tipo C, ADR-005) | Extensão do REQ-022 para permitir que Funcionários e Alunos transfiram as próprias chaves entre si. |
| 2026-07-06 | 1.6 | REQ-025 — Cancelamento e visualização de transferências pendentes (CR Tipo C, ADR-006) | Corrigir gap do REQ-024: o iniciador não conseguia ver ou cancelar a transferência pendente. |
| 2026-07-06 | 1.7 | REQ-027 — Solicitação de chave em uso ao portador (CR Tipo C, ADR-008) | Regra de negócio: qualquer usuário vê quem está com a chave e pode solicitá-la diretamente ao portador (fluxo "pull", prioridade mobile), sem passar pela portaria. |
| 2026-07-07 | 1.8 | REQ-028 — Devolução forçada ampla e clareza do fluxo de chaves no mobile (CR Tipo C, ADR-009) | Feedback de uso: portaria não conseguia devolver chaves de funcionários sem celular a menos que a chave tivesse sido atribuída via bypass; mobile sem botão "Devolver" e com estados pouco claros. |
| 2026-07-09 | 1.9 | REQ-029 — Fluxo de registro unificado e clareza de pendências no Dashboard + light mode integral (CR Tipo C, ADR-010) | Re-crítica UI/UX dual-agent (Nielsen 30/40, snapshots em `.impeccable/critique/`): dois caminhos concorrentes para o mesmo registro no desktop, concluir a operação exige trocar de tela, porteiro mobile sem acelerador e tema claro meio-aplicado. |

---

## 1. Problema e Objetivo

A UniFafire precisa controlar o empréstimo e a devolução das chaves de salas e ambientes
da instituição de forma **segura e auditável**. O sistema responde, a qualquer momento,
"quem está com qual chave" e mantém histórico confiável das movimentações.
O sistema substitui/estrutura um legado ad-hoc do Colégio São José; esta especificação
documenta o **estado atual como baseline** e os requisitos de **estabilização** antes de
novas features.

**Usuários:** equipe interna (portaria, gestão, administração) e portadores de chave
(funcionários e alunos). Uso em horário letivo, rede local.

## 2. Atores e Permissões (RBAC — baseline aprovada)

| Perfil | Permissões-chave | Super Admin? |
|--------|-----------------|:---:|
| ADMIN | Acesso total: chaves, usuários, configurações, histórico e logs de auditoria | sim |
| GESTOR | Igual ao ADMIN, exceto logs de auditoria | não |
| PORTEIRO | Opera entrega/devolução de chaves, vê histórico e dashboard | não |
| FUNCIONARIO | Confirma a própria transação (dupla confirmação) | não |
| ALUNO | Confirma a própria transação (dupla confirmação) | não |

Papéis totalmente isolados (sem herança). Fonte única: `ROLE_PERMISSIONS`.

## 3. Requisitos Funcionais

### Núcleo (comportamento existente — baseline a preservar)
- **REQ-001 — Autenticação:** login com usuário/senha; sessão identifica id, username e papel. Erro de credencial não revela se o usuário existe.
- **REQ-002 — Gestão de chaves:** ADMIN/GESTOR/PORTEIRO cadastram, editam e listam chaves (nome + sala). Cada chave tem estado: disponível | emprestada.
- **REQ-003 — Retirada com dupla confirmação:** porteiro registra a retirada (`withdraw`) vinculando chave + usuário; o portador confirma a transação em `/confirm`. Transação pendente expira/cancela via `cancel`.
- **REQ-004 — Devolução:** fluxo `return` com o mesmo padrão de dupla confirmação.
- **REQ-005 — Histórico:** toda movimentação registrada com timestamp preciso; PORTEIRO+ consultam em `/history`. Transações individuais são imutáveis (sem editar/excluir).
- **REQ-006 — Dashboard:** visão em tempo real de chaves emprestadas vs. disponíveis e pendências, em `/`.
- **REQ-007 — Gestão de usuários:** ADMIN/GESTOR criam usuários, alteram papel e resetam senha em `/users`.
- **REQ-008 — Configurações:** ADMIN/GESTOR definem horário de backup e retenção em `/settings`.
- **REQ-009 — Backup e restauração:** backup diário automático do banco; ADMIN exporta, importa e restaura backups.
- **REQ-010 — Logs de auditoria:** ações administrativas registradas e visíveis apenas para ADMIN em `/logs`.

### Estabilização (gaps identificados na auditoria da Fase 6 — novos)
- **REQ-011 — Sessão persistente e expirável:** sessões sobrevivem a restart do servidor (segredo persistente) e expiram (7 dias absoluto / 24h idle). *Baseline atual viola: segredo aleatório por boot, token sem expiração.*
- **REQ-012 — Política de credenciais:** senha mínima de 8 caracteres; lockout após 5 falhas/15 min; rate limit nas rotas de autenticação. *Baseline atual: mínimo 6, sem lockout, sem rate limit.*
- **REQ-013 — Identidade de sessão e conta:** shell exibe nome + papel do usuário logado com menu; rotas `/account/profile` (dados próprios) e `/account/security` (troca de senha). *Baseline atual: troca de senha existe só como API.*
- **REQ-014 — Operações destrutivas controladas:** limpeza de histórico e reset de banco (funções existentes no legado) restritas a ADMIN, com modal de confirmação destrutiva e registro prévio em log de auditoria. *Exceção consciente à imutabilidade do REQ-005, restrita ao super admin — o `threat_model_stride.md` deve ser atualizado para refletir isso.*
- **REQ-015 — Cobertura de testes:** fluxos críticos (login, retirada, confirmação, devolução) cobertos por testes automatizados antes de qualquer feature nova.

### Change Requests aprovados (pós-Fase 6)
- **REQ-017 — Interface de auditoria e exportação (CR retroativo 2026-07-02, ADR-002):** UI de consulta aos logs de ação e segurança com paginação e filtros (IP, ação, data, usuário), restrita a ADMIN; exportação PDF do histórico e CSV dos logs. *Entregue na Sprint 4 real.*
- **REQ-018 — PWA instalável (CR retroativo 2026-07-02, ADR-002):** aplicação instalável em celulares/tablets (manifest + service worker com cache básico). *Entregue na Sprint 5 real.*
- **REQ-019 — Username automático (CR retroativo 2026-07-02, ADR-002):** criação de usuário sem digitar username; sistema gera a partir do nome completo com resolução de colisão e preview na UI. *Entregue nas Sprints 5–6 reais.*
- **REQ-020 — "Esqueci minha senha" instrucional (CR retroativo 2026-07-02, ADR-002):** link no login exibindo instrução para procurar a administração (sem envio de e-mail). *Entregue na Sprint 5 real.*
- **REQ-016 — Responsividade mobile (CR 2026-07-02, Tipo C):** todas as telas do sistema são 100% funcionais em dispositivos móveis (viewport ≥ 360px). Fluxos prioritários: confirmação do portador em `/confirm` e `/login` (funcionário/aluno no celular), dashboard e operação de entrega/devolução. Telas baseadas em tabela (histórico, logs, usuários, chaves) adotam layout alternativo em card em telas pequenas. Implementação dentro do CSS nativo existente (D-03 mantida) — ver ADR-001. *Baseline atual: apenas 5 arquivos têm media queries; keys, users, settings, logs, confirm e login não têm adaptação responsiva.*
- **REQ-021 — Bypass de Confirmação e Ação Rápida Inteligente (CR 2026-07-04, Tipo C):** Adição de bypass de dupla confirmação para porteiros/gestores atribuírem chaves diretamente com justificativa auditável; barra de ação rápida no dashboard autocompleta e lista usuários frequentes por chave; lista de chaves prioriza chaves frequentes para o portador; navegação total por teclado (setas/Enter) - ver ADR-003.
- **REQ-022 — Transferência direta de chaves (CR 2026-07-06, Tipo C):** Possibilidade de repassar uma chave emprestada diretamente para outro usuário, com observação opcional, sem precisar devolver à portaria. Refletido adequadamente no histórico de transações.
- **REQ-023 — Consolidação de Logs (CR 2026-07-06, Tipo C):** Análise e unificação das 3 abas de logs na interface de auditoria (`/logs`), removendo redundâncias de conteúdo para facilitar a visualização centralizada por parte dos administradores.
- **REQ-024 — Transferência entre Usuários Comuns (CR 2026-07-06, Tipo C):** Extensão do REQ-022. Permite que funcionários e alunos em posse de uma chave iniciem uma transferência para outro usuário comum. Diferente do bypass da portaria, essa operação gera uma transação *pendente* que exige a confirmação pelo usuário de destino.
- **REQ-025 — Cancelamento de Transferências (CR 2026-07-06, Tipo C):** Correção de gap operacional do REQ-024. Garante que o usuário que iniciou uma transferência pendente consiga visualizá-la na aba de Confirmações e cancelá-la a qualquer momento, antes de o destinatário aceitar.
- **REQ-026 — Transferência de chaves na interface mobile (CR 2026-07-06, Tipo C):** Extensão do REQ-022 e REQ-024 para o layout mobile. Na visualização em card (mobile) do Dashboard, incluir a ação de transferir a chave diretamente para outro usuário.
- **REQ-027 — Solicitação de chave em uso ao portador (CR 2026-07-06, Tipo C):** Complemento "pull" do REQ-024. Todo usuário vê no Dashboard quem é o portador de uma chave em uso; funcionários e alunos podem, a partir do card (mobile) ou da linha (desktop), *solicitar* a chave diretamente ao portador atual. A solicitação gera uma transação pendente que o portador aceita (a chave muda de mãos, sem passar pela portaria) ou recusa/cancela. Solicitante, portador e portaria podem cancelar a pendência. Vale a regra existente de uma pendência por chave — o card exibe o estado "já solicitada".
- **REQ-028 — Devolução forçada ampla e clareza no mobile (CR 2026-07-07, Tipo C):** (a) Porteiro/gestor/admin podem forçar a devolução de qualquer chave em uso (não só as atribuídas via bypass), com justificativa obrigatória informada no ato e registro no log de auditoria — desacopla a devolução forçada da retirada (supersede o acoplamento do ADR-003). (b) Botão "Devolver" explícito no card mobile para portador e portaria. (c) Estados claros no card mobile: o que está pendente e quem está com a chave / quem solicitou / quem deve confirmar. (d) Responsividade por CSS (`.mobile-only`/`.desktop-only`) em vez de detecção por JS, eliminando flash de hidratação. (e) `withdraw_justification`/`in_use_since` expostos no SSR. Ver ADR-009.
- **REQ-029 — Fluxo de registro unificado e clareza de pendências no Dashboard (CR 2026-07-09, Tipo C):** (a) No desktop, a busca e a Ação Rápida tornam-se um **único campo** que filtra a lista em tempo real e age no Enter (primeira sugestão selecionável por setas) — elimina os dois inputs gêmeos e os dois caminhos concorrentes para o mesmo registro. (b) **Pendências inline no Dashboard**: painel no topo permite ver e confirmar/cancelar as pendências do usuário sem navegar a `/confirm` (que permanece como visão completa e destino da bottom-nav). (c) **Aceleradores do porteiro no mobile**: chips de chaves frequentes (hoje exclusivos de não-porteiros) e/ou ação rápida compacta. (d) **Light mode integral**: a sidebar acompanha o tema claro (hoje permanece escura, decisão não documentada) e o comportamento do login fica alinhado e documentado. Somente UI — a máquina de dupla confirmação (REQ-003/004) e a API não mudam. Ver ADR-010.

## 4. Fluxos que não podem falhar
1. Login → dashboard.
2. Retirada de chave (porteiro) → confirmação pelo portador.
3. Devolução de chave → confirmação → chave volta a "disponível".
4. Backup diário automático executa e é restaurável.

## 5. Métricas de Negócio (mensuráveis via tabela `transactions` + logs)
| Métrica | Definição | Alvo |
|---|---|---|
| Taxa de dupla confirmação | % de transações criadas que foram confirmadas pelo portador em ≤ 10 min | ≥ 95% |
| Chaves em atraso | Nº de chaves retiradas há > 12h sem devolução, por dia | tendência ↓; alerta no dashboard |
| Tempo de operação no balcão | Tempo mediano entre criação da transação e confirmação | ≤ 2 min |
| Confiabilidade do backup | % de dias com backup diário concluído com sucesso (log) | 100% |

## 6. Restrições Não-Funcionais
- Uso interno em horário letivo (sem SLA formal 24/7); latência p95 < 500ms nas rotas críticas em rede local.
- Responsividade: todas as telas funcionais em viewports a partir de 360px de largura; alvos de toque ≥ 44px nos controles dos fluxos críticos (REQ-016).
- Sem modo offline; instância única em servidor local (PM2).
- Volume: dezenas de usuários simultâneos no pico; centenas de chaves; milhares de transações/ano — SQLite é suficiente.
- Compliance: LGPD básica — proteção de credenciais (bcrypt) e não-exposição de dados pessoais em logs.
- DR: RPO 24h / RTO 4h (constitution §4).
- Sem integrações externas e sem API pública.
