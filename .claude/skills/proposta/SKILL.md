---
name: proposta
description: Use this skill to run commercial discovery and generate a project proposal
  (escopo, sprints, preço, prazo, exclusões) BEFORE starting a Constitutional SDD project.
  Triggers when the user says 'proposta', 'orçamento de projeto', 'estimar projeto',
  'discovery de cliente', 'novo cliente', 'quanto cobrar por', or '/proposta'. Runs in
  Claude Code, before the project workspace exists. Part of the Constitutional SDD framework.
---

## Papel

Você conduz a **Fase Comercial** do Constitutional SDD: transformar a conversa com o
cliente em uma proposta defensável, **sem executar as Fases 1–5**. Só discovery +
estimativa + proposta. É a etapa que precede o `novo-projeto.ps1`.

## Fluxo

1. **Discovery** (se o usuário já tem as respostas, pule para o passo 2). Levante:
   problema, funcionalidades macro, nº aparente de entidades, integrações, dados sensíveis,
   multi-cliente (SaaS?), e **dado legado a migrar** (substitui planilha/sistema?).

2. **Classifique o modo provável:** MVP | Expresso | Padrão (+ overlay SENSÍVEL se houver
   dado de saúde/jurídico/financeiro/biométrico/menor). Em dúvida, assuma o mais alto.

3. **Estime sprints:** features macro → pontos (S=1 | M=2 | L=4) → ÷ 16 pts/sprint. Some:
   - 1 sprint de fundação (auth + shell + RBAC + telas de conta)
   - a Fase 10.5 (carga de dados) se há dado legado — é esforço próprio, não "detalhe"
   - 20% de margem de risco

4. **Converta em números:**
   - Prazo: nº de sprints × 2–3 dias úteis + margem
   - Preço: sprints × seu valor-sprint, OU valor fechado com margem
   - Infra mensal do cliente: ~US$45/mês em produção (Vercel Pro + Supabase Pro) — free tier
     serve para dev/staging, NUNCA para produção com dado real (regra de DR: backup obrigatório)
   - Manutenção pós-entrega (ver fleet-operations)

5. **Gere `proposta-[cliente].md`** com: escopo macro, modo previsto, nº de sprints, preço,
   prazo, premissas, **EXCLUSÕES EXPLÍCITAS** (o que NÃO está incluso), condições de
   manutenção e validade da proposta.

6. **Ofereça gerar em `.docx`** (a skill `docx` auto-ativa) para enviar ao cliente formatado.

## Regras

- A estimativa é compromisso de **PROPOSTA, não de spec**. Se as Fases 1–5 revelarem escopo
  maior, isso é **renegociação com o cliente** — nunca absorção silenciosa.
- **Exclusões explícitas são a parte mais importante** — é o que evita "achei que estava
  incluído" depois de assinar.
- Deixe o valor fora do discovery em si; apresente na proposta, quando já mostrou domínio do escopo.

> Proposta aceita → rode `novo-projeto.ps1`, mova a proposta para `/docs/` do projeto e
> inicie a Fase 0 (o texto do discovery vira rascunho do `overview.md`).
