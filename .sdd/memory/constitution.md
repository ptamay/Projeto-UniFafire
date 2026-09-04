# constitution.md — Lei Máxima do Projeto (UniFafire · Sistema de Gerenciamento de Chaves)

> **Gerado na Fase 6 (Claude Code) a partir do `handoff.md` + `security-constitution.md` v4.0.**
> Nenhum agente pode ignorar ou sobrescrever este arquivo. Todo agente ou sessão que
> interaja com o projeto DEVE carregar este arquivo antes de qualquer ação.
> Alterações exigem Change Request **Tipo D** com aprovação explícita do usuário.

## 0. Contexto Constitucional

| Parâmetro | Valor |
|---|---|
| Modo do projeto | **EXPRESSO** |
| Natureza | Brownfield — sistema legado ("vibecodado") sendo estabilizado como baseline |
| Multi-tenant | **NÃO — cliente único (UniFafire). Modelo de isolamento: N/A por declaração explícita.** Nenhum schema pode introduzir `tenant_id` sem CR Tipo D. |
| Exposição | **Internet pública (Vercel), toda rota atrás de sessão** (ADR-012). Não há API publicada a terceiros: `/api/*` são endpoints internos consumidos apenas pelo próprio front-end → versionamento `/v[N]/` **permanece não aplicável**, por decisão registrada no ADR-012 e aprovada em 2026-09-02. Alcançabilidade pela internet não é o mesmo que API pública; surgindo qualquer consumidor externo, a regra `/v[N]/` volta a valer integralmente. |
| Dados sensíveis | PII de funcionários e alunos (nome completo, matrícula, telefone) passa a residir em **provedor terceiro**. Região obrigatória: **São Paulo (`sa-east-1`)**. Ciência formal da direção da instituição exigida ANTES do go-live. MODO SENSÍVEL não ativado; §6.1 (proibição de PII combinada em log) segue integralmente. |
| Stack aprovada | Next.js (App Router) + React + **Postgres (Supabase)** + **Vercel** (ADR-012, aprovado em 2026-09-02). Desvios exigem registro em `plan.md` → Decisões e Justificativas. |
| Transição em curso | A stack anterior (**better-sqlite3 + PM2**, Fase 5) permanece **válida e vigente** até a Etapa 7 do ADR-012 concluir. Durante a migração as duas coexistem: código ainda em SQLite não viola esta constituição. O ponto de virada é o go-live; a partir dele, só a stack acima vale. |

---

## 1. Strict Rules — Segurança

1. **Criptografia de credenciais:** senhas exclusivamente com `bcrypt` (custo ≥ 10). Nunca armazenar, logar ou transmitir senha em claro ou hash em resposta de API.
2. **Sanitização de input:** todo payload de API validado com Zod (`src/lib/schemas.ts`) antes de tocar o banco. Rota sem schema Zod = BLOQUEADOR.
3. **Anti-injeção:** toda consulta SQL usa exclusivamente **parâmetros vinculados** (placeholders), qualquer que seja o driver — `db.prepare(...).run/get/all` no SQLite, consulta parametrizada no Postgres. Nenhum dado de origem externa entra em SQL por concatenação ou interpolação de string. Concatenação de string em SQL = BLOQUEADOR, sem exceção. (Interpolação de identificador a partir de **constante do próprio código**, nunca de input, é a única exceção — e deve vir comentada.)
4. **XSS/CSRF:** nunca usar `dangerouslySetInnerHTML` com dado de usuário; mutações apenas via cookie `sameSite` + verificação de sessão server-side em TODA rota de API (nenhuma rota confia no client).
5. **Path traversal:** qualquer operação de arquivo derivada de input do usuário (backups, restore, import) DEVE resolver e validar o caminho contra o diretório base permitido (`backups/`) antes de ler/escrever. (Regressão já corrigida no commit `9bb5d22` — não reintroduzir.)

## 2. Strict Rules — Autenticação e Sessão

1. **Segredo JWT persistente:** o segredo de assinatura (`jose`/HS256) DEVE vir de `JWT_SECRET` no `.env` (mínimo 32 bytes aleatórios), nunca gerado em runtime. `.env` jamais commitado.
2. **Expiração obrigatória:** sessão com expiração absoluta de 7 dias (`setExpirationTime`) e idle timeout de 24h. Token sem expiração = BLOQUEADOR.
3. **Cookie de sessão:** `httpOnly` + `sameSite=lax` (ou `strict`) + **`secure` obrigatório em produção** — a hospedagem serve exclusivamente por HTTPS, então o condicional "quando servido via HTTPS" deixa de existir. Relaxamento de `secure` apenas em dev local, via perfil de ambiente (Seção 8).
4. **Política de senha (NIST):** mínimo **8 caracteres**, comprimento sobre complexidade. Aplicada em criação de usuário, troca e reset de senha.
5. **Lockout:** 5 tentativas de login falhas → bloqueio de 15 minutos **por conta**. O IP tem limiar próprio e muito mais alto (contra varredura distribuída), nunca o mesmo da conta: em rede institucional todos os usuários compartilham um IP NAT, e igualar os limiares tranca o campus inteiro (TASK-053).
6. **Rate limiting em auth:** máximo 30 req/min por IP nas rotas de autenticação (`/api/auth/*`). Resposta 429 com `Retry-After`. **O contador vive no banco, nunca na memória do processo** — sob execução serverless cada instância teria o seu, zerado a cada cold start, e o limite efetivo viraria "30 × número de instâncias" (corrigido na TASK-054).
7. **Logout everywhere:** troca de senha invalida todas as demais sessões ativas do usuário.
8. **2FA:** recomendado para ADMIN (MODO EXPRESSO — não bloqueante).
9. **Identidade de sessão na UI (escopo default, inegociável):** o shell exibe nome + papel do usuário logado com menu (perfil, alterar senha, sair). Rotas obrigatórias: `/account/profile` e `/account/security`, entregues na mesma sprint que tocar autenticação.

## 3. Strict Rules — RBAC

1. A fonte única de autorização é `ROLE_PERMISSIONS` em `src/lib/schemas.ts` (ADMIN, GESTOR, PORTEIRO, FUNCIONARIO, ALUNO).
2. **Toda rota de API valida a sessão E a permissão no servidor.** Checagem só no client = vulnerabilidade, não feature.
3. Logs de auditoria: acesso restrito a `canViewLogs` (apenas ADMIN).
4. Escalação de papel (`/api/users/role`): apenas quem tem `canManageUsers`; ninguém altera o próprio papel.
5. **Endpoints destrutivos** (`/api/history/clear`, `/api/settings/clear-database`, restore de backup): exclusivos de ADMIN, exigem confirmação explícita na UI (modal destrutivo) e geram entrada imutável no log de auditoria ANTES de executar. A existência desses endpoints é uma exceção consciente ao threat model e está documentada no `spec.md` (REQ-014).

## 4. Strict Rules — Dados, Migrações e Disaster Recovery

1. **Migrações pareadas:** toda alteração de schema tem UP em `db/migrations/NNNN_up_*.sql` e DOWN pareado `NNNN_down_*.sql` com o mesmo prefixo. DOWN gerado ANTES de aplicar o UP. Migração sem DOWN = BLOQUEADOR.
2. **Teste de migração:** UP + DOWN testados contra uma CÓPIA do banco (`backups/` ou cópia temporária) antes de tocar o banco de produção. Nunca aplicar migração direto em `keys.db` de produção.
3. **DR obrigatório:** **RPO = 24 horas | RTO = 4 horas — o alvo não muda, o meio pode.** Backup diário por **`pg_dump` em job agendado do GitHub Actions**, enviado para **repositório privado separado** (off-site), e **verificado no próprio job**: o dump é restaurado numa base descartável e as contagens por tabela são reconciliadas contra a origem. Backup não verificado não conta como backup. Cada execução — sucesso ou falha — é registrada em tabela do banco, para que a métrica de confiabilidade leia fato e não promessa. Responsável pós-entrega: administrador local do sistema (documentar no runbook).

   > **Correção de 2026-09-04 (CR Tipo D).** Esta cláusula dizia "backup diário **gerenciado pelo provedor do banco**, verificado por job agendado da hospedagem". A premissa é falsa no plano escolhido: a documentação do Supabase declara backup automático apenas para os planos Pro, Team e Enterprise, e **recomenda explicitamente que projetos do plano gratuito exportem os dados com `db dump` e mantenham backups off-site**. Não havia backup gerenciado a verificar. Mantida a exigência que importa — RPO/RTO e verificação —, trocado o meio, que a própria cláusula sempre admitiu trocar. Ver ADR-012 §Backup.
   >
   > ⚠️ O repositório do código é **público**: o dump nunca pode ir para ele nem para artefatos de Actions deste repo, que são baixáveis por qualquer pessoa. Daí o destino ser um repositório privado separado.
4. Histórico de transações é **imutável por design** para papéis não-ADMIN; nenhuma feature nova pode permitir edição/exclusão de transação individual.
5. `keys.db`, `database.sqlite`, `backups/` e `logs/` nunca são commitados no git.

## 5. Strict Rules — Qualidade de Código

1. Arquitetura testável (TDD nas features novas), funções de responsabilidade única, SOLID, DRY. Sem comentários redundantes.
2. **Cobertura mínima: 80% no código novo/modificado** a partir da Sprint de testes. Código legado não tocado não bloqueia, mas toda task que tocar um arquivo legado adiciona testes para o comportamento tocado.
3. **Camada de acesso a dados:** consultas SQL migram progressivamente das rotas para `src/lib/` (repositórios/serviços). Nenhuma rota NOVA acessa `db` diretamente.
4. Lint (`eslint`) com zero erros. Sem `console.log`, flags de debug ou código morto em caminhos de produção (logger estruturado de `src/lib/logger.ts` é o canal permitido).
5. **Regra de Ouro do Frontend:** configuração global (globals.css, tokens do `ui-context.md`, fontes) e esqueletos de rota SEMPRE antes de estilizar componentes individuais. Todo agente de UI carrega `ui-context.md` antes de gerar componente.

## 6. Strict Rules — Logging Seguro e Secrets

1. Nenhum log pode conter: senhas ou hashes, tokens JWT/sessão, secrets, ou PII combinada (nome completo + matrícula + telefone juntos). Logger com máscara antes de qualquer deploy.
2. Zero secrets em código-fonte, em arquivos commitados ou em logs. Secrets via `.env` local (padrão Node) injetado em runtime; `.env.example` documenta as chaves sem valores.
3. `npm audit` sem CVE HIGH/CRITICAL antes de cada release (SCA — recomendado em EXPRESSO, adotado como gate deste projeto por ser brownfield com histórico de vulnerabilidades). Lockfile (`package-lock.json`) sempre commitado; CI/instalação reprodutível com `npm ci`.

## 7. Strict Rules — Observabilidade

Três camadas antes de qualquer release estável (stack local/gratuita):
1. **Erros:** logger estruturado persistido em **tabela do banco** (`app_logs`), com severidade e `REVOKE UPDATE, DELETE`. Arquivo em `logs/` não serve à hospedagem serverless, cujo filesystem é efêmero e somente-leitura — a trilha se perderia. Em tabela, ela ganha a mesma imutabilidade real que o `history` já tem por trigger (§4.4), em vez de um arquivo texto editável por quem tiver acesso ao servidor. **`app_logs` nunca entra em rotina de limpeza** — é o destino que precisa sobreviver ao REQ-014. Até a Etapa 6 do ADR-012 concluir, o logger em `logs/` permanece válido. Sentry (free tier) opcional.
2. **Performance:** tempo de resposta das rotas críticas registrado no logger (sem ferramenta paga).
3. **Negócio:** métricas definidas no `spec.md` §5 derivadas das tabelas de transações (sem telemetria externa).

## 8. Enforcement por Ambiente

Perfil único dirigido por `APP_ENV` (`dev` | `production`) em `src/lib/security-profile.ts` — todo controle lê daqui, nunca checa ambiente por conta própria.
- **Relaxável só em dev:** lockout desligado, rate limit desligado, senha simples em seeds.
- **NUNCA relaxável:** anti-injeção, sanitização Zod, secrets fora do código, hash bcrypt, validação de sessão server-side, validação de path em backups.
- Flag de bypass (`AUTH_BYPASS`, `SKIP_LOCKOUT`, etc.) verdadeira em configuração de produção = BLOQUEADOR de release.

## 9. Definição de Pronto (DoD)

Uma task só está pronta quando TODOS forem verdadeiros:
- [ ] Critérios de aceite da task atendidos e verificados.
- [ ] Testes unitários/integração passam; cobertura ≥ 80% no código tocado.
- [ ] Lint zero erros; sem `console.log`/código morto em produção.
- [ ] Sem secrets em código ou logs; sem PII/token em log.
- [ ] RBAC verificado: rota nova tem validação de sessão + permissão server-side.
- [ ] Se tocou schema: migração UP + DOWN pareadas, testadas em cópia do banco, commitadas juntas.
- [ ] Se tocou autenticação: identidade de sessão no shell e rotas `/account/*` funcionais.
- [ ] `npm audit` sem HIGH/CRITICAL novos.
- [ ] Acessibilidade WCAG AA nos componentes de UI novos.
- [ ] Nenhum finding HIGH/CRITICAL aberto no `threat_model_stride.md` para a área tocada.

## 10. Ambiguidade

Se o escopo estiver incompleto ou contraditório em qualquer fase, o agente sinaliza explicitamente, propõe o default mais seguro e aguarda confirmação. Nunca assume silenciosamente.
