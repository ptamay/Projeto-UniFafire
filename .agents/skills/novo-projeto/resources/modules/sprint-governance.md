# sprint-governance.md
> **Módulo:** Sprint Governance | **Versão:** 4.0
> **Carregado em:** Fases 7–9 (setup + tasks) | Fases 10–11 (execução + release)
> **Depende de:** `master-spec-core.md`
>
> **Nota sobre `security-constitution.md`:** Este módulo não depende diretamente de
> `security-constitution.md` nas Fases 7–9 pois essas fases configuram workspace e geram
> tasks — não geram código. O módulo de segurança é injetado obrigatoriamente nas
> **Fases 10–11** (execução de sprint) e opcionalmente na **Fase 9** se tasks envolverem
> schema de banco ou design de API. Consulte `SKILL.md` para o mapa de carregamento completo.

Este módulo contém a estrutura completa de todas as fases operacionais: desde o pré-processamento do overview (Fase 0) até a retrospectiva e release governance (Fase 11). É o manual de operação sessão a sessão.

> **Atenção ao Modo:** Verifique o modo do projeto (MVP / Expresso / Padrão) no `master-spec-core.md` antes de executar qualquer fase. Fases marcadas como opcionais ou inexistentes em cada modo devem ser puladas conforme a tabela de recursos condicionais do core.

---

## 1. Estrutura de Fases (Phase Structure)

---

### Fase Comercial — Discovery e Proposta (opcional, antes da Fase 0)

> *Para projetos de cliente externo. Roda em qualquer chat — não precisa de workspace.*
> Objetivo: transformar a conversa de venda em proposta com preço e prazo defensáveis,
> usando a régua de capacidade que o framework já tem (16 pts ≈ 2–3 dias), **sem**
> executar as Fases 1–5.

1. **Discovery rápido** (15–30 min de conversa): problema, funcionalidades macro,
   nº aparente de entidades, integrações, dados sensíveis, multi-cliente?
2. **Classifique o modo provável** (MVP / Expresso / Padrão) pela tabela da Seção 4 do core.
3. **Estime sprints:** liste as features macro → converta em pontos (S=1 | M=2 | L=4) →
   divida por 16 pts/sprint. Some 1 sprint de fundação (auth + shell + base) e 20% de margem.
   **Se há dado legado a migrar, some a Fase 10.5 como esforço próprio** — carga de dados
   com reconciliação é sprint, não "detalhe de configuração"; esquecê-la é o erro de
   estimativa mais comum ao substituir uma planilha/sistema.
4. **Converta em proposta:**
   - Prazo: sprints × 2–3 dias úteis + margem
   - Preço: sprints × seu valor-sprint, OU valor fechado com margem de risco
   - Infra mensal do cliente: `cost_model.md` (Gap 1 do `maturity-gaps.md`) se for SaaS
5. **Gere `proposta-[cliente].md`** com: escopo macro, modo previsto, nº de sprints,
   preço, prazo, premissas, **exclusões explícitas** (o que NÃO está incluso — a
   cláusula que mais evita conflito), condições de manutenção pós-entrega
   (ver `modules/fleet-operations.md` Seção 5) e validade da proposta.
6. **Proposta aceita** → rode `novo-projeto.ps1`, mova a proposta para `/docs/` do
   projeto e inicie a Fase 0 — o texto do discovery vira rascunho do `overview.md`.

> ⚠️ A estimativa desta fase é compromisso de PROPOSTA, não de spec. Se as Fases 1–5
> revelarem escopo maior que o proposto, isso é **Change Request comercial** — renegocie
> com o cliente antes da Fase 6. Nunca absorva a diferença silenciosamente.

---

### Fase 0 — Pré-processamento do Overview (no workspace do projeto)

> *Pré-requisito: o workspace do projeto já existe (raiz criada + `.agents/` copiado do
> template — ex: via `novo-projeto.ps1`). Execute esta fase **dentro do Antigravity**
> (recomendado — a Fase 1 continua na mesma sessão) ou do **Claude Code**, sempre com o
> diretório de trabalho na raiz do projeto. Assim o agente salva o `overview.md`
> diretamente no caminho correto, sem etapa manual de copiar/colar.*
>
> ⚠️ **Requisito de ambiente:** As Fases 0–11 requerem um ambiente com acesso a sistema de arquivos
> do projeto (Antigravity, Claude Code, ou equivalente). Sessões de chat sem acesso ao workspace
> (ex: Claude.ai sem arquivos carregados) podem discutir as Fases 0–6 para planejamento, mas
> os artefatos devem ser salvos no workspace antes de prosseguir. Se o ambiente não estiver
> disponível, informe o usuário antes de prosseguir.

**Fluxo:**

1. O usuário escreve em linguagem humana e tópicos livres tudo que o sistema deve fazer — funcionalidades, perfis, permissões, restrições, integrações, modelo de negócio. Pode ser direto no chat ou colando um texto pronto.
2. O usuário instrui o agente:
   > *"Formate o texto abaixo como um `overview.md` estruturado, respeitando exatamente este template, sem inventar informações não fornecidas, e salve em `/.agents/memory/overview.md`:"*
3. Use o template abaixo como estrutura de saída obrigatória:

```
# overview.md — [Nome do Projeto]

## Problema que resolve
[Descrição do problema e quem sofre com ele]

## Usuários e perfis
[Liste os perfis em linguagem humana com suas responsabilidades]

## Funcionalidades principais
[Liste o que o sistema deve fazer — MVP primeiro, desejável depois]

## Fluxos que não podem falhar
[Ex: checkout, autenticação, envio de notificação crítica]

## Restrições conhecidas
[Latência, volume de usuários, modo offline, SLA, orçamento de infra]

## Integrações previstas
[APIs externas, serviços de pagamento, autenticação SSO, etc.]

## Modelo de negócio
[SaaS, licença, marketplace, uso interno — e se é B2B/multi-tenant]
```

4. O agente salva o arquivo em `/.agents/memory/overview.md` e confirma o caminho ao usuário.
5. Prossiga para a Fase 1 — na mesma sessão, se estiver no Antigravity. O agente lerá o arquivo do workspace — não há upload.

> **Regra desta fase — o agente apenas FORMATA:** não entreviste, não sugira, não complete
> lacunas com suposições. Perguntas de refinamento pertencem à Fase 1. Se faltar informação
> para alguma seção do template, preencha com "[não informado]" — a Fase 1 captura o que falta.

---

### Fase 7 — Governança do Espaço de Trabalho (Workspace & Sandbox)

> *Obrigatória no MODO PADRÃO. Opcional no MODO EXPRESSO.*
> A partir daqui, retome com Gemini Pro usando a Triad validada como contexto fixo.

Gere as regras estritas de governança local para o Antigravity Agent Manager:

- `mcp_config.json` usando exclusivamente `serverUrl` para conexões remotas.
- `agent_config.py` com política `deny("*")` e `ask_user("run_command")` para qualquer shell.
- Configuração da JavaScript Execution Policy como `Request review` ou `Disabled` na IDE.

**Instrução ao usuário:**
> *"Aplique estas configurações de sandbox no seu ambiente Antigravity para garantir que a orquestração ocorra de forma isolada e segura."*

**Ação obrigatória após configuração do sandbox — Geração do `CLAUDE.md`:**

Crie o arquivo `CLAUDE.md` na raiz do projeto com o conteúdo abaixo.
Este arquivo é lido automaticamente pelo Claude Code ao iniciar em qualquer diretório do projeto,
permitindo handoff de contexto entre Antigravity e Claude Code sem intervenção manual.

```markdown
# CLAUDE.md — Contexto do Projeto para Claude Code
> Lido automaticamente pelo Claude Code ao iniciar em qualquer diretório do projeto.
> Versão compatível com Constitutional SDD v4.0
> ⚠️ Não editar manualmente — atualizado automaticamente pelo Memory Sync (Step 10) ao fim de cada sprint,
> e pelo Checkpoint (comando "checkpoint") a qualquer momento durante uma sessão.

---

## ⚠️ Requisito de Diretório

Este arquivo deve estar na **raiz do projeto**. O Claude Code (Desktop ou Terminal) só carrega
`CLAUDE.md` automaticamente se o diretório de trabalho configurado for esta raiz, ou um diretório
acima dela — nunca uma subpasta.

Se você abrir o Claude Code e ele não parecer ter contexto do projeto, confirme que o diretório
de trabalho está configurado para a raiz onde este arquivo está. Não é necessário pedir para
"ler o CLAUDE.md" — se o diretório estiver correto, a leitura é automática.

---

## Comandos de Sessão — "checkpoint" e "retoma"

Estes dois comandos existem para que trocar de chat nunca signifique perder contexto
ou precisar reler o `master-spec-core.md` e os módulos inteiros.

### Quando o usuário disser **"checkpoint"**:
1. Atualize a seção `## Checkpoint Atual` abaixo com o estado exato desta sessão.
2. Confirme em 1 linha: *"Checkpoint salvo — [resumo de 1 frase]."*
3. Não faça mais nada além disso. Este comando não dispara Memory Sync nem commit.

### Quando o usuário disser **"retoma"** (geralmente em um chat novo):
1. Leia a seção `## Checkpoint Atual` abaixo.
2. Resuma o estado em 2–3 linhas: onde paramos, o que falta, próxima ação.
3. Se a seção estiver vazia ou desatualizada (sem checkpoint desde o último Memory Sync),
   use a seção `## Estado atual do projeto` como fallback.
4. Não releia `master-spec-core.md` ou módulos a menos que a próxima ação exija
   especificamente uma regra deles — neste caso, leia apenas o módulo necessário.

---

## Checkpoint Atual
> Atualizado a qualquer momento via comando "checkpoint". Sobrescrito — não é histórico.
> Se vazio, esta sessão ainda não gerou checkpoint intermediário — use "Estado atual do projeto" abaixo.

```
Sessão       : [ex: Fase 6 (Claude Code) | Sprint 3 Step 4 (Antigravity) | Fase 9 (tasks) ]
Última ação  : [o que foi concluído nesta sessão, 1 linha]
Próxima ação : [o próximo passo exato — específico o suficiente para retomar sem ambiguidade]
Decisões em aberto : [pendências de confirmação do usuário, ou "nenhuma"]
Arquivos não commitados : [lista de arquivos alterados nesta sessão ainda não commitados, ou "nenhum"]
Atualizado em : [YYYY-MM-DD HH:MM]
```

---

## Antes de qualquer ação — leitura proporcional ao contexto

> **Regra geral:** leia apenas o que a próxima ação exige.
> Reler todos os arquivos por hábito desperdiça janela de contexto
> e aumenta custo de tokens sem benefício operacional.

**Se o comando for "retoma" E `## Checkpoint Atual` tem próxima ação definida:**
→ Leia **apenas** o `## Checkpoint Atual`. Resuma e continue.
→ Não releia os arquivos abaixo a menos que a próxima ação exija especificamente.

**Se o checkpoint estiver vazio, desatualizado, ou a ação exigir contexto estrutural:**
→ Leia nesta ordem, parando assim que tiver o suficiente para a tarefa:

1. `.agents/memory/constitution.md` — lei máxima (se ausente: pare e avise)
2. `.agents/memory/plan.md` — stack aprovada, decisões, AI Cost Budget
3. `.agents/memory/spec.md` — escopo e métricas (leia só se a tarefa envolve requisitos)
4. `.agents/memory/overview.md` — contexto humano (leia só se não tiver clareza do domínio)

> Nunca releia todos os 4 por reflexo. Se `constitution.md` + `plan.md` são suficientes
> para a tarefa, pare aí. `spec.md` e `overview.md` são sob demanda.

---

## Seu papel neste projeto

Você é o **agente de arquitetura e desbloqueio**, não o agente de execução de sprint.

| Faça | Não faça |
|------|----------|
| Auditar consistência de artefatos | Executar tasks do `tasks.md` autonomamente |
| Gerar e revisar ADRs | Substituir o Antigravity na execução de sprint |
| Depurar decisões complexas | Criar código sem verificar `constitution.md` |
| Revisar Fitness Functions (`.semgrep/`) | Assumir stack não listada no `plan.md` |
| Apoiar a Fase 6 (síntese SDD Triad) | Avançar fases sem aprovação explícita do usuário |

---

## Estado atual do projeto

> ⚠️ Esta seção é atualizada pelo Antigravity ao fim de cada sprint via Memory Sync (Step 10).
> Se estiver desatualizada, leia `.agents/memory/constitution.md` como fonte de verdade.

```
Modo do projeto   : [PREENCHER NA FASE 1 — MVP | Expresso | Padrão]
Sprint atual      : 1
Última sprint     : —
Fase atual        : 7
Último commit     : (ver git log -1)
Próxima ação      : Fase 8 — geração de tasks da Sprint 1
```

---

## Stack aprovada (referência rápida)

> Fonte canônica: `.agents/memory/plan.md` — seção "Stack e Decisões".
> Não use ferramentas fora desta lista sem registro explícito em `plan.md`.

| Camada | Ferramenta padrão |
|--------|------------------|
| Frontend | Next.js + Tailwind CSS + shadcn/ui |
| Backend / ORM | Prisma + PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Deploy | Vercel (frontend) + Railway (backend) |
| Secrets | Doppler |
| CDN / WAF | Cloudflare (free tier) |
| Rate limiting | Upstash Redis |
| Erros | Sentry (free tier) |
| Analytics | PostHog (free tier) |
| SAST | Semgrep |
| Agente de sprint | Antigravity |

---

## Quando o usuário te aciona — contextos comuns

### Fase 6 — Geração da SDD Triad (você é protagonista aqui)

> ⚠️ Nesta fase, `constitution.md`, `spec.md` e `plan.md` **ainda não existem** —
> sua função é GERÁ-LOS, não auditá-los.

Leia `.agents/memory/handoff.md` (gerado pelo Gemini ao fim da Fase 5) e
`.agents/memory/overview.md`. Carregue os módulos `security-constitution.md` +
`architecture-governance.md` da skill `novo-projeto` (eles fazem parte do framework
instalado — pasta `resources/modules/` da skill — e **não** vivem neste repositório)
antes de gerar qualquer artefato.

Gere `constitution.md`, `spec.md`, `plan.md` (e `api-contract.md` + `adr/*.md` se
aplicável) conforme o template da Fase 6 em `master-spec-core.md` (skill `novo-projeto`).

Ao final, execute o checklist do CHECKPOINT da Fase 6 (mesmo arquivo) antes de
informar ao usuário que pode prosseguir para a Fase 7.

**Calibração de esforço nesta fase:** ver seção "Effort Levels — Fase 6" em
`master-spec-core.md` (skill `novo-projeto`). Gates e checklists usam esforço mínimo; síntese de
`constitution.md`, `plan.md` e auditoria cruzada usam esforço máximo.

### Desbloqueio de sprint (Antigravity travou)
Leia `.agents/workflows/sprint-execution.md` + `tasks.md` da sprint atual.
Entenda o que o agente fez, o que falhou e por quê.
Proponha a correção. Não reescreva o que já foi feito sem necessidade.

### Change Request — nova ideia ou mudança de escopo
Ouça a descrição do usuário. Classifique como Tipo A, B, C ou D conforme
a Seção 6.1 do `master-spec-core.md`. Apresente a classificação e o impacto
antes de alterar qualquer artefato. Aguarde confirmação para Tipo C e D.
Nunca implemente a mudança diretamente — atualize `spec.md`, `plan.md` e/ou
`adr/*.md` e faça o commit do Change Request. A implementação entra pelo
ciclo TDD normal na próxima sprint.

### Geração de ADR
Use o template de `/docs/adr/ADR-NNN-*.md`.
Baseie-se em decisões já tomadas e registradas em `plan.md`.
Nunca invente decisão — apenas formalize o que já foi decidido.

### Review pós-sprint
Leia o Report do Step 9 em `.agents/workflows/sprint-execution.md`.
Verifique Fitness Functions, AI Validation Gate e débitos técnicos.
Atualize `plan.md` se necessário.

---

## Regras inegociáveis (herdadas do `constitution.md`)

- Nunca hardcode secrets, tokens ou credenciais
- Nunca query sem filtro `tenant_id` em projetos multi-tenant
- Nunca rota pública sem prefixo `/v[N]/`
- Nunca migration sem rollback pareado
- Nunca merge sem Semgrep + npm audit limpos
- Em caso de ambiguidade: pare, sinalize, aguarde confirmação

---

## Localização dos artefatos principais

```
.agents/
  memory/
    constitution.md     ← lei máxima
    spec.md             ← o quê e por quê
    plan.md             ← como e roadmap
    overview.md         ← contexto humano
    handoff.md          ← resumo Fases 1–5 (para Fase 6)
    ui-context.md       ← identidade visual (para agentes de UI)
  workflows/
    sprint-execution.md ← workflow autônomo Antigravity
    quick-fix.md        ← workflow de pedidos pontuais
  rules/                ← regras Antigravity (00-core … 40-change-request) — zona somente leitura
  mcp_config.json       ← governança MCP
  agent_config.py       ← sandbox deny-by-default

docs/
  adr/                  ← Architecture Decision Records
  releases/             ← Release governance
  threat_model_stride.md
  api-contract.md
  event-catalog.md

supabase/migrations/    ← migrations UP
db/migrations/          ← scripts DOWN (rollback) pareados por timestamp com o UP
assets/brand/           ← logo e identidade visual

.semgrep/
  fitness.yml           ← Fitness Functions arquiteturais
```
```

**Ação obrigatória após criação do `CLAUDE.md` — Criação do git hook `post-commit`:**

Crie o arquivo `.git/hooks/post-commit` com o conteúdo abaixo.
Este hook detecta commits de Memory Sync e exibe um lembrete no terminal
para acionar o Claude Code — sem intervenção manual do usuário.

```bash
#!/bin/sh
# post-commit hook — Constitutional SDD v4.0
# Detecta commits de Memory Sync e sugere acionar o Claude Code.

COMMIT_MSG=$(git log -1 --pretty=%s)

if echo "$COMMIT_MSG" | grep -q "memory sync"; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  ✅ Memory Sync concluído — CLAUDE.md atualizado         ║"
  echo "║                                                          ║"
  echo "║  Para acionar o Claude Code com contexto completo:      ║"
  echo "║  $ claude                                                ║"
  echo "║                                                          ║"
  echo "║  Sugestões de uso:                                       ║"
  echo "║  · Revisão pós-sprint e geração de ADRs                 ║"
  echo "║  · Desbloqueio de decisão arquitetural                  ║"
  echo "║  · Auditoria de Fitness Functions                       ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""
fi
```

Após criar o arquivo, torne-o executável:
```bash
chmod +x .git/hooks/post-commit
```

> ⚠️ O diretório `.git/hooks/` não é versionado pelo Git.
> Se o projeto tiver outros desenvolvedores, instrua-os a recriar o hook
> manualmente, ou adicione um script de setup em `/scripts/install-hooks.sh`.

Faça o commit dos dois artefatos juntos:
```
chore: add CLAUDE.md and post-commit hook — Claude Code context bootstrap
```

---

**Ação obrigatória — Gates Mecânicos de CI (anti-alucinação + segurança):**

> Estes gates existem porque auto-auditoria por LLM é pouco confiável. O Step 8
> (AI Validation Gate) pede ao agente para verificar se alucinou uma API ou
> esqueceu um DOWN — mas um agente que alucina geralmente não percebe que alucinou.
> Estes scripts provam mecanicamente o que o agente apenas promete. São não-bypassáveis.

Crie `scripts/ci-gates.sh`:

```bash
#!/bin/bash
# Gates mecânicos — Constitutional SDD v4.0
# Não dependem de julgamento do LLM. Rodam no CI e no pre-push.
set -e

FAIL=0

echo "▶ Gate 1 — Imports existem em package.json (anti-alucinação)"
# Extrai imports de node_modules e confirma que cada pacote está declarado.
# Um import de pacote não listado em package.json = provável alucinação de dependência.
MISSING=$(node scripts/check-imports.js 2>/dev/null || echo "SCRIPT_MISSING")
if [ "$MISSING" = "SCRIPT_MISSING" ]; then
  echo "  ⚠ check-imports.js ausente — pulando (gere na primeira sprint com código)"
elif [ -n "$MISSING" ]; then
  echo "  ❌ Imports sem correspondência em package.json:"
  echo "$MISSING"
  FAIL=1
else
  echo "  ✅ Todos os imports têm pacote declarado"
fi

echo "▶ Gate 2 — Migrations UP têm DOWN pareado (segurança)"
# Toda migration em supabase/migrations deve ter par em db/migrations com mesmo timestamp.
GATE2_FAIL=0
for up in supabase/migrations/*.sql; do
  [ -e "$up" ] || continue
  ts=$(basename "$up" | grep -oE '^[0-9]+' || true)
  if [ -z "$ts" ]; then
    echo "  ❌ Migration sem prefixo de timestamp: $up"
    GATE2_FAIL=1
    continue
  fi
  if ! ls db/migrations/${ts}*.sql >/dev/null 2>&1; then
    echo "  ❌ Migration sem DOWN pareado: $up (timestamp $ts)"
    GATE2_FAIL=1
  fi
done
if [ "$GATE2_FAIL" -eq 0 ]; then
  echo "  ✅ Todas as migrations têm DOWN pareado"
else
  FAIL=1
fi

echo "▶ Gate 3 — Nenhum secret hardcoded (segurança)"
# Reforço mecânico além do Semgrep — padrões óbvios de secret em código-fonte.
if grep -rEn "(api[_-]?key|secret|password|token)\s*=\s*['\"][A-Za-z0-9_\-]{16,}['\"]" \
   --include="*.ts" --include="*.tsx" --include="*.js" src/ app/ 2>/dev/null; then
  echo "  ❌ Possível secret hardcoded encontrado"
  FAIL=1
else
  echo "  ✅ Nenhum secret óbvio em código-fonte"
fi

echo "▶ Gate 4 — Ordem TDD: red antes de green (disciplina)"
# Para cada TASK-NNN, o PRIMEIRO commit test|feat no histórico deve ser test.
# feat sem test anterior = TDD atômico violado — prova mecânica, não julgamento.
GATE4_FAIL=0
TASKS=$(git log --pretty=%s 2>/dev/null | grep -oE 'feat\(TASK-[0-9]+\)' | grep -oE 'TASK-[0-9]+' | sort -u || true)
for t in $TASKS; do
  first=$(git log --reverse --pretty=%s | grep -E "^(test|feat)\($t\)" | head -1 || true)
  case "$first" in
    feat*)
      echo "  ❌ $t: commit 'feat' sem 'test: red' anterior — TDD atômico violado"
      GATE4_FAIL=1 ;;
  esac
done
if [ "$GATE4_FAIL" -eq 0 ]; then
  echo "  ✅ Ordem TDD respeitada (red antes de green) em todas as tasks"
else
  FAIL=1
fi

echo "▶ Gate 5 — Type-check (anti-alucinação de API)"
# check-imports.js pega PACOTE inventado; tsc pega MÉTODO/TIPO inventado
# dentro de pacote real (ex: função inexistente do Prisma).
if [ -f tsconfig.json ]; then
  if npx tsc --noEmit >/dev/null 2>&1; then
    echo "  ✅ tsc --noEmit passou — APIs e tipos usados existem"
  else
    echo "  ❌ tsc --noEmit falhou — possível API alucinada ou erro de tipo:"
    npx tsc --noEmit 2>&1 | head -20
    FAIL=1
  fi
else
  echo "  ⚠ tsconfig.json ausente — pulando (projeto não-TypeScript)"
fi

echo "▶ Gate 6 — Ambiente: nenhum bypass de dev em config de produção/staging"
# Relaxamentos de segurança são permitidos SÓ em dev/test. Se uma flag de bypass
# vazar para config de produção/staging, o atalho de desenvolvimento vira vulnerabilidade.
GATE6_FAIL=0
BYPASS='(AUTH_BYPASS|SKIP_2FA|DISABLE_2FA|DISABLE_AUTH|DISABLE_RATE_LIMIT|ALLOW_INSECURE|SEED_LOGIN|INSECURE_COOKIES)'
for f in .env.production .env.prod .env.staging; do
  [ -e "$f" ] || continue
  if grep -qiE "^[[:space:]]*(export[[:space:]]+)?${BYPASS}[[:space:]]*=[[:space:]]*(true|1|yes|on)" "$f"; then
    echo "  ❌ Flag de bypass de dev ativa em $f — proibido em prod/staging"
    grep -inE "^[[:space:]]*(export[[:space:]]+)?${BYPASS}[[:space:]]*=" "$f"
    GATE6_FAIL=1
  fi
done
if [ "$GATE6_FAIL" -eq 0 ]; then
  echo "  ✅ Nenhum bypass de dev em config de produção/staging"
else
  FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "🛑 CI Gates falharam. Corrija antes de commitar/fazer merge."
  exit 1
fi
echo ""
echo "✅ Todos os gates mecânicos passaram."
```

Crie `scripts/check-imports.js` (o verificador anti-alucinação):

```javascript
// Verifica que todo import de pacote externo existe em package.json.
// Import de pacote não declarado = provável alucinação de dependência pelo agente.
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const declared = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
]);

// Builtins do Node que não precisam estar em package.json
const builtins = new Set(['fs','path','crypto','http','https','os','util','stream','events','child_process','url','querystring','zlib','buffer','process']);

const missing = new Set();
const exts = ['.ts', '.tsx', '.js', '.jsx'];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', 'dist', 'build'].includes(entry.name)) walk(full);
    } else if (exts.includes(path.extname(entry.name))) {
      const code = fs.readFileSync(full, 'utf8');
      const re = /(?:import|from|require\()\s*['"]([^'".][^'"]*)['"]/g;
      let m;
      while ((m = re.exec(code))) {
        let dep = m[1];
        if (dep.startsWith('.') || dep.startsWith('@/') || dep.startsWith('~/')) continue; // local
        if (dep.startsWith('@')) dep = dep.split('/').slice(0, 2).join('/'); // scoped
        else dep = dep.split('/')[0];
        if (!declared.has(dep) && !builtins.has(dep) && !dep.startsWith('node:')) missing.add(dep);
      }
    }
  }
}

['src', 'app', 'lib', 'components'].forEach(walk);
if (missing.size) { console.log([...missing].join('\n')); process.exit(0); }
```

Adicione ao `.github/workflows/ci.yml` (após os steps de Semgrep/audit existentes):

```yaml
  - name: Mechanical CI Gates
    run: |
      chmod +x scripts/ci-gates.sh
      ./scripts/ci-gates.sh
```

E ao `.git/hooks/pre-push` (bloqueia push local antes mesmo do CI):

```bash
#!/bin/sh
# pre-push — roda gates mecânicos antes de qualquer push
if [ -f scripts/ci-gates.sh ]; then
  chmod +x scripts/ci-gates.sh
  ./scripts/ci-gates.sh || {
    echo "Push bloqueado pelos gates mecânicos. Corrija e tente novamente."
    exit 1
  }
fi
```

```bash
chmod +x scripts/ci-gates.sh .git/hooks/pre-push
```

E ao `.git/hooks/commit-msg` (valida a convenção de rastreabilidade a cada commit — custo zero):

```bash
#!/bin/sh
# commit-msg — valida convenção de rastreabilidade (Constitutional SDD v4.0)
# feat/test exigem escopo (TASK-NNN); refactor exige (TASK-NNN) ou (MAINT).
# fix/style/chore sem escopo continuam válidos (caminho do Quick Fix).
MSG=$(head -1 "$1")

case "$MSG" in
  feat\(TASK-[0-9]*\):*|test\(TASK-[0-9]*\):*) : ;;
  feat*|test*)
    echo "🛑 Commit bloqueado: '$MSG'"
    echo "   feat e test exigem escopo de task: feat(TASK-NNN): descrição"
    echo "   Sem task? Não é feat/test — ou abra a task, ou use o tipo correto."
    exit 1 ;;
esac

case "$MSG" in
  refactor\(TASK-[0-9]*\):*|refactor\(MAINT\):*) : ;;
  refactor*)
    echo "🛑 Commit bloqueado: '$MSG'"
    echo "   refactor exige (TASK-NNN) ou (MAINT): refactor(MAINT): descrição"
    exit 1 ;;
esac

# Aviso (não bloqueia): feat sem trailer REQ — obrigatório no MODO PADRÃO
if echo "$MSG" | grep -qE '^feat\(TASK-' && ! grep -qE '^REQ: REQ-[0-9]+' "$1"; then
  echo "ℹ️  Aviso: commit feat sem trailer 'REQ: REQ-NNN' (obrigatório no MODO PADRÃO)."
fi
exit 0
```

```bash
chmod +x .git/hooks/commit-msg
```

> **Por que bloquear no commit e não só no CI:** a rastreabilidade reversa
> (`git log --grep="REQ-008"`) só funciona se TODO commit seguir a convenção.
> Um commit fora do padrão que já entrou no histórico não é corrigível sem
> rewrite. O hook garante a convenção no ponto mais barato — antes do commit existir.

**Ação obrigatória — Atualização automática de dependências (Renovate):**

Crie `renovate.json` na raiz e ative o Renovate GitHub App no repositório:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "schedule": ["before 8am on monday"],
  "packageRules": [
    { "matchUpdateTypes": ["patch"], "automerge": true, "matchCurrentVersion": "!/^0/" }
  ],
  "vulnerabilityAlerts": { "labels": ["security"] },
  "commitMessagePrefix": "chore(deps):"
}
```

> Patches são automesclados **somente se o CI inteiro passar** (gates mecânicos + testes
> + E2E). Minor/major viram PRs que aguardam a janela de manutenção mensal — ver
> `modules/fleet-operations.md`. Dependência parada por 6 meses tem CVE conhecida
> quase por definição; automatizar o patch elimina o custo recorrente de manter N clientes.

Commit:
```
chore: add mechanical CI gates — anti-hallucination + security enforcement
```

> **Por que isso resolve o que a auto-auditoria não resolve:**
> - **Gate 1** pega APIs/bibliotecas alucinadas que o agente jurou não ter inventado
> - **Gate 2** pega migrations sem DOWN que o CR deveria ter pareado (exatamente o drift #2 real)
> - **Gate 3** pega secrets que escaparam do Semgrep
> - **Gate 4** prova pela ordem dos commits que o teste red veio antes do green — a regra
>   de TDD atômico deixa de depender da obediência do agente
> - **Gate 5** pega método/tipo inventado dentro de pacote real (o Gate 1 só pega pacote
>   inteiro inventado) — `tsc` verifica contra as tipagens reais instaladas
> - **Gate 6** impede que um relaxamento de segurança de dev (bypass de 2FA, rate limit
>   desligado) vaze para a config de produção/staging — o atalho de teste não escapa
> Nenhum depende do LLM se auto-avaliar — são provas mecânicas, executadas por script.

---

**Ação obrigatória — Detector de Deriva dos Arquivos de Regras (assertividade):**

> Problema: os arquivos de regras do Antigravity (`.agents/rules/00-core.md`,
> `10-sprint-tdd.md`, `20-migrations.md`, `30-quick-fix.md`, `40-change-request.md`)
> são uma condensação manual dos módulos-fonte do framework (`master-spec-core.md` +
> `modules/*.md`). Quando os fontes mudam, esses arquivos de regras não se atualizam
> sozinhos — viram uma cópia que envelhece e pode contradizer o framework sem ninguém
> perceber. Este detector torna a deriva visível, monitorando os próprios arquivos
> de regras (não os módulos-fonte, que vivem fora do workspace do Antigravity).

Crie `scripts/sync-rules.sh`:

```bash
#!/bin/bash
# Detector de deriva dos arquivos de regras — Constitutional SDD v4.0
# Compara o hash combinado dos 5 arquivos de regras com o hash registrado na
# última sincronização. Não regenera automaticamente (os arquivos são curados
# manualmente); apenas ALERTA quando algum deles mudou e merece revisão humana.

SOURCES=(
  ".agents/rules/00-core.md"
  ".agents/rules/10-sprint-tdd.md"
  ".agents/rules/20-migrations.md"
  ".agents/rules/30-quick-fix.md"
  ".agents/rules/40-change-request.md"
)
STAMP=".agents/rules/.rules-sync-hash"

# Calcula hash combinado dos fontes
current=$(cat "${SOURCES[@]}" 2>/dev/null | sha256sum | cut -d' ' -f1)

if [ ! -f "$STAMP" ]; then
  echo "$current" > "$STAMP"
  echo "✅ Baseline de sincronização dos arquivos de regras registrada."
  exit 0
fi

recorded=$(cat "$STAMP")

if [ "$current" != "$recorded" ]; then
  echo "⚠️  MUDANÇA DETECTADA — os arquivos de regras (.agents/rules/) mudaram desde a"
  echo "    última baseline. Confirme que a mudança está alinhada com os módulos-fonte"
  echo "    do framework (master-spec-core.md + modules/) e, quando estiver revisado,"
  echo "    atualize a baseline: echo '$current' > $STAMP"
  echo ""
  echo "    Arquivos monitorados:"
  printf '    - %s\n' "${SOURCES[@]}"
  exit 1
fi

echo "✅ arquivos de regras sem mudança desde a última baseline."
```

Registre a baseline e adicione ao CI:

```bash
chmod +x scripts/sync-rules.sh
./scripts/sync-rules.sh   # cria a baseline inicial
```

```yaml
  - name: Rules Drift Detector
    run: |
      chmod +x scripts/sync-rules.sh
      ./scripts/sync-rules.sh
```

E ao `.git/hooks/pre-commit` (avisa localmente, antes mesmo do commit — custo zero de tokens):

```bash
#!/bin/sh
# pre-commit — detector de deriva dos arquivos de regras (Constitutional SDD v4.0)
# Roda antes de cada commit. Não bloqueia — apenas avisa, porque a deriva
# pode ser intencional (você está no meio de atualizar o framework).
if [ -f scripts/sync-rules.sh ]; then
  chmod +x scripts/sync-rules.sh
  if ! ./scripts/sync-rules.sh; then
    echo ""
    echo "ℹ️  Aviso: os arquivos de regras (.agents/rules/) mudaram desde a última baseline."
    echo "    Se a mudança foi intencional e está alinhada com os módulos-fonte do"
    echo "    framework, atualize a baseline. Este aviso não bloqueia o commit."
  fi
fi
```

```bash
chmod +x .git/hooks/pre-commit
```

> **Por que o pre-commit apenas avisa (não bloqueia), mas o CI bloqueia:**
> Localmente, você pode estar no meio de uma atualização legítima do framework —
> bloquear seria atrapalhar. O aviso local é um lembrete cedo. Já no CI (push),
> o gate bloqueia: nesse ponto a mudança deveria estar completa e sincronizada.
> Assim você tem o alerta cedo (pre-commit) sem fricção, e a garantia dura no push.

Commit:
```
chore: add rules drift detector — keeps Antigravity rule files in sync with framework sources
```

> **Fluxo quando a deriva é detectada:** o pre-commit avisa localmente (não bloqueia).
> No push, o CI falha com aviso. Você revisa os arquivos de regras que mudaram contra os
> módulos-fonte do framework, ajusta o necessário, e quando estiver alinhado atualiza a
> baseline. A deriva deixa de ser silenciosa — vira um gate visível, sem custo de tokens
> (é script, não LLM).

---

### Fase 8 — Ingestão de Contexto e Seleção de Sprint

Aguarde o usuário confirmar que o workspace está configurado.

Liste brevemente o Sprint Roadmap contido em `plan.md`.

Pergunte: *"Qual destas Sprints você deseja especificar e orquestrar agora?"*

> 💡 Se o usuário não souber por qual sprint começar, recomende sempre a Sprint 1 (fundação: autenticação, estrutura de banco, rotas base). É o ponto de partida correto para qualquer sistema.

---

### Fase 9 — Geração do Artefato SDD da Sprint (Micro-Spec)

Com base na sprint escolhida, gere o arquivo `tasks.md` com itens **atômicos e acionáveis**.

> 💡 **Fonte das tasks:** O `tasks.md` é gerado a partir de **duas fontes combinadas**:
> 1. O roadmap de sprints do `plan.md` (escopo original planejado na Fase 6)
> 2. O backlog acumulado em `plan.md` — seção `## Backlog — Próximas Sprints` — que inclui
>    Change Requests registrados entre sprints, tasks movidas por limite de capacidade e
>    débitos técnicos identificados no Step 9 (Report) de sprints anteriores.
>
> Antes de gerar o `tasks.md`, leia as duas fontes e consolide. Tasks do backlog têm
> prioridade se marcadas como bloqueadoras de outras tasks. Se houver conflito de
> prioridade, apresente ao usuário e aguarde confirmação antes de finalizar.

> 💡 **Nota de segurança:** Se as tasks desta sprint envolverem design de schema de banco,
> criação de APIs públicas, ou multi-tenancy, carregue também `modules/security-constitution.md`
> nesta sessão para garantir que os critérios BDD e o campo "Isolamento de Tenant" sejam
> gerados em conformidade com as `strict_rules`.

**Template canônico obrigatório:**

```
## TASK-[NNN]: [Título]
- **Tipo:** Feature | Fix | Refactor | Chore
- **Critério de Aceite (BDD):**
  - **Given** [contexto/estado inicial do sistema]
  - **When** [ação executada pelo usuário ou sistema]
  - **Then** [resultado esperado e verificável]
- **Isolamento de Tenant:** [Como esta task garante que não há vazamento cross-tenant?]
- **Referência spec.md:** §X.Y
- **Referência plan.md:** Sprint N
- **Estimativa:** S | M | L
- **Dependências:** [TASK-NNN ou "nenhuma"]
```

> O formato BDD é obrigatório. O campo "Isolamento de Tenant" é obrigatório em sistemas multi-tenant — se não aplicável, declarar explicitamente "N/A — não acessa dados de tenant".
> Cada task deve ser uma **fatia vertical de comportamento de usuário** — nunca uma camada técnica horizontal. Exemplos inválidos: "Criar models do banco", "Configurar rotas". Exemplos válidos: "Usuário Admin cadastra novo produto e vê confirmação", "Cliente finaliza checkout e recebe e-mail".

**Regra de Capacidade de Sprint — Dev Solo com IA:**

Antes de finalizar o `tasks.md`, o agente deve verificar o volume total gerado contra os limites abaixo. O objetivo é garantir que o roadmap seja executável por um único desenvolvedor com suporte de IA, não apenas tecnicamente correto no papel.

| Estimativa | Peso | Limite por sprint (dev solo) |
|------------|------|------------------------------|
| S (Small)  | 1 pt | — |
| M (Medium) | 2 pts | — |
| L (Large)  | 4 pts | — |
| **Total de pontos por sprint** | | **máx. 16 pts** |
| **Número de tasks por sprint** | | **máx. 10 tasks** |

> **Critério de aferição:** Uma task S é executável em menos de 2h com suporte de IA. Uma task M, entre 2–4h. Uma task L, entre 4–8h. Uma sprint de 16 pontos representa aproximadamente 2–3 dias de trabalho focado — ritmo sustentável para um dev solo.

**Se o volume gerado ultrapassar os limites:**
1. O agente não corta tasks silenciosamente.
2. O agente apresenta ao usuário a lista completa com o total de pontos e diz: *"Esta sprint tem [X] pontos, acima do limite de 16 para dev solo. Sugiro mover as seguintes tasks para a sprint seguinte: [lista]. Confirma?"*
3. Somente após confirmação do usuário o `tasks.md` é finalizado.

> ⚠️ Tasks removidas vão para o backlog do `plan.md`, nunca são descartadas. Registre-as na seção `## Backlog — Próxima Sprint` do arquivo de tasks atual.

**Instrução final:** *"Salve em `/docs/tasks-[nome-da-sprint].md`."*

---

### Fase 9.5 — Quick Fix (workflow para pedidos pontuais)

> Este workflow existe para cobrir um gap real: pedidos pequenos e diretos
> ("ajuste este estilo", "corrija este texto", "melhore este componente")
> que não justificam abrir uma sprint formal, mas que **sem guardrail viram
> escopo creep acumulado** — 50 arquivos alterados, build quebrado, testes falhando.
>
> O Quick Fix não substitui o ciclo TDD. É um caminho controlado para
> mudanças que caberiam em um único commit atômico.

Crie `.agents/workflows/quick-fix.md`:

```
---
description: Execute a single focused change outside the sprint cycle
on_failure: notify_user_and_halt
---

## Classificação Obrigatória — Antes de Qualquer Ação

Avalie o pedido do usuário e classifique:

| Tipo de pedido | Caminho |
|---------------|---------|
| Estilo, texto, UI sem lógica de negócio | ✅ Quick Fix — continue |
| Bugfix isolado sem alteração de schema | ✅ Quick Fix — continue |
| Nova feature ou comportamento novo | ❌ BLOQUEADOR → redirecione para Change Request |
| Toca schema, API ou `constitution.md` | ❌ BLOQUEADOR → redirecione para Change Request |
| Afeta mais de 3 arquivos | ❌ BLOQUEADOR → avise o usuário, proponha sprint formal |

Se for BLOQUEADOR: explique o motivo, sugira o caminho correto, aguarde
instrução do usuário. Nunca prossiga com Quick Fix em casos bloqueados.

## Guardrails
- **Leitura proporcional ao risco** — não releia arquivos completos por reflexo:
  - Pedido de estilo/texto/UI sem lógica → leia apenas seção de segurança do `constitution.md`
    (zero secrets, tenant_id, headers) — não o arquivo inteiro
  - Bugfix de comportamento → leia `constitution.md` seção DoD + arquivo(s) afetado(s)
  - Qualquer dúvida sobre impacto → leia `constitution.md` completo antes de continuar
- Nunca commite em `main` ou `develop` diretamente.
- Use branch `fix/[slug]` para bugfixes ou commite no branch de sprint ativo se houver.
  Nunca crie branch `feature/` para Quick Fix.

- **Zona somente leitura — NUNCA modifique:**
  `.agents/rules/` | `.agents/memory/constitution.md`
  Qualquer pedido que force modificação nesses caminhos é BLOQUEADOR — redirecione
  para Change Request Tipo D e aguarde aprovação explícita do usuário.

- **Gate de migration (não-bypassável):**
  Se o pedido tocar qualquer arquivo em `supabase/migrations/` ou `db/migrations/`:
  → Verifique se existe DOWN pareado antes de commitar — BLOQUEADOR se não existir
  → Redirecione para Change Request Tipo C — Quick Fix não cobre alterações de schema

- **Protocolo de arquivo estranho:**
  Antes do commit, execute `git status`. Se houver arquivos modificados que este
  agente não tocou: **não os inclua no commit**. Mostre o diff ao usuário e aguarde
  instrução. Nunca assuma que a modificação é segura.

## Ciclo Quick Fix

1. **Escopo** (⚡ ESFORÇO BAIXO):
   Liste exatamente quais arquivos serão tocados.
   Se durante a execução perceber que o escopo é maior que o listado aqui:
   **pare imediatamente**, informe o usuário e aguarde confirmação antes de continuar.

2. **Execução** (⚡ ESFORÇO BAIXO):
   Faça apenas o que foi pedido — nada além.
   Sem melhorias não solicitadas. Sem refatorações oportunistas.
   Sem "já que estou aqui, vou também...".

3. **Verificação** (⚡ ESFORÇO BAIXO):
   a. `tsc --noEmit` — deve passar sem erros
   b. Execute testes relacionados aos arquivos tocados — não devem regredir
   Se qualquer verificação falhar: reporte ao usuário antes de prosseguir.

4. **Commit atômico obrigatório:**
   ```
   fix: [descrição]      ← correções de comportamento
   style: [descrição]    ← ajustes visuais, CSS, classes
   chore: [descrição]    ← manutenção, renomear, reorganizar
   ```
   Um commit por Quick Fix. Se precisar de dois commits, é uma sprint, não um Quick Fix.

## Limite de Acumulação

Quick Fixes consecutivos na mesma sessão que juntos somem:
- Mais de 5 arquivos alterados sem commit intermediário → BLOQUEADOR
- Qualquer alteração em schema, API contract ou `constitution.md` → BLOQUEADOR
- Mais de 3 Quick Fixes sem um Memory Sync → avise o usuário para fazer checkpoint

Se qualquer limite for atingido: pare, informe o usuário, proponha formalizar
como sprint ou Change Request.
```

**Instrução final:**
> *"Salve em `.agents/workflows/quick-fix.md`. Use `/quick-fix` no painel Antigravity
> para pedidos pontuais — use `/sprint-execution` para features e mudanças estruturais."*

---

### Fase 10 — Geração do Workflow Autônomo Antigravity

> ⚠️ **Módulo de segurança obrigatório nesta fase.**
> Carregue `modules/security-constitution.md` antes de gerar o `sprint-execution.md`.
> O workflow gerado aqui referencia as `strict_rules` e o DoD definidos naquele módulo.

Crie `.agents/workflows/sprint-execution.md`:

```
---
description: Execute Sprint tasks autonomously using TDD
on_failure: notify_user_and_halt
---

## Guardrails
- Leia `constitution.md` antes de qualquer ação. Não prossiga se não encontrado.
- Respeite o sandbox definido em `agent_config.py`.
- Opere exclusivamente em `feature/sprint-[N]-[slug]` (ex: `feature/sprint-10-auth-flow`). Nunca commite em `main` ou `develop`.
- Em sistemas multi-tenant: toda query gerada deve incluir filtro por tenant_id.
  Qualquer query sem esse filtro é um BLOQUEADOR — pare e notifique o usuário.

- **Zona somente leitura — NUNCA modifique:**
  `.agents/rules/` | `.agents/memory/constitution.md` (exceto seção `## Estado Atual` no Memory Sync)
  Qualquer modificação nesses caminhos por este agente é um BLOQUEADOR imediato.
  Pare, informe o usuário, aguarde instrução. Não commite.

- **Protocolo de arquivo estranho:**
  Antes de qualquer commit, execute `git status` e verifique se há arquivos modificados
  que este agente **não tocou** nesta sessão.
  Se encontrar: **não commite esses arquivos**. Mostre o diff ao usuário (`git diff [arquivo]`)
  e aguarde instrução explícita antes de incluir ou descartar.
  Nunca assuma que a modificação é segura — pode ser drift do Gemini ou outro agente.

## Sub-Agentes e Carregamento Seletivo de Contexto

> Cada Step abaixo é executado por um sub-agente nomeado, que recebe **apenas o
> contexto mínimo** necessário para sua responsabilidade. Isso evita que a janela
> de contexto acumule arquivos irrelevantes ao longo da sprint e permite calibrar
> o esforço de raciocínio por tipo de tarefa.

| Sub-agente | Steps | Contexto carregado | Effort Level |
|-----------|-------|---------------------|:---:|
| `task-agent` | 0–1 (Context Load + Ingest) | `constitution.md` + `spec.md` + `plan.md` + `tasks.md` + títulos de ADRs + `ui-context.md` (se UI) | Baixo |
| `code-agent` | 2–5 (Red, Green, Refactor, Migrate) | `constitution.md` + `tasks.md` (task atual apenas) + arquivos sendo implementados | Médio — Alto se task estimativa L ou envolve `Migrate` |
| `review-agent` | 6–8 (Validate, Security Gate, AI Validation Gate) | `constitution.md` + relatório de cobertura + resultado Semgrep/audit + artefatos lidos no Step 0 | **Alto no Step 8** — demais Baixo |
| `report-agent` | 9 (Report) | `tasks.md` + sumário de testes + outputs dos sub-agentes anteriores | Baixo |
| `memory-agent` | 10 (Memory Sync) | `constitution.md` + `plan.md` + `CLAUDE.md` (apenas as seções a atualizar) | Baixo |

> **Por que o Step 8 (AI Validation Gate) é sempre Alto:** é o gate que detecta
> spec drift, ADR não seguido e hallucination de API/biblioteca. Aplicar esforço
> baixo aqui é o tipo de falha que já causou problemas em testes anteriores deste
> framework — o agente "confirma" sem de fato cruzar os artefatos.
>
> **`code-agent` por task, não por sprint:** ao iniciar cada nova task (volta ao
> Step 2), o `code-agent` reseta seu contexto de implementação — carrega apenas
> os arquivos da task atual, não acumula os arquivos de tasks anteriores já
> commitadas. Esta é a maior economia de janela de contexto do ciclo.

## Regra de Ouro do TDD Atômico
Para CADA task, o ciclo obrigatório é:
  1. Escreva EXATAMENTE UM teste falho → confirme que falha → commite o teste
  2. Implemente o código mínimo para esse teste passar → confirme que passa → commite
  3. Refatore → confirme que ainda passa → commite
  4. Só então avance para o próximo teste
NUNCA escreva múltiplos testes antes de implementar. NUNCA implemente sem um teste falho anterior.
Violação desta regra = BLOQUEADOR — pare e notifique o usuário.

## Steps

---

### 🤖 task-agent — Context Load e Ingest
> ⚡ **ESFORÇO BAIXO** — Leitura e ordenação. Não tome decisões, não gere código.
> Carregue apenas os arquivos listados abaixo. Confirme internamente que cada um
> foi carregado antes de prosseguir. Não carregue nada além desta lista.

0. **Context Load** (obrigatório antes de qualquer implementação):
   Leia nesta ordem exata:
   a. `constitution.md` — regras inegociáveis, DoD, stack aprovada
   b. `spec.md` — requisitos funcionais e métricas de negócio
   c. `plan.md` — decisões arquiteturais, stack choices, AI Cost Budget
   d. `tasks.md` da sprint atual — critérios BDD das tasks a executar
   e. Títulos + decisão de cada arquivo em `/docs/adr/` (leitura rápida — não o conteúdo completo)
   f. `ui-context.md` (somente se a sprint inclui componentes de UI)

   > Se qualquer arquivo obrigatório (a–d) estiver ausente: **pare e informe o usuário**.
   > Não prossiga com arquivos faltando.

   **Criação de branch obrigatória antes de qualquer commit:**
   Leia o número da sprint atual em `plan.md` (seção Roadmap) e crie o branch com o formato:
   ```
   git checkout -b feature/sprint-[N]-[slug-da-sprint]
   ```
   Exemplos: `feature/sprint-10-auth-flow` | `feature/sprint-10-dashboard`
   O número `[N]` vem do `plan.md` — nunca de um contador automático do Git ou da IDE.
   Nunca commite na `main` ou `develop` diretamente durante uma sprint.

1. **Ingest**: Liste as tasks do `tasks.md` em ordem de dependência.
   Rejeite tasks que sejam camadas técnicas horizontais (ex: "criar models", "configurar rotas").
   Aceite apenas fatias verticais de comportamento de usuário (ex: "usuário faz login e vê dashboard").

---

### 🤖 code-agent — Red, Green, Refactor, Migrate
> 🔴 **ESFORÇO MÉDIO a ALTO** — Este agente implementa uma task por vez.
> **Resete o contexto de implementação a cada nova task** — não acumule arquivos
> de tasks anteriores já commitadas.
>
> **Sobre `constitution.md`:** já foi carregado pelo `task-agent` no Step 0
> e está em contexto. **Não recarregue** entre tasks da mesma sprint —
> use o que já está em contexto. Exceção: se o agente foi reiniciado ou
> a sessão foi interrompida, recarregue antes de continuar.
>
> Carregue por task apenas: task atual do `tasks.md` + arquivos sendo implementados.
>
> Task estimativa **L** ou que envolva **Migrate**: use esforço ALTO —
> confirme que `constitution.md` ainda está em contexto antes de implementar.

2. **Red**: Para a task atual, traduza o critério BDD (Given/When/Then) em
   EXATAMENTE UM teste automatizado. Confirme que o teste **falha**.
   Commite:
   ```
   test(TASK-NNN): red - [descrição do comportamento]

   REQ: REQ-NNN
   ```

3. **Green**: Implemente o código **mínimo** para o teste passar. Nada além.
   Confirme que passa. Commite:
   ```
   feat(TASK-NNN): green - [descrição]

   REQ: REQ-NNN
   ADR: ADR-NNN (se aplicável)
   ```

4. **Refactor**: Refatore para conformidade com `constitution.md`
   (DoD, SOLID, DRY, isolamento de tenant, versionamento de API).
   Confirme que o teste **ainda passa**. Commite:
   ```
   refactor(TASK-NNN): [descrição]

   REQ: REQ-NNN
   ```

5. **Migrate** (somente se a task altera schema):
   > 🔴 **ESFORÇO ALTO** — risco de dado. Não pule etapas.
   a. Gere o script DOWN (rollback) **ANTES** do UP (migration) — sem exceção
   b. Teste ambos no branch Neon efêmero do PR
   c. Só avance com rollback verificado. Commite migration + rollback juntos.

---

### 🤖 review-agent — Validate, Security Gate, AI Validation Gate
> Carregue: `constitution.md` + relatório de cobertura + resultados dos gates.
> Os artefatos de referência (spec, plan, ADRs) já estão em contexto desde o Step 0
> — não os recarregue. Use o que já foi carregado para o cruzamento do Step 8.

6. **Validate**
   > ⚡ **ESFORÇO BAIXO** — verificação mecânica.
   Execute suite de testes completa.
   Se cobertura < 80% **ou** lint com erros → retorne ao Step 3 (Green).

7. **Security Gate** (bloqueante — não bypassável)
   > ⚡ **ESFORÇO BAIXO** — execute as ferramentas e leia os outputs.
   a. Execute `semgrep --config=auto` + `.semgrep/fitness.yml`
      → Zero findings HIGH/CRITICAL para prosseguir
   b. Execute `npm audit` ou `pip-audit`
      → Zero CVEs HIGH/CRITICAL para prosseguir
   c. Verifique rotas públicas: todas devem ter prefixo `/v[N]/`
      → Exceções permitidas: `/health`, `/metrics`, `/webhook`
      → Documente exceções em `api-contract.md`
   d. **Execute `./scripts/ci-gates.sh`** — gates mecânicos não-bypassáveis:
      → Gate 1: imports existem em package.json (anti-alucinação de pacote)
      → Gate 2: migrations UP têm DOWN pareado
      → Gate 3: nenhum secret hardcoded
      → Gate 4: ordem TDD — commit test(red) precede feat(green) em cada task
      → Gate 5: type-check `tsc --noEmit` (anti-alucinação de API em pacote real)
      → Gate 6: nenhum bypass de dev (2FA/rate limit) em config de prod/staging
      → Qualquer falha = BLOQUEADOR. Estes gates não dependem de julgamento —
        são provas mecânicas. Não prossiga se qualquer um falhar.

   Se qualquer check falhar: **pare, registre o finding, notifique o usuário. Não faça merge.**

8. **AI Validation Gate**
   > 🔴 **ESFORÇO MÁXIMO — não responda imediatamente.**
   >
   > Antes de emitir qualquer resultado:
   > 1. Releia os critérios BDD desta task no `tasks.md`
   > 2. Compare linha a linha com o código commitado nos Steps 2–4
   > 3. Verifique cada ADR relevante em `/docs/adr/`
   > 4. Confirme que nenhuma biblioteca/API foi usada fora do `plan.md`
   > 5. Só então emita SIM/NÃO para cada item abaixo
   >
   > Este é o único gate contra spec drift e hallucination de dependência.
   > Esforço baixo aqui invalida todo o ciclo TDD anterior.

   Responda SIM/NÃO para cada item:

   a. **Spec Compliance:** Toda lógica implementada corresponde a um critério BDD explícito no `tasks.md`?
      → Se NÃO: identifique o gap, registre como débito técnico, notifique o usuário.

   b. **Requirement Drift:** A implementação introduz comportamento não previsto no `spec.md`?
      → Se SIM: task sofreu escopo creep. Reverta o excesso ou abra nova task para aprovação.

   c. **ADR Compliance:** Alguma decisão de stack ou padrão diverge de um ADR em `/docs/adr/`?
      → Se SIM: justifique com novo ADR ou reverta para o padrão documentado.

   d. **Hallucination Proxy Check:** O agente usou função, biblioteca ou API ausente do `plan.md`?
      → Se SIM: sinalize para revisão humana — possível invenção de dependência não aprovada.

   Se qualquer item retornar alerta: **pare, registre no Report, aguarde revisão humana.**

---

### 🤖 report-agent — Report
> ⚡ **ESFORÇO BAIXO** — sumarize o que já aconteceu. Não releia arquivos.
> Use apenas o que já está em contexto dos steps anteriores.

9. **Report**: Gere sumário com:
   - Tasks concluídas nesta sprint
   - Status dos testes (cobertura, lint)
   - Security Gate: Semgrep ✅/❌ | npm audit ✅/❌
   - AI Validation Gate: itens a–d com status SIM/NÃO
   - Bloqueios pendentes (se houver)

   Aguarde revisão humana antes do merge.

---

### 🤖 memory-agent — Memory Sync
> ⚡ **ESFORÇO BAIXO** — atualize apenas o que mudou. Não reescreva sem alteração.
> Carregue apenas as seções específicas dos arquivos abaixo, não os arquivos inteiros.
> **Nenhuma sprint termina sem este step executado e commitado.**

10. **Memory Sync** (obrigatório — último step de toda sprint):

    > Propósito: manter `.agents/memory/` como fonte de verdade compartilhada
    > entre Antigravity, Claude Code e qualquer outro agente ou sessão futura.
    > Nenhuma sprint termina sem este step executado e commitado.

    Execute as atualizações abaixo em ordem. Para cada item, verifique se
    houve mudança real antes de editar — não reescreva sem alteração.

    a. **constitution.md** — atualize a seção `## Estado Atual` com:
       - Sprint concluída: N
       - Data de conclusão: YYYY-MM-DD
       - Tasks entregues: lista de TASK-NNN concluídas
       - Tasks não entregues (se houver): TASK-NNN com motivo
       - Decisões tomadas durante a sprint que alterem regras estruturais
       - Se o Step 9 contiver bloqueios não resolvidos: registre em `## Bloqueios Pendentes`

    b. **plan.md** — atualize as seções:
       - `## Roadmap`: marque a sprint N como ✅ Concluída
       - `## Decisões e Justificativas`: registre qualquer decisão de stack
         não planejada que o agente tomou durante a execução
       - `## AI Cost Budget`: atualize tokens consumidos na sprint (se rastreado)
       - `## Fitness Function Exceptions`: registre exceções adicionadas ao
         `.semgrep/fitness.yml` nesta sprint
       - `## Métricas do Processo`: adicione a linha da sprint N —
         Início/Fim: `git log --reverse --format=%as | head -1` e `git log -1 --format=%as`
         no branch da sprint; Pts planejados: soma do tasks.md; Pts entregues: soma
         das tasks concluídas no Report; Retrabalho: tasks que voltaram ao Step 3;
         Falhas de gate: contagem do Report (Steps 7–8); Bugs pós-release da sprint
         N-1: preencha retroativamente na linha anterior

    c. **CLAUDE.md** (raiz do projeto) — atualize a seção `## Estado atual do projeto`:
       - Sprint atual: N+1
       - Última sprint: N
       - Último commit: resultado de `git log -1 --oneline`
       - Próxima ação: primeira task do backlog da próxima sprint

    d. **Commit obrigatório** — após todas as atualizações:
       ```
       chore: memory sync sprint-N

       Atualiza: constitution.md, plan.md, CLAUDE.md
       Sprint N concluída: [N tasks entregues, N bloqueios]
       Próxima: sprint N+1
       ```

    > ⚠️ Se qualquer arquivo de memória estiver ausente em `.agents/memory/`,
    > crie-o com o conteúdo mínimo necessário e registre no commit.
    > Nunca deixe o Memory Bank incompleto ao fim de uma sprint.
```

**Instrução final:**
> *"Salve em `.agents/workflows/sprint-execution.md`. Use `/sprint-execution` no painel Antigravity."*

**Ação obrigatória — Workflow de Pentest (AI Red Team):**

Crie `.agents/workflows/ai-pentest.md` para tornar o pentest white-box repetível:

```
---
description: White-box adversarial pentest driven by the system's own artifacts
on_failure: notify_user_and_halt
---

## Gate de Autorização (BLOQUEADOR)
Confirme as 5 Regras de Engajamento do modules/ai-pentest.md antes de qualquer teste:
alvo = staging; não-destrutivo; dados de seed; ambiente isolado; tudo logado.
Sem confirmação explícita do alvo staging pelo usuário: PARE. Nunca teste produção
sem autorização escrita.

## Contexto (white-box)
Carregue como mapa de ataque: constitution.md (invariantes), threat_model_stride.md,
api-contract.md, RBAC do spec.md, schema de db/ e migrations. Cada controle declarado
é um objetivo: provar que ele NÃO segura no runtime.

## Persona
🔴 ESFORÇO MÁXIMO. Assuma o red teamer adversarial — o oposto do agente que construiu.
Desconfie de cada afirmação do constitution.md e tente refutá-la com ataque real.

## Execução
Percorra as categorias A–I do modules/ai-pentest.md. Para cada objetivo: execute o
ataque contra staging, capture request/response como evidência, classifique
SEGURO / VULNERÁVEL / INCONCLUSIVO. Ferramentas: ZAP, harness multi-tenant para IDOR,
scripts de authz por perfil. Marque explicitamente o que não cobriu (lógica de negócio).

## Relatório e Roteamento
Gere docs/security/pentest-report-[data].md (template do modules/ai-pentest.md).
Todo finding vira Change Request (Tipo C/D) — nunca corrija ad-hoc. Após a correção,
re-execute o objetivo específico (retest) para confirmar.

## Limite
Findings críticos abertos = BLOQUEADOR de go-live. Sistema com dados sensíveis/pagamento:
recomende pentest humano além deste — este não é pentest certificado.
```

> *"Salve em `.agents/workflows/ai-pentest.md`. Use `/ai-pentest` no Antigravity, ou rode
> pelo Claude Code numa sessão dedicada (recomendado — o raciocínio adversarial se
> beneficia de esforço máximo). Execute pré go-live e no ciclo anual da frota."*

---

### Fase 10.5 — Carga Inicial de Dados (Migração)

> *Aplica-se sempre que o sistema SUBSTITUI um processo existente (planilha, papel, sistema
> legado). É o passo mais esquecido em estimativas — e o que mais atrasa go-live e gera
> retrabalho. Um sistema perfeito sem os dados reais dentro é inútil no dia 1.*
>
> ⚠️ **Não confundir com migration de schema** (`20-migrations.md`, que altera a ESTRUTURA
> do banco). Aqui é **carga de CONTEÚDO** — trazer os dados existentes do cliente para dentro.
>
> Ambiente: executada com Claude Code (raciocínio) ou Antigravity, sempre **primeiro contra
> branch Neon efêmero / staging**, nunca a primeira execução direto em produção.

**Descoberta (levantada na Fase Comercial/Fase 1, detalhada aqui):**
- Existe dado legado? Volume (N registros)? Formato (planilha, PDF, papel, dump de banco,
  API de sistema antigo)?
- Qualidade: duplicatas, campos faltantes, inconsistências, encoding?
- Estratégia: digitação manual (baixo volume), importação em massa (script ETL), ou híbrido?
- Corte: big-bang (tudo de uma vez no go-live) ou faseado (por tipo/setor)?

**Artefatos:**
1. `docs/migration/migration-plan.md` — fonte, volume, estratégia, corte, responsável, janela
2. `docs/migration/data-mapping.md` — mapa campo-a-campo origem→destino; o que NÃO mapeia;
   defaults para campos ausentes
3. Scripts de import versionados e **idempotentes** (rodar 2x não duplica), com rollback
   pareado — mesma disciplina das migrations de schema
4. `docs/migration/reconciliation-report.md` — gerado após a carga

**Protocolo de execução (não-bypassável):**
1. **Dry-run obrigatório:** rode contra branch Neon efêmero / staging primeiro. A primeira
   execução NUNCA é em produção.
2. **Idempotência:** o script pode rodar de novo sem duplicar (chave natural / upsert).
   Import não-idempotente = BLOQUEADOR (uma falha no meio deixa dados pela metade e você
   não pode simplesmente re-rodar).
3. **Backup pré-carga obrigatório:** snapshot do estado do banco ANTES da carga. Sem ele,
   não há rollback de verdade.
4. **Limpeza ANTES da carga:** dedup, normalização e enforcement de campos obrigatórios na
   origem — dado sujo migrado é dado sujo permanente. Registre o que foi limpo.
5. **Gate de reconciliação (mecânico):**
   - Contagem: N registros na origem = N no destino (menos rejeitados, documentados)
   - Integridade referencial: nenhum FK órfão (ex: medição sem contrato, aditivo sem contrato)
   - Campos obrigatórios: nenhum registro migrado viola constraint NOT NULL / regra de negócio
   - Amostra: spot-check de X% dos registros contra a origem
   - Qualquer falha = BLOQUEADOR. Não vá para go-live com carga não reconciliada.
6. **Dado sensível (MODO SENSÍVEL):** a carga aplica criptografia de campo e escreve a trilha
   de auditoria DESDE a migração — não depois. PII migrada em claro = BLOQUEADOR.
7. **Aceite da carga pelo cliente:** o cliente valida uma amostra dos dados migrados ANTES do
   go-live. Sem aceite da carga = go-live bloqueado (é o dado dele; ele confirma que está certo).

**Template do `reconciliation-report.md`:**
```markdown
# Reconciliação da Carga — [Sistema] — [YYYY-MM-DD]
**Fonte:** [planilha X / sistema Y] | **Ambiente:** staging/Neon | **Estratégia:** big-bang | faseada

## Contagem
| Entidade | Origem | Migrado | Rejeitado | Motivo dos rejeitados |
|----------|-------:|--------:|----------:|-----------------------|
| Contratos | 340 | 338 | 2 | 2 sem valor total — corrigir na origem |

## Integridade
- [ ] Zero FK órfão | [ ] Zero violação de campo obrigatório | [ ] Encoding OK

## Amostra validada
- [X]% conferido contra a origem — divergências: [nenhuma | lista]

## Aceite do cliente
- Validado por: [nome] em [data] — [aprovado | ajustes solicitados]
```

**DoD da carga:** contagem bate, zero FK órfão, amostra aprovada pelo cliente, rollback
testado, backup pré-carga guardado. Só então a carga roda em produção (na janela de go-live).

---

### Fase 11 — Revisão de Sprint, Release Governance e Atualização de Artefatos

Após execução da sprint:

1. **Revise** o sumário do Step 9 (Report) contra os critérios BDD do `tasks.md`.
2. **Identifique** débitos técnicos, tasks incompletas ou critérios parcialmente atendidos.
3. **Verifique** se alguma query nova introduziu risco de cross-tenant leakage.
4. **Atualize** `plan.md` com o estado real (entregue vs. planejado).
5. **Registre** alterações de escopo no changelog do `spec.md` com data e motivo.
6. **Revise o threat model:** se a sprint introduziu integração externa, rota pública,
   upload de arquivo, novo perfil de acesso ou mudança em schema sensível — verifique se
   as mitigações do `threat_model_stride.md` continuam válidas e atualize-o. Ameaça nova
   sem mitigação documentada = BLOQUEADOR para o deploy desta sprint.

**Aceite do Cliente (obrigatório quando a sprint entrega funcionalidade visível ao usuário):**

> O maior risco em projetos PME não é bug — é construir a coisa errada com perfeição.
> Este protocolo fecha o loop: nenhuma sprint com entrega visível termina sem validação real.

1. **Demonstre** a funcionalidade ao cliente/stakeholder em staging (demo ao vivo,
   vídeo curto ou sequência de screenshots — o que o cliente conseguir consumir).
2. **Registre o resultado** no changelog do `spec.md`:
   `Aceite Sprint N: aprovado | aprovado com ajustes | reprovado` + data + observações.
3. **Ajustes solicitados NUNCA são implementados ad-hoc:**
   - Ajuste de comportamento já entregue → Change Request Tipo C
   - Ajuste de comportamento especificado mas não implementado → Change Request Tipo B
   - Funcionalidade nova percebida na demo → Change Request Tipo A (backlog)
4. Release para produção **sem aceite registrado = BLOQUEADOR**.
   Exceções: MODO MVP, uso interno, ou sprint puramente técnica (sem entrega visível) —
   nesses casos registre `Aceite Sprint N: N/A — [motivo]` no changelog.

**Release Governance (obrigatório antes de merge em `main`):**

Se a sprint inclui deploy para produção ou staging com cliente real, gere `/docs/releases/release-[versão].md`:

```markdown
# Release [vX.Y.Z] — [Nome da Sprint]

**Data:** YYYY-MM-DD
**Ambiente:** staging | production
**Versão anterior:** vX.Y.Z-1

## Changelog
### Adicionado
- [TASK-NNN] [descrição do comportamento entregue] (REQ: REQ-NNN)

### Corrigido
- [TASK-NNN] [descrição do bug corrigido]

### Alterado
- [TASK-NNN] [descrição da mudança de comportamento existente]

## Risco da Release
| Nível | Critério |
|-------|---------|
| 🟢 Baixo | Apenas novas features isoladas, sem alteração de schema |
| 🟡 Médio | Alteração de schema com migration, ou mudança em rota existente |
| 🔴 Alto | Alteração em auth, multi-tenancy, pagamento, ou dados sensíveis |

**Risco desta release:** 🟢 | 🟡 | 🔴

## Plano de Rollback
- **Trigger:** [quando acionar rollback — ex: error rate > 5%, p95 > 2s por 10min]
- **Passos:**
  1. Revert do PR no GitHub → deploy automático da versão anterior via Vercel
  2. Executar migration rollback: `prisma migrate resolve --rolled-back [migration_name]`
  3. Notificar cliente: [template de mensagem]
- **Tempo estimado de rollback:** [X minutos]

## Feature Flags (se aplicável)
| Flag | Estado padrão | Descrição | Remover na sprint |
|------|:---:|---------|:-----------:|
| `ff_[nome]` | OFF | [comportamento controlado] | Sprint N+1 |

## Checklist pré-deploy
- [ ] Migration testada no branch Neon efêmero
- [ ] Rollback script verificado
- [ ] Security Gate passou (Semgrep + npm audit + ci-gates.sh Gates 1–5)
- [ ] DAST: ZAP baseline na staging sem findings HIGH (MODO PADRÃO)
- [ ] Fitness Functions passaram
- [ ] AI Validation Gate sem alertas pendentes
- [ ] Threat model revisado contra as mudanças desta sprint
- [ ] Aceite do cliente registrado no spec.md (ou "N/A — [motivo]")
- [ ] Feature flags configuradas no ambiente alvo
- [ ] Cliente/stakeholder notificado (se relevante)
```

> **Quando gerar:** releases de risco 🟡 ou 🔴 sempre. Releases 🟢 em sprints de MVP são opcionais —
> use `git tag` como alternativa mínima (`git tag -a v1.0.0 -m "Sprint 1 entregue"`).

**Primeiro go-live de produção (obrigatório, uma vez por sistema):**
Carregue `modules/fleet-operations.md` e execute o Handoff para Operação (Seção 1):
gere `docs/runbook.md`, registre o sistema no `FROTA.md` e confirme que o contrato
de manutenção (Seção 5 do módulo) está acordado com o cliente. **Sistema em produção
sem runbook e sem entrada na FROTA = entrega incompleta.**

> Se o sistema substitui um processo/sistema existente: a **Fase 10.5 (Carga Inicial de
> Dados)** deve estar concluída e reconciliada, com aceite da carga pelo cliente, ANTES
> do go-live. Ir para produção com o banco vazio quando havia dado legado a migrar =
> go-live incompleto.

6. Pergunte: *"Release documentada. Qual é a próxima sprint que você deseja orquestrar?"* — retorna à Fase 8.

---
