# ADR-020 — A §3.2 passa a nomear a fronteira, não a rota

- **Status:** Aceito — aprovado pelo usuário em 2026-09-08
- **Data:** 2026-09-08
- **Tipo de Change Request:** **D** (altera `constitution.md`)
- **Relacionado:** constitution §3.2 · ADR-014 · ADR-015 · REQ-005, REQ-010
- **Origem:** decisão deixada em aberto pelo ADR-015 e cobrada em cada checkpoint desde

## Contexto

A §3.2 dizia, desde a Fase 6:

> **Toda rota de API valida a sessão E a permissão no servidor.** Checagem só no
> client = vulnerabilidade, não feature.

A cláusula está certa no que afirma. O problema é o **sujeito**: "rota de API".

Em setembro de 2026, cinco falhas de autorização foram encontradas em duas horas
pelo mesmo método — enumerar a superfície e comparar irmãos lado a lado. Duas
estavam em rotas (ADR-014) e **três em páginas** (ADR-015).

As três das páginas são de outra natureza, e é essa diferença que obriga a emenda:

| | falha em rota | falha em página |
|---|---|---|
| onde o dado sai | handler de `/api/*` | Server Component |
| a §3.2 alcança? | sim, literalmente | **não, pela letra** |
| 403 é possível? | sim | **não — não existe handler no caminho** |

No App Router, a página **consulta o banco diretamente**, com o mesmo pool, e
entrega o resultado ao navegador. Quando ela verifica só a sessão, a camada inteira
onde as checagens vivem é contornada — e nenhum teste de rota alcançaria.

O ADR-015 registrou o problema com todas as letras e **não** o resolveu:

> A constitution §3.2 fala em "rota de API", e é razoável ler que a regra se dirige
> a handlers. **A intenção é maior que a letra:** o que ela protege é a fronteira
> entre quem pede e o dado.

O código foi corrigido e uma guarda varre as `page.tsx`. Mas **a cláusula continuou
com o texto antigo** — e quem a lesse antes de escrever uma página nova concluiria,
com razão, que não se aplica. A guarda protege o repositório; a lei ainda apontava
para o lugar errado.

## Decisão

A §3.2 passa a ter este texto:

> **Toda fronteira entre quem pede e o dado valida a sessão E a permissão no
> servidor** — rota de API e Server Component igualmente. Checagem só no client =
> vulnerabilidade, não feature.
>
> No App Router a **página também é fronteira**: ela consulta o banco diretamente e
> entrega o resultado ao navegador. Quando verifica só a sessão, **não há 403
> possível** — não existe handler no caminho, e a camada onde as checagens vivem é
> contornada inteira.

### O que muda, e o que não muda

**Não muda nenhum comportamento.** As três páginas foram corrigidas na Sprint 27 e
a guarda existe desde então. Esta emenda alinha a **letra** ao que o sistema já faz.

**Muda o que um leitor futuro conclui.** É o ponto inteiro: uma regra de segurança
vale pelo que ela impede alguém de escrever amanhã, não pelo que descreve hoje.

### Por que "fronteira" e não uma lista

A tentação seria enumerar — "rota de API, Server Component, Server Action, route
handler…". Uma lista envelhece: a próxima maneira de o framework entregar dado ao
navegador nasce fora dela, e a cláusula volta a ficar aquém, exatamente como ficou
agora.

**Fronteira** é o critério que sobrevive à mudança de framework: onde quer que o
sistema decida *entregar dado a quem pediu*, ali se verifica sessão e papel. Os dois
casos concretos ficam nomeados logo depois, para que a regra continue acionável e
não vire abstração.

## Alternativas consideradas

**Deixar como está, apoiado na guarda automática.** A guarda do ADR-015 já reprova
página desprotegida. Rejeitada: guarda tem lista de exceções, e a lista cresce por
decisão de quem está com pressa. A cláusula é o argumento contra a exceção — sem
ela, a conversa vira "o teste está chato".

**Emendar para "toda rota de API e toda página".** Mais direto, e é a lista que o
parágrafo acima rejeita.

**Criar uma cláusula nova em vez de emendar a existente.** Duas cláusulas sobre a
mesma coisa divergem no primeiro dia em que alguém mexer numa só — é a lição da
TASK-083 (a senha padrão tinha cinco fontes, duas já divergindo).

## Consequências

**Positivas**
- Quem ler a §3.2 antes de escrever uma página nova encontra a regra que se aplica.
- A guarda do ADR-015 passa a ter respaldo textual, e não só precedente.
- O critério cobre a próxima superfície que o framework inventar.

**Negativas / riscos**
- Cláusula mais longa. É o preço de nomear o caso concreto além do princípio — e o
  caso concreto é o que faltava.
- Toda emenda de constitution cria pressão para a próxima. As Tipo D continuam
  exigindo aprovação explícita, e esta teve.

## Implementação

Alteração de texto em `.sdd/memory/constitution.md` §3, item 2, e o registro
correspondente no `spec.md` e no `plan.md`. **Nenhuma task de código** — o
comportamento já está conforme desde a Sprint 27.
