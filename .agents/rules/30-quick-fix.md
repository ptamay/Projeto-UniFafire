---
trigger: model_decision
---

# 30-quick-fix — Pedidos Pontuais (Model Decision)
<!-- Ativação: MODEL DECISION. Descrição: ative quando o usuário pedir uma mudança pequena e -->
<!-- direta ("ajuste este estilo", "corrija este texto", "melhore este componente") fora de sprint. -->

> Não substitui o ciclo TDD para features ou mudanças estruturais.

## Antes de qualquer alteração — classifique o pedido

| Pedido | Caminho |
|--------|---------|
| Estilo, texto, UI sem lógica | ✅ Quick Fix permitido |
| Bugfix isolado sem schema | ✅ Quick Fix permitido |
| Nova feature ou comportamento | ❌ → Change Request + sprint (`40-change-request.md`) |
| Toca schema, API ou `constitution.md` | ❌ BLOQUEADOR → Change Request |
| Afeta mais de 3 arquivos | ❌ → avise o usuário, proponha sprint formal |

Se BLOQUEADOR: explique o motivo, sugira o caminho correto, aguarde instrução.

## Ciclo Quick Fix (quando permitido)
```
1. ESCOPO: liste exatamente quais arquivos serão tocados — nada além
2. LEITURA proporcional ao risco:
   · Estilo/texto/UI → só seção de segurança do constitution.md (secrets, tenant_id, headers)
   · Bugfix → constitution.md seção DoD + arquivos afetados
   · Dúvida → constitution.md completo
3. EXECUÇÃO: apenas o pedido — sem melhorias não solicitadas, sem refatoração oportunista
4. VERIFICAÇÃO: tsc --noEmit passa + testes não regridem
5. COMMIT atômico: fix: | style: | chore: [descrição]
6. Se qualquer verificação falhar: reporte antes de prosseguir
```

## Limites (BLOQUEADOR se atingidos)
- Escopo cresceu além do mapeado no passo 1 → **pare**, informe, aguarde confirmação
- Quick Fixes somando > 5 arquivos sem commit intermediário → sprint não declarada
- Qualquer toque em schema, API contract ou `constitution.md` → redirecione para Change Request
- Branch: use `fix/[slug]` ou o branch de sprint ativo. Nunca crie `feature/` para Quick Fix.
