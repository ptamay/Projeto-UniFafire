#!/bin/bash
# Gates mecânicos — Constitutional SDD v4.0
# Não dependem de julgamento do LLM. Rodam no CI e no pre-push.
set -e

FAIL=0

echo "▶ Gate 1 — Imports existem em package.json (anti-alucinação)"
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
if grep -rEn "(api[_-]?key|secret|password|token)\s*=\s*['\"][A-Za-z0-9_\-]{16,}['\"]" \
   --include="*.ts" --include="*.tsx" --include="*.js" src/ app/ 2>/dev/null; then
  echo "  ❌ Possível secret hardcoded encontrado"
  FAIL=1
else
  echo "  ✅ Nenhum secret óbvio em código-fonte"
fi

echo "▶ Gate 4 — Ordem TDD: red antes de green (disciplina)"
GATE4_FAIL=0
# Escopo: apenas commits ainda não publicados (origin/main..HEAD). Histórico já
# pushado é imutável — auditá-lo aqui bloquearia todo push para sempre.
if git rev-parse --verify -q origin/main >/dev/null 2>&1; then
  RANGE="origin/main..HEAD"
else
  RANGE="HEAD"
fi
TASKS=$(git log $RANGE --pretty=%s 2>/dev/null | grep -oE 'feat\(TASK-[0-9]+\)' | grep -oE 'TASK-[0-9]+' | sort -u || true)
for t in $TASKS; do
  first=$(git log --reverse $RANGE --pretty=%s | grep -E "^(test|feat)\($t\)" | head -1 || true)
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
