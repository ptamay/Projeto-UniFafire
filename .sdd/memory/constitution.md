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
| Exposição | Intranet local (PM2 em servidor interno). **Sem API pública** → versionamento `/v[N]/` não se aplica; rotas internas vivem sob `/api/*`. |
| Dados sensíveis | Nenhum dado regulado (LGPD básica: proteção de credenciais). MODO SENSÍVEL não ativado. |
| Stack aprovada (Fase 5) | Next.js (App Router) + React + better-sqlite3 (SQLite) + PM2. Desvios exigem registro em `plan.md` → Decisões e Justificativas. |

---

## 1. Strict Rules — Segurança

1. **Criptografia de credenciais:** senhas exclusivamente com `bcrypt` (custo ≥ 10). Nunca armazenar, logar ou transmitir senha em claro ou hash em resposta de API.
2. **Sanitização de input:** todo payload de API validado com Zod (`src/lib/schemas.ts`) antes de tocar o banco. Rota sem schema Zod = BLOQUEADOR.
3. **Anti-injeção:** better-sqlite3 apenas com *prepared statements* (`db.prepare(...).run/get/all` com parâmetros vinculados). Concatenação de string em SQL = BLOQUEADOR, sem exceção.
4. **XSS/CSRF:** nunca usar `dangerouslySetInnerHTML` com dado de usuário; mutações apenas via cookie `sameSite` + verificação de sessão server-side em TODA rota de API (nenhuma rota confia no client).
5. **Path traversal:** qualquer operação de arquivo derivada de input do usuário (backups, restore, import) DEVE resolver e validar o caminho contra o diretório base permitido (`backups/`) antes de ler/escrever. (Regressão já corrigida no commit `9bb5d22` — não reintroduzir.)

## 2. Strict Rules — Autenticação e Sessão

1. **Segredo JWT persistente:** o segredo de assinatura (`jose`/HS256) DEVE vir de `JWT_SECRET` no `.env` (mínimo 32 bytes aleatórios), nunca gerado em runtime. `.env` jamais commitado.
2. **Expiração obrigatória:** sessão com expiração absoluta de 7 dias (`setExpirationTime`) e idle timeout de 24h. Token sem expiração = BLOQUEADOR.
3. **Cookie de sessão:** `httpOnly` + `sameSite=lax` (ou `strict`) + `secure` quando servido via HTTPS. Postura de produção; relaxamentos só via perfil de ambiente (Seção 8).
4. **Política de senha (NIST):** mínimo **8 caracteres**, comprimento sobre complexidade. Aplicada em criação de usuário, troca e reset de senha.
5. **Lockout:** 5 tentativas de login falhas → bloqueio de 15 minutos (por conta e por IP).
6. **Rate limiting em auth:** máximo 30 req/min por IP nas rotas de autenticação (`/api/auth/*`). Resposta 429 com `Retry-After`. (Rate limit em memória é aceitável — instância única PM2.)
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
3. **DR obrigatório:** **RPO = 24 horas | RTO = 4 horas.** Backup diário automatizado do SQLite via node-cron (já existente em `src/lib/backup.ts`), com retenção configurável (Settings). Responsável pós-entrega: administrador local do sistema (documentar no runbook).
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
1. **Erros:** logger estruturado local (`logs/`) com severidade; Sentry (free tier) opcional se o servidor tiver saída para internet.
2. **Performance:** tempo de resposta das rotas críticas registrado no logger (sem ferramenta paga — rede local).
3. **Negócio:** métricas definidas no `spec.md` §5 derivadas da tabela `transactions` (sem telemetria externa).

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
