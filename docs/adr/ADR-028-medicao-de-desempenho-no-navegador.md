# ADR-028 — Medição de desempenho no navegador (Vercel Speed Insights)

- **Status:** Aceito — aprovado pelo usuário em 2026-09-14; implementação na TASK-126
- **Data:** 2026-09-14
- **Tipo de Change Request:** **C** (acrescenta uma camada à observabilidade já implementada — §7.2 — e
  uma dependência fora da stack do `plan.md`; nenhum requisito muda). Por que não é D: ver abaixo.
- **Relacionado:** constitution §6.1, §7.1, §7.2, §7.3 · ADR-012 (Vercel) · ADR-018/TASK-096
  (travamento aparente na navegação) · ADR-027/TASK-125 (menu que some) · `src/proxy.ts` (negação por
  padrão)
- **Origem:** o usuário ativou o Speed Insights no painel da Vercel e instalou `@vercel/speed-insights`
  (2.0.0) em 2026-09-14

## Contexto

### O que se mede hoje, e o que não

A §7.2 mede o **servidor**: tempo de resposta das rotas críticas, no logger. Nada mede o que a
pessoa **vê no navegador** — quanto a tela leva para aparecer (LCP), quanto um toque leva para
responder (INP), quanto o layout pula (CLS). As duas queixas de fluidez deste ano (ADR-018: tela
parada ao navegar; ADR-027: menu que some) só existiram como relato e captura de tela, e a correção
de cada uma só se prova no navegador de quem reclamou.

### O que o Speed Insights envia (documentação da Vercel, lida em 2026-09-14)

Por ponto de medição: rota, URL, velocidade da rede, navegador, tipo de aparelho, sistema, país, a
métrica e o seletor CSS do elemento que a causou, versão do SDK e hora de recebimento. **Sem cookie,
sem IP guardado, sem identificador de visitante** — a Vercel declara não conseguir reconstruir uma
sessão entre páginas.

**Plano gratuito:** só o *Real Experience Score* (uma nota agregada) por caminho e rota, janelas de
24 h e 7 dias, **10.000 eventos em 30 dias** para a equipe inteira. Passou disso, a coleta **pausa
por 14 dias** — não há cobrança. As métricas separadas (LCP, INP, CLS, TTFB, FCP) e os detalhes são
do *Speed Insights Plus*, pago, no plano Pro.

### Medido em produção em 2026-09-14 (só leitura, `curl` sem sessão)

```
/_vercel/speed-insights/script.js   → 200, application/javascript   (a Vercel responde antes do proxy)
/_vercel/speed-insights/vitals      → 404 JSON                       (idem — o proxy responderia 307)
/_vercel/insights/script.js         → 307 → /login                   (Web Analytics, NÃO ativado)
```

A terceira linha é a que importa: o `proxy.ts` **roda** em `/_vercel/*` quando nenhum recurso ativo
da Vercel responde pelo caminho. E a versão 2 do pacote não usa `/_vercel/speed-insights/` em produção:
usa um **caminho aleatório gerado no build** (*resilient intake*), passado ao cliente por
`NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG`. Se esse caminho escapa do proxy como o antigo, só um
deploy na Vercel diz.

## Decisão

1. **Um componente só, no layout raiz.** `<SpeedInsights>` entra em `src/app/layout.tsx` — todas as
   telas, `/login` incluída — por um componente de cliente próprio, que é **o único arquivo** de `src/`
   a importar `@vercel/speed-insights` (guarda). O layout raiz vale para o grupo `(app)` da TASK-125
   sem mudar nada.
2. **A URL sai sem query string e sem fragmento** (`beforeSend`). Os filtros do Histórico andam na URL
   — `userId`, `keyId`, `date`, `hour` — e juntos dizem *quem pegou qual chave e quando*. O caminho
   basta para medir; o resto é dado que não precisa sair (minimização, §6.1). Não há segmento dinâmico
   em nenhuma rota do sistema, então o caminho não carrega identificador.
3. **Só carrega na Vercel** (`process.env.VERCEL === '1'`, lido no layout, que é Server Component).
   Localmente, na E2E e no CI não carrega nada: em desenvolvimento o pacote baixaria um script de
   depuração de `va.vercel-scripts.com` — a suíte passaria a depender de rede de terceiro —, e um
   `next start` local pediria `/_vercel/...`, que o nosso proxy responde com 307.
4. **O proxy não muda de antemão.** Se o deploy de preview mostrar o caminho do *resilient intake*
   recebendo 307, a task libera **exatamente** os dois caminhos da configuração do build — nunca o
   prefixo `/_vercel/` inteiro, que a terceira linha da medição mostra estar protegido hoje.
5. **Amostragem de 100%** (o padrão). ~19 pessoas usam o sistema; se a cota gratuita acabar, a coleta
   pausa e a resposta é baixar `sampleRate`, não pagar. Migrar para o Plus contrariaria o "sem
   ferramenta paga" da §7.2 → seria **Tipo D**.

### Por que é C e não D

- **§7.2 continua verdadeira:** o logger segue medindo as rotas; isto acrescenta, não substitui, e
  não custa nada.
- **§7.3 ("sem telemetria externa") fala das métricas de negócio** do `spec.md` §5 — retiradas,
  confirmações, atrasos. Nenhuma delas vai para a Vercel: o evento é o carregamento de página, sem
  nada do domínio.
- **§6.1:** nenhum dado pessoal no ponto de medição (item 2).
- **§7.1:** nada é gravado em `app_logs`.

### Critério de aceite

- Guarda: só o componente próprio importa o pacote; o `beforeSend` tira query e fragmento
  (teste de unidade); o layout só o desenha sob a condição da Vercel.
- **No deploy da Vercel** (preview, se o acesso permitir; senão produção logo depois do merge): o
  script carrega com 200 e o envio das métricas responde 2xx — **nenhum 307** — no `/login` (sem
  sessão) e numa tela autenticada; o painel do Speed Insights recebe os primeiros pontos.
- Local e E2E: nenhuma requisição a `va.vercel-scripts.com` nem a `/_vercel/`.

## Alternativas consideradas

**Web Vitals à mão** (`useReportWebVitals` do Next) enviando para uma rota nossa e gravando no
`app_logs`. Nenhum terceiro, as cinco métricas separadas — e cada carregamento de página escreveria
linhas permanentes numa tabela que a §7.1 proíbe limpar. É a lição do `cron_desativado` (87% do
`app_logs` era ruído), e ainda faltaria a tela que agrega os números. Rejeitada.

**Vercel Web Analytics.** Conta visitas e páginas, não desempenho. Não é o que foi pedido.

**Não medir.** Continuar provando fluidez por relato. É o que se fez até aqui, e as duas correções de
fluidez do ano não têm número de antes e depois no navegador.

## Consequências

**Positivas**
- Uma nota de experiência real por tela, de usuários reais, em produção. A TASK-125 (ADR-027) passa a
  ter antes e depois medidos no navegador.
- Custo zero; um componente, sem estado, sem banco.

**Negativas / riscos**
- **Um terceiro a mais recebendo dados** (país, navegador, aparelho, caminho). A Vercel já recebe toda
  requisição por hospedar o sistema; o que muda é o registro agregado dessas informações.
- **No plano gratuito é só uma nota agregada**: diz *que* uma tela está lenta, não *qual* métrica.
  Para diagnosticar, o caminho continua sendo medir no navegador, como nas TASK-096 e 121.
- A cota é da **equipe** da Vercel inteira; outro projeto na mesma conta divide os 10.000 eventos.
- O *resilient intake* é mecanismo da Vercel que muda de caminho a cada build: a guarda local não o
  alcança, e só a verificação no deploy prova que o proxy não o bloqueia.

## Implementação

- **TASK-126 — Speed Insights no layout raiz.** Componente de cliente com `beforeSend` sem query e
  fragmento; desenhado no layout só com `VERCEL=1`; guardas do critério de aceite; verificação no
  deploy da Vercel, com e sem sessão, e registro do resultado no `plan.md`.
