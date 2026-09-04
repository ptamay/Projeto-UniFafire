---
description: Pedido pontual pequeno (estilo, texto, bugfix isolado) fora de sprint
---

1. Classifique o pedido com a tabela da regra `30-quick-fix.md`. Se tocar schema, API,
   `constitution.md` ou for feature nova → redirecione para `/change-request` e pare.
2. Liste exatamente quais arquivos serão tocados — nada além. Leitura proporcional ao risco
   (ver regra 30).
3. Execute APENAS o pedido — sem melhorias não solicitadas, sem refatoração oportunista.
4. Verifique: type-check passa + testes não regridem. Commit atômico `fix:` | `style:` | `chore:`.
5. Se o escopo cresceu além do mapeado no passo 2 → pare, informe, aguarde confirmação.
