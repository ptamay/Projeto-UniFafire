# security-constitution.md
> **Módulo:** Security Constitution | **Versão:** 4.0
> **Carregado em:** Fase 6 (Opus) | Fases 10–11 (sprint execution) | Fase 9 se envolver schema ou API
> **Depende de:** `master-spec-core.md`
> **Papel:** Fonte única de verdade para todas as `strict_rules`. O `master-spec-core.md`
> referencia este módulo — não duplica seu conteúdo. Em caso de conflito entre o core
> e este módulo, este módulo prevalece.

Este módulo contém as `strict_rules` completas do projeto — as leis inegociáveis que nenhum agente pode ignorar ou sobrescrever. Todo agente que gera código, schema, ou configuração de infraestrutura DEVE ter este módulo carregado.

---

## Índice de Carregamento Parcial (economia de tokens)

> Este módulo tem ~270 linhas. Nem toda tarefa precisa dele inteiro.
> Quando a tarefa é focada, carregue apenas as regras relevantes buscando pelo
> marcador de bloco (ex: `grep -A 20 "MULTI-TENANCY" security-constitution.md`).
> Carregue o módulo INTEIRO apenas na Fase 6 (síntese da Triad) e no Step 0 da Fase 10.

| Tarefa | Blocos a carregar (marcadores `<!-- -->`) |
|--------|-------------------------------------------|
| Quick Fix estilo/UI | `FRONTEND` + `SECRETS MANAGEMENT` |
| Task de schema/migration | `MULTI-TENANCY` + `MIGRAÇÕES DE BANCO DE DADOS` + `DADOS DE SEED` |
| Task de rota/endpoint | `VERSIONAMENTO DE API` + `PROTEÇÃO ANTI-DDoS` + `SAST + SCA` |
| Task de integração externa | `RESILIÊNCIA DISTRIBUÍDA` + `ARQUITETURA DE EVENTOS` |
| Task de auth/segurança | `SEGURANÇA` + `AUTENTICAÇÃO E SESSÃO` + `SECRETS MANAGEMENT` + `LOGGING SEGURO` |
| Task de UI de login/conta | `AUTENTICAÇÃO E SESSÃO` + `FRONTEND` |
| Task tocando fluxo crítico | `TESTES E2E DE FLUXOS CRÍTICOS` |
| Antes de deploy produção | `DISASTER RECOVERY` + `OBSERVABILIDADE` + `DAST E PENTEST` + `DEFINIÇÃO DE PRONTO` |
| Verificação de DoD | `DEFINIÇÃO DE PRONTO` (bloco único, autocontido) |
| Setup de custos de IA | `CONTROLE DE CUSTOS DE IA` |
| Sistema com dado sensível | carregue TAMBÉM `modules/high-assurance.md` (overlay MODO SENSÍVEL) |

> ⚠️ Na dúvida sobre qual bloco carregar, ou se a tarefa cruza múltiplas áreas:
> carregue o módulo inteiro. A economia de tokens nunca justifica pular uma
> regra de segurança aplicável. O índice é otimização, não desculpa para lacuna.

---

## 1. Valores Inegociáveis (Non-Negotiable Values)

```xml
<strict_rules>
  <!-- SEGURANÇA -->
  At-rest and in-transit encryption, input sanitization, protection against SQLi/XSS/CSRF,
  rate limiting, and request integrity validation on every endpoint.

  <!-- AUTENTICAÇÃO E SESSÃO -->
  Password policy (NIST-aligned): minimum 8 characters, length over complexity —
  no arbitrary composition rules; block passwords found in breach lists (zxcvbn or
  HaveIBeenPwned API). Login lockout: 5 failed attempts → 15-minute lock (account + IP).
  2FA (TOTP): mandatory for Admin/Super Admin roles in MODO PADRÃO; recommended for
  admin in MODO EXPRESSO. Sessions: httpOnly + secure + sameSite cookies; absolute
  expiry 7 days, idle timeout 24h (adjust per client risk in Phase 3); password change
  invalidates all other active sessions ("logout everywhere").
  Password reset: single-use token, 15-minute expiry; never reveal whether an e-mail
  exists ("se a conta existir, você receberá um link").
  All of the above are the PRODUCTION posture. In dev/test they relax via the environment
  security profile (see ENFORCEMENT POR AMBIENTE) so testing stays frictionless; staging
  mirrors production. The relaxation lives in one config, never as ad-hoc checks in code.

  Session Identity UI — DEFAULT SCOPE in every system with login (not an optional feature):
  1. The application shell MUST display who is logged in — name and role at minimum;
     visual form (avatar | text | icon) defined in ui-context.md — with a user menu:
     profile, change password, (2FA setup if enabled), logout.
  2. Account screens are mandatory routes: /account/profile (edit own data) and
     /account/security (change password, active sessions, 2FA). Delivered in the
     same sprint that delivers login — never postponed to "later".
  3. Style and placement are decided once in Phase 4.0 (ui-context.md); the PRESENCE
     is non-negotiable — only the form varies per system.
  A system with login where the user cannot see who they are, edit their own profile,
  or change their own password is an INCOMPLETE SPEC — block at Phase 6 CHECKPOINT.

  <!-- ENFORCEMENT POR AMBIENTE -->
  Security controls scale by environment so development stays frictionless WITHOUT
  weakening production. The relaxation must be declared in ONE place and mechanically
  prevented from reaching production — never scattered as ad-hoc `if (dev)` in the code.

  Single source of truth: a security profile driven by APP_ENV (dev | test | staging |
  production), e.g. `config/security-profile.ts`, exposing typed flags. Every control
  reads from it — no control checks the environment directly on its own.

  Relaxable in dev and test/CI only (developer velocity):
  - 2FA: bypassed for seed users; password policy: simple seed passwords allowed;
  - Lockout: disabled (never lock yourself out while testing);
  - Rate limiting: disabled or very high (so E2E/load tests do not trip it);
  - Email verification / magic link: auto-confirmed;
  - Audit anomaly alerts / break-glass: no-op.

  Staging MIRRORS production — no relaxation. Staging is the target of DAST, pentest and
  security E2E; a relaxed staging makes those tests worthless. Only dev and test/CI relax.

  NEVER relaxable in ANY environment (a dev shortcut here becomes a prod vulnerability):
  - Tenant isolation (tenant_id filter on every query);
  - Injection protections, input sanitization, output encoding;
  - Secrets never hardcoded (dev uses a dev secrets set, still injected, never in code);
  - Field-level encryption of sensitive data (dev uses a dev key so the encrypted path
    is exercised — turning it off in dev means you never test it);
  - HTTPS on staging/production (localhost dev may use http).

  Mechanical guard (Gate 6 of ci-gates.sh, non-bypassable): the build FAILS if any
  bypass flag (AUTH_BYPASS, SKIP_2FA, DISABLE_RATE_LIMIT, SEED_LOGIN, etc.) is truthy in
  a production or staging config, or if test/seed credentials appear outside seed/test
  paths. Dev convenience that reaches prod config is a BLOCKER, not a warning.

  <!-- QUALIDADE DE CÓDIGO -->
  Testable architecture (TDD), small single-responsibility functions, SOLID principles,
  DRY (Don't Repeat Yourself), and rigid standardization to prevent technical debt.
  Code must be generated without redundant comments.

  <!-- FRONTEND -->
  Responsive and accessible design adhering strictly to the Front-end Golden Rule.
  Global configuration (Tailwind config, globals.css, and font imports) and the creation
  of empty route files (skeletons) MUST precede any styling of individual components.

  <!-- STACK -->
  Prioritize lean technology stacks focused on token economy:
  prefer stacks with less boilerplate and better AI-generation cost/benefit
  (e.g., Next.js + Prisma over NestJS + TypeORM for mid-size projects).

  <!-- DADOS DE SEED -->
  Include a seeding script with at least one test user per role/profile.

  <!-- CARGA INICIAL DE DADOS (MIGRAÇÃO DE CONTEÚDO) -->
  When the system replaces an existing process (spreadsheet, paper, legacy system), the
  initial data load is NOT ad-hoc — it follows a protocol (see Fase 10.5 in sprint-governance):
  - Dry-run first against an ephemeral Neon/staging branch; never run the first load in prod.
  - Import scripts must be idempotent (re-running does not duplicate) and have a paired rollback.
  - Pre-load backup is mandatory; data cleaning happens before load, not after.
  - Reconciliation gate (mechanical): source count = destination count (minus documented
    rejects), zero orphan FKs, zero mandatory-field violations, sampled spot-check.
  - Sensitive data: field-level encryption and audit trail apply from the migration itself.
  - Client sign-off on a sample of migrated data is required before go-live.
  Distinct from schema migrations (structure) — this is content migration.

  <!-- MULTI-TENANCY -->
  The tenant isolation model MUST be defined in constitution.md before any schema is designed.
  Accepted models: schema-per-tenant | row-level-security | instance-per-tenant.
  Default to row-level-security unless the threat model or compliance requirements
  explicitly demand stronger isolation. Never mix isolation models within the same system.

  <!-- VERSIONAMENTO DE API -->
  All public API routes MUST be prefixed with /v[N]/ (e.g., /v1/orders).
  Breaking changes require a new version. Deprecation notice minimum: 90 days.
  Old versions must remain functional during the deprecation window.
  Document every version contract in api-contract.md.

  <!-- OBSERVABILIDADE -->
  Three layers of observability are mandatory before any production deploy.
  Default stack is free-tier only. Paid tools require explicit justification.
  1. Errors: Sentry (free tier — 5k errors/month). Alerts by severity (critical/high/low).
  2. Performance: Vercel Analytics (free tier, if hosted on Vercel) or PostHog (see below).
  3. Business: PostHog (free tier — 1M events/month). Tracks activation, retention,
     and time-to-first-value per feature.
  PostHog covers all three layers if simplicity is preferred over specialization.
  Upgrade to paid tools only when: errors exceed 5k/month (Sentry), events exceed
  1M/month (PostHog), or compliance requires data residency outside PostHog cloud.
  Business metrics MUST be defined in spec.md before launch, not added post-launch.

  <!-- MIGRAÇÕES DE BANCO DE DADOS -->
  Every database migration generated by an agent MUST follow this protocol:
  1. Generate the DOWN (rollback) script BEFORE applying the UP (migration).
  2. Verify cross-service dependencies before any ALTER TABLE or DROP.
  3. Never apply a migration to production without a verified rollback script.
  4. Two-folder pairing is mandatory: UP migrations live in /supabase/migrations/,
     and their paired DOWN (rollback) scripts live in /db/migrations/, both using
     the same timestamp prefix so Gate 2 of ci-gates.sh can match them mechanically.
  5. The rollback script must be tested in the ephemeral CI branch database (Neon)
     before the migration is considered safe for production.

  <!-- SAST + SCA -->
  No code generated by an agent may be merged without passing both:
  1. SAST (Static Application Security Testing): run Semgrep (free) on every PR.
     Block merge if any HIGH or CRITICAL finding is detected.
     Mandatory rules: no hardcoded secrets, no SQL string concatenation, no eval().
  2. SCA (Software Composition Analysis): run npm audit / pip-audit on every PR.
     Block merge if any dependency has a known CVE with severity HIGH or CRITICAL.
  3. Dependency pinning: lockfiles (package-lock.json, pnpm-lock.yaml, poetry.lock)
     are mandatory and committed. CI installs with npm ci (or the ecosystem equivalent)
     so the installed tree matches the lockfile exactly — never npm install in CI.
     An agent adding a dependency without updating the lockfile is a BLOCKER.
  These checks run automatically in CI and are non-bypassable.

  <!-- DAST E PENTEST -->
  Security testing does NOT wait for the software to be "finished" — it is layered:
  every commit (hooks) → every PR (SAST/SCA/Gates/E2E) → staging (DAST) → go-live (pentest).

  DAST (Dynamic Application Security Testing) — automated, free, continuous:
  - Tool: OWASP ZAP Baseline Scan (free, containerized) against the staging/preview URL.
  - When: weekly (scheduled CI job) + always before any production deploy.
  - Blocking: any HIGH finding blocks production deploy in MODO PADRÃO.
    MODO EXPRESSO: recommended. MODO MVP: not required.
  - GitHub Actions (add as scheduled workflow + pre-deploy step):
    ```yaml
    - name: DAST Baseline (OWASP ZAP)
      uses: zaproxy/action-baseline@v0.12.0
      with:
        target: 'https://staging.[projeto].vercel.app'
    ```

  Pentest (human/adversarial) — periodic and milestone-based, never "if there is time":
  - BEFORE first production go-live: MANDATORY if the system handles sensitive data
    (health, legal, financial) or processes payments; recommended otherwise.
  - AFTER structural changes to auth, tenancy or payment flows (Change Request Tipo D).
  - ANNUALLY for every system under an active maintenance contract (fleet cycle).
  - Who: external specialist when the client or compliance demands it (mandatory for
    sensitive data / payments). Otherwise the PME minimum is the AI Red Team white-box
    pentest — a structured adversarial pass grounded in the system's own constitution,
    threat model and api-contract. See `modules/ai-pentest.md`.
  - AI pentest is NOT a certified pentest: it is a continuous pre-screen that makes the
    eventual human pentest cheaper and cleaner. Never represent AI-only testing as a
    formal pentest to a client. Human pentest stays mandatory for sensitive-data/payment
    systems before go-live and for any compliance claim.
  - Findings enter the framework as Change Requests (Tipo C/D) — never fixed ad-hoc.

  <!-- ARCHITECTURE FITNESS FUNCTIONS -->
  Extends SAST. Fitness functions are automated architectural rules that run on every PR
  to prevent architectural decay across sprints. Implemented as Semgrep custom rules.
  Applies in MODO PADRÃO. Optional in MODO EXPRESSO. Not applicable in MODO MVP.

  Create `.semgrep/fitness.yml` in the project root with the following rules:

  Rule 1 — No direct DB access in controllers/routes:
    Pattern: any import of Prisma client or raw SQL in files under `/routes/`, `/controllers/`, `/pages/api/`
    except via a service or repository layer.
    Message: "Controller accessing database directly. Move query to service or repository layer."
    Severity: WARNING (blocking in MODO PADRÃO after Sprint 2)

  Rule 2 — No query without tenant filter (multi-tenant only):
    Pattern: any `.findMany()`, `.findFirst()`, `.findUnique()`, `SELECT` without `tenant_id` or `tenantId` filter.
    Message: "Query missing tenant_id filter. Potential cross-tenant data leakage."
    Severity: ERROR (always blocking in multi-tenant projects)

  Rule 3 — No public endpoint without auth policy:
    Pattern: any route handler in Next.js API routes or Express without an auth middleware import.
    Message: "Public endpoint without authentication policy. Add auth middleware or explicitly mark as intentionally public."
    Severity: WARNING (blocking in MODO PADRÃO after Sprint 1)

  Rule 4 — No module with excessive direct imports (coupling detector):
    Pattern: any file with more than 8 distinct local imports (not node_modules).
    Message: "Module has high coupling (>8 dependencies). Consider extracting responsibilities."
    Severity: WARNING (non-blocking — logged in Report step for human review)

  Add to `.github/workflows/ci.yml`:
  ```yaml
  - name: Architecture Fitness Check
    run: semgrep --config=.semgrep/fitness.yml --error
  ```

  Fitness rules evolve with the project. When a rule generates false positives consistently,
  update the rule with an exception comment — never disable the rule globally.
  Document exceptions in `plan.md` under `## Fitness Function Exceptions`.

  <!-- SECRETS MANAGEMENT -->
  No secret, credential, API key, token, or password may exist in source code,
  environment files committed to git, or any log output.
  Default secrets manager for PME projects: Doppler (free tier).
  Alternatives: AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault.
  Rule: every secret must be injected at runtime via the secrets manager.
  CI/CD pipelines must read secrets from the manager — never from .env files in the repo.
  SAST (Semgrep) must include secret-detection rules on every PR.

  <!-- DISASTER RECOVERY — OBRIGATÓRIO -->
  Disaster Recovery is NOT optional. Every production system must define:
  - RPO (Recovery Point Objective): maximum acceptable data loss window.
    Default if not specified by client: 24 hours.
  - RTO (Recovery Time Objective): maximum acceptable downtime.
    Default if not specified by client: 4 hours.
  - Backup: automated daily backup mandatory minimum.
    Recommended: Supabase automated backups, Neon PITR, or pg_dump via cron.
  - Responsibility: document explicitly who owns backup monitoring after delivery.
  These values must be agreed with the client in Phase 3 and recorded in constitution.md.
  A system without documented DR values must not be deployed to production.

  <!-- LOGGING SEGURO -->
  No log output may contain:
  - Passwords or password hashes
  - JWT tokens or session tokens
  - API keys or secrets
  - PII (Personally Identifiable Information): CPF, RG, full name + contact combined,
    credit card numbers, medical data
  All logging libraries must be configured with masking rules before first deploy.
  Recommended: use structured logging (pino, winston) with a PII redaction plugin.
  Violation: any log containing the above is a CRITICAL finding — blocks deploy.

  <!-- RESILIÊNCIA DISTRIBUÍDA -->
  Applies when the system has ANY external integration (payment gateway, delivery API,
  fiscal API, SMS/email provider, or any third-party HTTP call).
  Every external integration MUST implement:
  - Timeout: maximum wait time defined per integration (default: 5s for sync, 30s for async).
  - Retry with exponential backoff: max 3 retries, doubling interval (1s, 2s, 4s).
  - Circuit Breaker: after 3 consecutive failures, open circuit for 30s before retrying.
  - Dead Letter Queue (DLQ): for async operations, failed messages must be captured
    and reprocessed — never silently discarded.
  These patterns are mandatory in MODO PADRÃO.
  In MODO EXPRESSO: required only if external integrations are present.

  <!-- ARQUITETURA DE EVENTOS -->
  Applies when the system has ANY asynchronous operation, webhook, background job,
  or inter-service communication (payment callbacks, delivery status, email queues, etc.).
  In MODO PADRÃO with async integrations, define event architecture BEFORE schema design.

  Event naming convention — mandatory:
  - Format: {aggregate}.{action}.v{N}  (e.g., order.created.v1, payment.approved.v1)
  - Version bump required on any breaking change to event payload.
  - Events must never be renamed — create a new version and deprecate the old one.

  Every event MUST be:
  - Idempotent: processing the same event twice must produce the same result.
  - Versioned: payload schema pinned to a version; consumers declare which version they handle.
  - Traceable: every event carries a correlation_id for end-to-end tracing.

  Queue/broker selection by project complexity:
  | Option | When to use | Free tier |
  |--------|------------|-----------|
  | BullMQ + Upstash Redis | MODO PADRÃO, low-to-mid volume, already using Redis | ✅ |
  | Supabase Realtime | Simple pub/sub inside Supabase stack | ✅ |
  | AWS SQS | Cloud-native, high reliability requirement | Pay-per-use |
  | RabbitMQ / Kafka | High-throughput, multi-consumer, enterprise | Self-hosted |

  Default for PME MODO PADRÃO: BullMQ + Upstash Redis (already in stack for rate limiting).
  Document event contracts in `event-catalog.md` under `/docs/`.
  These rules apply in MODO PADRÃO when async integrations are present.
  In MODO EXPRESSO and MODO MVP: not required.

  <!-- PROTEÇÃO ANTI-DDoS E RATE LIMITING -->
  Every system must implement the following layers before production deploy:

  LAYER 1 — CDN + WAF (mandatory, free):
  - All traffic must pass through Cloudflare (free tier minimum).
  - Enable: DDoS protection, Bot Fight Mode, and Web Application Firewall (WAF).
  - Configure: block known malicious IPs, enable "I'm Under Attack" mode capability.
  - SSL/TLS: enforce HTTPS-only via Cloudflare. Never expose origin IP.

  LAYER 2 — Rate Limiting at Application Level (mandatory):
  - Every public API route must have rate limiting middleware.
  - Default limits: 100 requests/minute per IP for public routes.
                    30 requests/minute per IP for auth routes (login, register, reset).
                    10 requests/minute per IP for sensitive actions (payment, OTP).
  - Recommended: Upstash Redis (free tier) for distributed rate limiting.
  - Alternative: in-memory rate limiting (express-rate-limit, next-rate-limit) for simple apps.
  - Response on limit exceeded: HTTP 429 with Retry-After header. Never expose internal errors.

  LAYER 3 — Request Hardening (mandatory, zero cost):
  - Set security headers on every response:
    X-Content-Type-Options: nosniff
    X-Frame-Options: DENY
    X-XSS-Protection: 1; mode=block
    Strict-Transport-Security: max-age=31536000; includeSubDomains
    Content-Security-Policy: defined per application
  - Recommended library: helmet.js (Node/Express) or next-safe (Next.js). Zero cost.
  - Limit request body size: default max 1MB for JSON, 10MB for file uploads.
  - Reject requests with unexpected Content-Type headers.

  LAYER 4 — Infrastructure Protection (conditional — activate for MODO PADRÃO):
  - Hide origin server IP: never expose origin behind Cloudflare.
  - Enable Cloudflare "Under Attack Mode" capability in incident runbook.
  - For high-traffic systems: consider Cloudflare Pro ($20/month) for dedicated L7 DDoS.
  - Connection limits: configure max concurrent connections at reverse proxy level (nginx/caddy).

  <!-- TESTES E2E DE FLUXOS CRÍTICOS -->
  Every flow listed in overview.md "Fluxos que não podem falhar" MUST have an
  end-to-end smoke test (Playwright) exercising the real UI against a test database.
  Scope: 3–7 tests covering the critical happy paths (login, checkout, core flow) —
  NOT full E2E coverage; smoke only. Runs in CI on every PR that touches those flows
  and always before any production deploy.
  MODO PADRÃO: blocking. MODO EXPRESSO: recommended. MODO MVP: not required.
  Unit/integration coverage does NOT substitute this gate — only E2E proves the
  assembled system works end to end.

  <!-- DEFINIÇÃO DE PRONTO (Definition of Done — DoD) -->
  A task is ONLY considered done when ALL of the following are true:
  - All acceptance criteria from tasks.md are met and verified.
  - Unit and integration tests pass (minimum coverage: 80%).
  - E2E smoke: if the task touches a flow listed in "Fluxos que não podem falhar",
    the corresponding Playwright test passes (blocking in MODO PADRÃO).
  - Session identity: if the task delivers or alters login, the shell shows the
    logged-in user and the /account routes exist (see AUTENTICAÇÃO E SESSÃO).
  - Linter passes with zero errors.
  - No console.log, debug flags, or dead code in production paths.
  - Accessibility: WCAG AA compliance verified for all new UI components.
  - No open HIGH or CRITICAL severity findings in the threat model.
  - Tenant isolation verified: no cross-tenant data leakage in any new query.
  - API versioning respected: no unversioned public routes introduced.
  - SAST passed: Semgrep returns zero HIGH/CRITICAL findings.
  - SCA passed: npm audit / pip-audit returns zero HIGH/CRITICAL CVEs.
  - If migration included: rollback script generated, tested in Neon branch, and committed alongside migration.
  - Secrets: zero secrets in source code or logs — all injected via secrets manager.
  - Logging: no PII, tokens, or passwords in any log output verified.
  - DR documented: RPO and RTO values recorded in constitution.md before production deploy.
  - DAST: ZAP baseline against staging with zero HIGH findings before production deploy
    (MODO PADRÃO). Pentest done per the DAST E PENTEST block if sensitive data/payments.
  - Resilience: all external integrations have timeout, retry, and circuit breaker implemented.
  - DDoS Layer 1: Cloudflare configured with Bot Fight Mode and WAF active.
  - DDoS Layer 2: rate limiting middleware active on all public and auth routes.
  - DDoS Layer 3: security headers (helmet.js or equivalent) configured and verified.
  - Performance Gate (MODO PADRÃO only): for endpoints marked as critical in spec.md,
    p95 latency < 500ms and p99 latency < 1000ms verified via load test before production deploy.
    Tool: k6 (free, open-source). Minimum: 50 concurrent users, 60s duration.
    Exemption: endpoints not marked critical in spec.md are excluded from this gate.

  <!-- CONTROLE DE CUSTOS DE IA -->
  AI cost visibility is mandatory in MODO PADRÃO for agentic projects.
  Define in `plan.md` under section `## AI Cost Budget`:
  - Provider budgets: Gemini / Claude / OpenAI — monthly cap per provider in USD.
  - Sprint budget: estimated token cost per sprint (input + output tokens × rate).
  - Project budget: total cap across all sprints.
  Monitoring: enable usage dashboards in each provider's console.
  Alert threshold: notify when 80% of monthly budget is consumed.
  Rule: no agent sprint may begin without an approved AI Cost Budget in plan.md (MODO PADRÃO).
  In MODO EXPRESSO: optional but recommended. In MODO MVP: not required.

  <!-- AMBIGUIDADE -->
  If the scope is incomplete or contradictory at any phase, explicitly flag it,
  propose the safest default option, and wait for confirmation before proceeding.
  Never silently make assumptions.
</strict_rules>
```

---
