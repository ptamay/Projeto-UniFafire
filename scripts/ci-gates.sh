#!/bin/bash
# Gates mecânicos — Constitutional SDD v5
# STACK-AGNÓSTICOS: detectam o ecossistema do projeto (Node, Python, …) e aplicam
# os checks correspondentes. O que não se aplica é PULADO com aviso — o gate nunca
# falha por o projeto não usar uma stack específica.
# Não dependem de julgamento do LLM. Rodam no CI e no pre-push.
set -e

FAIL=0

# ── Detecção de ecossistema ──
HAS_NODE=0; HAS_PY=0
[ -f package.json ] && HAS_NODE=1
{ [ -f pyproject.toml ] || [ -f requirements.txt ]; } && HAS_PY=1

echo "▶ Gate 1 — Imports têm dependência real (anti-alucinação)"
if [ "$HAS_NODE" = 1 ]; then
  MISSING=$(node scripts/check-imports.js 2>/dev/null || echo "SCRIPT_MISSING")
  if [ "$MISSING" = "SCRIPT_MISSING" ]; then
    echo "  ⚠ check-imports.js ou node ausente — pulando check Node"
  elif [ -n "$MISSING" ]; then
    echo "  ❌ Imports sem correspondência em package.json:"
    echo "$MISSING"
    FAIL=1
  else
    echo "  ✅ Node: todos os imports têm pacote declarado"
  fi
fi
if [ "$HAS_PY" = 1 ]; then
  PYBIN=$(command -v python || command -v python3 || true)
  if [ -n "$PYBIN" ] && [ -f scripts/check-imports.py ]; then
    PYMISS=$("$PYBIN" scripts/check-imports.py 2>/dev/null || true)
    if [ -n "$PYMISS" ]; then
      echo "  ❌ Imports Python que NÃO resolvem no ambiente atual (dependência ausente ou alucinada):"
      echo "$PYMISS"
      FAIL=1
    else
      echo "  ✅ Python: todos os imports resolvem no ambiente atual"
    fi
  else
    echo "  ⚠ python ou check-imports.py indisponível — pulando check Python"
  fi
fi
if [ "$HAS_NODE" = 0 ] && [ "$HAS_PY" = 0 ]; then
  echo "  ⚠ Ecossistema não detectado (sem package.json/pyproject/requirements) — pulando"
fi

echo "▶ Gate 2 — Migrations UP têm DOWN pareado (segurança)"
GATE2_FAIL=0
FOUND_MIG=0
for up in supabase/migrations/*.sql migrations/*.sql; do
  [ -e "$up" ] || continue
  FOUND_MIG=1
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
if [ "$FOUND_MIG" = 0 ]; then
  echo "  ⚠ Nenhuma migration encontrada — pulando"
elif [ "$GATE2_FAIL" -eq 0 ]; then
  echo "  ✅ Todas as migrations têm DOWN pareado"
else
  FAIL=1
fi

echo "▶ Gate 3 — Nenhum secret hardcoded (segurança — qualquer stack)"
if grep -rEn \
   --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
   --include='*.py' --include='*.php' --include='*.rb' --include='*.go' \
   --include='*.java' --include='*.cs' --include='*.kt' \
   --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build \
   --exclude-dir=.next --exclude-dir=vendor --exclude-dir=.venv --exclude-dir=venv \
   --exclude-dir=__pycache__ \
   "(api[_-]?key|secret|password|token)\s*=\s*['\"][A-Za-z0-9_\-]{16,}['\"]" . 2>/dev/null; then
  echo "  ❌ Possível secret hardcoded encontrado"
  FAIL=1
else
  echo "  ✅ Nenhum secret óbvio em código-fonte"
fi

echo "▶ Gate 4 — Ordem TDD: red antes de green (disciplina — qualquer stack)"
GATE4_FAIL=0
# Projeto adotado tem história pré-framework: se .sdd/tdd-baseline existir
# (hash de commit na 1ª linha), o gate audita só o histórico DEPOIS dele.
RANGE=""
if [ -f .sdd/tdd-baseline ]; then
  BASE=$(head -1 .sdd/tdd-baseline | tr -d '[:space:]')
  if git rev-parse --verify -q "$BASE" >/dev/null 2>&1; then
    RANGE="${BASE}..HEAD"
    echo "  ℹ baseline de adoção ativa — auditando commits após ${BASE:0:7}"
  fi
fi
TASKS=$(git log $RANGE --pretty=%s 2>/dev/null | grep -oE 'feat\(TASK-[0-9]+\)' | grep -oE 'TASK-[0-9]+' | sort -u || true)
for t in $TASKS; do
  first=$(git log $RANGE --reverse --pretty=%s | grep -E "^(test|feat)\($t\)" | head -1 || true)
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

echo "▶ Gate 5 — Type-check da stack (anti-alucinação de API)"
DID_TYPECHECK=0
if [ "$HAS_NODE" = 1 ] && [ -f tsconfig.json ]; then
  DID_TYPECHECK=1
  if npx tsc --noEmit >/dev/null 2>&1; then
    echo "  ✅ tsc --noEmit passou — APIs e tipos usados existem"
  else
    echo "  ❌ tsc --noEmit falhou — possível API alucinada ou erro de tipo:"
    npx tsc --noEmit 2>&1 | head -20
    FAIL=1
  fi
fi
if [ "$HAS_PY" = 1 ] && command -v mypy >/dev/null 2>&1; then
  if [ -f mypy.ini ] || grep -q '\[tool.mypy\]' pyproject.toml 2>/dev/null; then
    DID_TYPECHECK=1
    if mypy . >/dev/null 2>&1; then
      echo "  ✅ mypy passou — APIs e tipos usados existem"
    else
      echo "  ❌ mypy falhou — possível API alucinada ou erro de tipo:"
      mypy . 2>&1 | head -20
      FAIL=1
    fi
  fi
fi
if [ "$DID_TYPECHECK" = 0 ]; then
  echo "  ⚠ Nenhum type-checker configurado (tsconfig.json / mypy) — pulando"
fi

echo "▶ Gate 6 — Ambiente: nenhum bypass de dev em config de produção/staging"
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
