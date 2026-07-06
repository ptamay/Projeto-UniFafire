> 📚 REFERÊNCIA — conteúdo v4 preservado. Onde este texto disser `.agents/memory` leia `.sdd/memory`. Estrutura v5: `.agents/` = só rules+workflows do Antigravity · skills em `.claude/skills/` · memória e referência em `.sdd/` (ver README da raiz). Leia este arquivo POR SEÇÃO, nunca inteiro.

# maturity-gaps.md
> **Módulo:** Maturity Gaps & Evolution | **Versão:** 4.0
> **Carregado em:** Revisões, auditorias e evoluções do documento
> **Depende de:** `master-spec-core.md`

Este módulo contém o registro de maturidade do documento: gaps conhecidos para score 10/10, o diff completo de todas as versões, e o roadmap de modularização já executado na v4.0. Não é necessário para operação diária — carregar apenas em sessões de revisão ou evolução do spec.

> **Nota v4.0:** O roadmap de modularização descrito na Seção 3 deste módulo foi **executado**.
> A estrutura de 4 módulos + core está ativa desde a v4.0. Este módulo mantém o registro
> histórico e os critérios para futuros ciclos de evolução.

---

## 1. Gaps para Score 10/10 em PME — Roadmap de Maturidade

Os itens abaixo não estão nas fases principais pois dependem do contexto do projeto. Devem ser ativados conforme o cliente e o sistema evoluem.

---

### Gap 1 — Precificação Técnica (Cost Model)

**Problema:** Sem medir custo de infra por cliente/plano, você pode descobrir tarde que o plano básico dá prejuízo.

**Quando ativar:** Ao desenvolver um SaaS com planos diferenciados (free, básico, pro).

**Como implementar:** Adicionar `cost_model.md` ao Memory Bank na Fase 6 com a seguinte estrutura:

```
# cost_model.md

## Custo estimado por tenant/mês
| Recurso | Custo unitário | Volume estimado (plano básico) | Total |
|---------|---------------|-------------------------------|-------|
| Banco (Neon/Supabase) | $X/GB | Y GB | $Z |
| Storage (arquivos) | $X/GB | Y GB | $Z |
| Compute (Vercel/Railway) | $X/req | Y req | $Z |
| **Total por tenant** | | | **$Z** |

## Preço mínimo viável por plano
[Custo total + margem mínima de 40%]
```

> Adicionar ao prompt do Opus na Fase 6: *"Valide se o cost_model.md está presente para sistemas SaaS e se a margem por plano é positiva."*

---

### Gap 2 — Supply Chain Security (SBOM + Sigstore)

> *Disaster Recovery foi promovido a regra obrigatória no `constitution.md`. Não é mais um gap opcional.*

**Problema:** A cadeia de suprimentos de software (dependências, artefatos de build, pipelines) é um vetor de ataque crescente. SBOM e assinatura de artefatos são exigidos em contratos corporativos e certificações como SLSA.

**Quando ativar:** Projetos com requisito de certificação formal, clientes corporativos que exigem auditoria de supply chain, ou sistemas com SLSA Level 2+.

**Para PME simples: não obrigatório.** O SAST + SCA do fluxo padrão já cobre os riscos relevantes.

**Como implementar quando necessário:**

```
## Supply Chain Security
- SBOM: gerar automaticamente via syft ou cyclonedx em cada build.
- Artifact signing: assinar imagens Docker e binários com Sigstore/Cosign.
- Provenance: validar que artefatos foram gerados pelo pipeline oficial (SLSA Level 2+).
- Dependency pinning: usar lockfiles (package-lock.json, poetry.lock) com hashes verificados.
```

---

### Gap 3 — Zero Trust para Arquiteturas Multi-Serviço

> *Irrelevante para monolitos e sistemas PME simples. Ativar apenas em arquiteturas com múltiplos serviços independentes.*

**Problema:** Em arquiteturas com microsserviços ou múltiplos backends, sem autenticação entre serviços qualquer componente comprometido tem acesso irrestrito aos demais.

**Quando ativar:** MODO PADRÃO com múltiplos serviços, APIs internas, ou comunicação service-to-service.

**Como implementar:**

```
## Zero Trust — Service-to-Service
- Toda comunicação entre serviços deve ser autenticada (mTLS ou JWT de serviço).
- Nenhum serviço é confiável por padrão — mesmo dentro da rede interna.
- Princípio do menor privilégio: cada serviço acessa apenas o que precisa.
- Ferramenta recomendada: Cloudflare Zero Trust (free tier) ou serviço de identidade do cloud provider.
```

---

### Gap 4 — Offboarding de Cliente e Conformidade LGPD

**Problema:** Quando um cliente cancela ou a LGPD exige exclusão de dados, sem processo definido você opera no improviso — com risco legal.

**Quando ativar:** Todo sistema que armazena dados pessoais de usuários finais (nome, CPF, e-mail, endereço) — praticamente todo sistema PME.

**Como implementar:** As perguntas de LGPD já estão na Fase 3 (pergunta 4). Adicionar ao `spec.md` como fluxo crítico:

> *"O sistema armazenará dados pessoais de clientes finais? Se sim, como o titular pode solicitar exportação ou exclusão dos seus dados? (LGPD Art. 18)"*

E adicionar ao `spec.md` como fluxo crítico obrigatório:

```
## Fluxos de Conformidade LGPD
- **Exportação de dados:** usuário pode exportar todos os seus dados em formato legível (JSON/CSV)
- **Exclusão de dados:** usuário pode solicitar exclusão; prazo de execução: 15 dias
- **Offboarding de tenant:** cliente pode exportar todos os dados da empresa antes do cancelamento
- **Retenção:** dados são mantidos por [X dias] após cancelamento antes de exclusão definitiva
```

---

### Gap 5 — Chaos Engineering (Validação de Resiliência sob Falha)

> *Irrelevante para monolitos PME em Vercel + Supabase. Ativar apenas quando a infraestrutura tem redundância suficiente para testar falha intencionalmente.*

**Problema:** DR com RPO/RTO define o objetivo — mas sem testes de caos, você só descobre se o sistema sobrevive a uma falha quando a falha de fato ocorre em produção.

**Quando ativar:** MODO PADRÃO com múltiplos serviços, múltiplas regiões, ou SLA ≥ 99.9%. Requer infraestrutura com redundância prévia para que o teste não derrube o sistema permanentemente.

**Para PME simples: não obrigatório.** O Circuit Breaker + DLQ + DR da seção de resiliência já cobre o risco relevante.

**Como implementar quando necessário:**

```
## Chaos Validation Checklist
- [ ] Desligar dependência de banco: sistema exibe erro gracioso, não 500 bruto
- [ ] Desligar Redis/cache: sistema degrada para fallback sem travar
- [ ] Simular timeout de integração externa: circuit breaker abre, DLQ captura
- [ ] Desligar serviço de e-mail/SMS: operação continua, notificação vai para fila
Ferramenta: Chaos Monkey (AWS), Gremlin, ou kill de container manual em staging.
Nunca executar em produção sem plano de rollback imediato.
```

---

## 2. Diff v3 → v3.9 (Registro de Mudanças)

| # | Onde | O que mudou | Por quê |
|---|------|-------------|---------|
| 1 | Seção 3 (nova) | Tabela de modelo por fase com gate de troca explícito | Documenta a estratégia multi-model como parte do spec, não como decisão informal |
| 2 | Fase 1 | Perguntas 6, 7 e 8 adicionadas (multi-tenancy, API, modelo de negócio) | Decisões de isolamento e versionamento têm custo arquitetural se tomadas tarde |
| 3 | Fase 2 | Pergunta 5: distinção Super Admin vs. Admin do Tenant | Evita colisão de permissões em sistemas multi-tenant |
| 4 | Fase 3 | Pergunta 4: conformidade regulatória + ameaças cross-tenant no STRIDE | LGPD/GDPR impactam modelo de dados; cross-tenant leakage é ameaça específica de SaaS |
| 5 | Fase 4.1 | Onboarding do primeiro cliente como rota crítica obrigatória | É onde SaaS perde clientes; não pode ser afterthought |
| 6 | Fase 5 | Tabela de observabilidade com 3 camadas e ferramentas concretas | Métricas de negócio definidas antes do lançamento, não depois |
| 7 | Fase 6 | `api-contract.md` como novo artefato obrigatório para APIs públicas | Contrato de API é compromisso comercial; precisa de documento formal |
| 8 | Fase 6 | Seção `Decisões e Justificativas` obrigatória no `plan.md` | Transfere contexto das 11 fases para modelos externos sem histórico |
| 9 | Fase 6 | CHECKPOINT com prompt estruturado para auditoria com Opus | Torna a troca de modelo um protocolo verificável, não uma intuição |
| 10 | Fase 9 | Campo "Isolamento de Tenant" no template de task | Força verificação de segurança multi-tenant em cada item de trabalho |
| 11 | Fase 10 | Guardrail explícito: query sem tenant_id = BLOQUEADOR | Impede que agente introduza cross-tenant leakage silenciosamente |
| 12 | strict_rules | Regras de multi-tenancy, versionamento de API e observabilidade adicionadas | Tornam esses requisitos parte da lei máxima, não sugestões |
| 13 | strict_rules + Fase 5 | Stack de observabilidade substituída por ferramentas gratuitas (Sentry free, Vercel Analytics, PostHog 1M/mês) com critério explícito de upgrade | Reduz custo operacional em fase inicial; PostHog cobre as 3 camadas sozinho |
| 14 | Fase 0 (nova) | Pré-processamento do `overview.md` com template canônico, fora do Antigravity | Preserva o fluxo de escrita humana → formatação por IA, agora entregue como arquivo no workspace em vez de upload temporário |
| 15 | Fase 1 | Substituído "solicite upload" por "leia `/.sdd/memory/overview.md` do workspace" | Contexto persistente no projeto; arquivo disponível para todas as fases sem repassar manualmente |
| 16 | Seção 4 (nova) | Memory Bank documentado como conceito explícito com protocolo de leitura e atualização obrigatórios | Modelos perdem contexto entre sessões; Memory Bank é o mecanismo que mantém decisões arquiteturais vivas |
| 17 | strict_rules | Regra de migração com rollback obrigatório adicionada | Agentes de IA aplicam ALTER TABLE sem considerar reversão — risco crítico em produção |
| 18 | strict_rules | SAST (Semgrep) + SCA (npm audit/pip-audit) adicionados como regras inegociáveis | Cobertura de 80% não detecta secrets hardcoded nem CVEs em dependências |
| 19 | strict_rules + DoD | SAST/SCA adicionados ao DoD como itens bloqueantes | Garante que security gate não é opcional — faz parte da definição de pronto |
| 20 | Fase 5 | Neon adicionado para CI/CD com tabela comparativa e instrução de branch efêmero por PR | Testes concorrentes de agentes em banco compartilhado contaminam dados; Neon resolve com copy-on-write |
| 21 | Fase 6 CHECKPOINT | Checklists de Clareza e Rastreabilidade adicionados como itens verificáveis | Substitui validação heurística por verificação binária determinística; requisitos ambíguos ou órfãos bloqueiam avanço |
| 22 | Fase 6 CHECKPOINT | Prompt do Opus atualizado com 4 novos itens de auditoria (ambiguidade, rastreabilidade, rollback, SAST/SCA) | Torna a auditoria do Opus exaustiva e alinhada com todas as regras do constitution.md |
| 23 | Fase 9 | Nota de fatia vertical obrigatória adicionada ao template de task | Tasks como camadas técnicas horizontais quebram o BDD e dificultam TDD atômico |
| 24 | Fase 10 | TDD Atômico: regra de 1-teste-1-commit explicitada como BLOQUEADOR se violada | Agentes perdem disciplina de TDD sem restrição absoluta; múltiplos testes simultâneos antes de implementar é o anti-padrão mais comum |
| 25 | Fase 10 | Step Migrate adicionado: rollback antes de UP, teste em Neon, commit pareado | Fecha o ciclo da regra de migração do constitution.md no workflow executável |
| 26 | Fase 10 | Security Gate (Step 7) adicionado como step bloqueante e não-bypassável | Merge automático sem SAST/SCA é risco severo independente da cobertura de testes |
| 27 | Seção 2 (reformulada) | Contexto de uso "Solo Developer + IA para PME" explicitado como paradigma principal | Alinha o documento com o uso real: um desenvolvedor solo atendendo clientes PME com IA |
| 28 | Seção 3 (nova) | Tabela de critério de modo por tipo de cliente (pizzaria → Expresso, SaaS → Padrão) | Remove ambiguidade de "escopo simples vs. complexo" com exemplos concretos de PME |
| 29 | Seção 3 | Tabela de recursos condicionais por modo (o que é obrigatório vs. opcional em cada modo) | Elimina overhead desnecessário para sistemas simples sem comprometer sistemas complexos |
| 30 | Seção 9 (nova) | Gap 1: cost_model.md para precificação técnica de SaaS | Evita que plano básico dê prejuízo por falta de medição de custo por tenant |
| 31 | Seção 9 (nova) | Gap 2: Disaster Recovery com RPO/RTO acordado e documentado | PMEs perdem dados e culpam o dev; responsabilidade precisa estar documentada desde o início |
| 32 | Seção 9 (nova) | Gap 3: Offboarding de cliente + fluxos de conformidade LGPD | Dado pessoal sem processo de exclusão é risco legal; LGPD Art. 18 é obrigação, não opcional |
| 33 | strict_rules | SECRETS MANAGEMENT: Doppler como padrão PME, proibição de secrets em repo/logs | Vazamento de credencial é o vetor #1 de breach |
| 34 | strict_rules | DISASTER RECOVERY promovido de Gap opcional para regra obrigatória com RPO/RTO defaults | DR não é opcional em produção; defaults protegem o desenvolvedor legalmente |
| 35 | strict_rules | LOGGING SEGURO: máscara obrigatória de PII, JWT, senhas em todos os logs | LGPD pune log com dados pessoais |
| 36 | strict_rules | RESILIÊNCIA DISTRIBUÍDA: timeout/retry/circuit breaker/DLQ obrigatórios para integrações | Integrações sem resiliência causam falha em cascata |
| 37 | DoD | Secrets, logging, DR e resiliência adicionados como itens bloqueantes | Novas regras verificadas em cada task, não apenas no deploy final |
| 38 | Fase 3 | Perguntas 5, 6 e 7: RPO/RTO com opções guiadas, integrações externas, secrets manager | Cliente define DR antes do desenvolvimento; opções concretas evitam resposta vaga |
| 39 | Fase 3 | Pergunta 4 expandida com tabela de compliance por setor (PME/saúde/financeiro/corporativo) | Dev sabe exatamente qual framework aplicar por tipo de cliente |
| 40 | Seção 9 | Gap 2 substituído: DR promovido, Supply Chain Security (SBOM/Sigstore) ocupa o slot | SBOM é overkill para pizzaria; relevante apenas para clientes com certificação formal |
| 41 | Seção 9 | Gap 3: Zero Trust para multi-serviço (condicional, não obrigatório para monolito PME) | Monolito PME não precisa de mTLS; ativado apenas com múltiplos serviços |
| 42 | Seção 9 | Gaps renumerados: LGPD/Offboarding passa a Gap 4 | Reorganização para refletir prioridade real de implementação |
| 43 | strict_rules | PROTEÇÃO ANTI-DDoS: 4 camadas obrigatórias (Cloudflare, rate limiting, security headers, infra) | Proteção começa no desenvolvimento, não depois do primeiro ataque |
| 44 | DoD | DDoS Layers 1, 2 e 3 adicionados como itens bloqueantes do Definition of Done | Garante que deploy nunca ocorre sem proteção mínima configurada |
| 45 | Fase 5 | Tabela de proteção anti-DDoS com ferramentas gratuitas e critério de upgrade | Cloudflare free cobre 95% dos casos PME; configuração antes do primeiro deploy |
| 46 | Seção 2 (nova) | Protocolo de Decisão Guiada: "não sei" nunca bloqueia — agente apresenta opções com recomendação padrão | Elimina o principal ponto de atrito: usuário travado por não saber responder pergunta técnica |
| 47 | Seção 2 | Tabela de defaults PME para 12 domínios de decisão | Agente nunca improvisa — usa defaults validados para o contexto PME quando usuário não tem preferência |
| 48 | Fases 1–6 e 8 | Aviso de Protocolo de Decisão Guiada ativo adicionado no início de cada fase | Lembrete explícito para o agente aplicar sugestões automáticas em cada ponto de decisão |
| 49 | Seção 4 | Critério numérico de entidades (≤5) adicionado como segunda camada de decisão para MODO EXPRESSO | Tipo de cliente sozinho é insuficiente — pizzaria com 3 integrações é MODO PADRÃO |
| 50 | Seção 4 | MODO PADRÃO com critério de ativação por QUALQUER condição (entidades, integrações, multi-tenant, dados sensíveis, API pública) | Torna a decisão de modo determinística, não heurística |
| 51 | Fase 5 | Script de verificação de versionamento de API adicionado ao CI como step bloqueante | Transforma regra passiva do constitution.md em enforcement automático — rota sem /v1/ bloqueia merge |
| 52 | Fase 10 | API versioning check adicionado ao Security Gate (item c) com exceções documentadas | Fecha o ciclo: regra no constitution → verificada no CI → bloqueante no workflow de agente |
| 53 | Seção 8 (nova) | Stack de Referência PME consolidada em 5 camadas com todas as ferramentas gratuitas | Visão única de 30 segundos — agente não precisa vasculhar o documento para saber o que usar |
| 54 | Seção 8 | Regra de Ouro do Frontend destacada na camada 1 da stack | Consolida a regra crítica no mesmo lugar da stack — não apenas nas strict_rules |
| 55 | Seção 8 | Critério de desvio com template obrigatório em plan.md | Qualquer substituição da stack padrão precisa de justificativa registrada — sem registro, agente usa o padrão |
| 56 | Fase 4.0 (nova) | Bootstrap Visual: pasta `/assets/brand/`, extração de cores da logo via Vision AI, geração de layout shell genérico | Agentes geravam componentes sem contexto visual — inconsistência acumulada sprint a sprint |
| 57 | Fase 4.0 (nova) | `ui-context.md` adicionado ao Memory Bank com paleta, tipografia, shell e referência de assets | Fecha o gap do Memory Bank: identidade visual agora é contexto persistente como constitution.md e spec.md |
| 58 | Fase 5 (nova seção) | `handoff.md` gerado ao final da Fase 5: resumo compacto de escopo das Fases 1–5 para transição Gemini → Opus | Opus entrava na Fase 6 com histórico de 40+ turnos como único contexto — risco de perda de decisões críticas e overflow de janela |
| 59 | Fase 9 (nova seção) | Regra de Capacidade de Sprint: máx. 16 pts / 10 tasks por sprint para dev solo, com protocolo de negociação explícita | Agente gerava sprints tecnicamente corretas mas inviáveis para execução — roadmap no papel, burnout na prática |
| 60 | Seção 10 | `ui-context.md` e `handoff.md` adicionados ao Mapa de Artefatos com fase e localização | Artefatos novos sem entrada no mapa são invisíveis para agentes que consultam a seção de referência |
| 61 | Seção 4 (nova) | MODO MVP adicionado: fases 0,1,2,4.0,4,6,9 — sem Threat Model, SAST, workflow autônomo | Reduz overhead para protótipos e CRUDs internos; Expresso já era leve demais para landing pages |
| 62 | Seção 4 | `constitution-lite.md` definido como artefato do MODO MVP | MVP precisa de contrato mínimo sem o peso do constitution.md completo |
| 63 | Seção 4 | Tabela de recursos condicionais expandida para 3 modos com Event Architecture, ADR, Performance Gate e AI Cost Budget | Visibilidade completa do que cada modo ativa ou não, sem precisar ler cada seção |
| 64 | strict_rules | EVENT ARCHITECTURE: naming convention, idempotência, versionamento, rastreabilidade e tabela de brokers | Eventos assíncronos não tinham definição arquitetural — DLQ existia mas sem contrato de evento |
| 65 | strict_rules | PERFORMANCE GATE adicionado ao DoD: p95 < 500ms, p99 < 1000ms via k6 para endpoints críticos (MODO PADRÃO) | Testes de carga não existiam como gate — sistema podia ir para produção sem validação de performance |
| 66 | strict_rules | AI COST BUDGET adicionado como regra: cap por provider, por sprint e por projeto, com alerta em 80% | Projetos agênticos escalam custo de tokens rapidamente — sem cap, sprint pode explodir o orçamento |
| 67 | Fase 6 | ADR formal adicionado como artefato obrigatório no MODO PADRÃO com template canônico e lista de ADRs mínimos | plan.md captura decisões em tabela — ADR captura o racional e os trade-offs para decisões não-óbvias |
| 68 | Seção 10 | Fluxo de rastreabilidade entre artefatos adicionado como diagrama ASCII antes do mapa | Dev solo precisa entender como os artefatos se conectam sem ler o documento inteiro |
| 69 | Seção 10 | `adr/ADR-NNN-*.md` e `event-catalog.md` adicionados ao Mapa de Artefatos | Novos artefatos das Fases 6 precisam de entrada no mapa para serem descobertos pelos agentes |
| 70 | Seção 11 | Gap 5: Chaos Engineering adicionado como maturidade opcional para MODO PADRÃO multi-serviço | Chaos para PME simples é overkill real — entra como gap de maturidade, não como regra |
| 71 | strict_rules | ARCHITECTURE FITNESS FUNCTIONS: 4 regras Semgrep customizadas em `.semgrep/fitness.yml` | Sem fitness functions, a arquitetura decai silenciosamente sprint a sprint — nenhum gate detectava violações estruturais |
| 72 | Fase 5 | Convenção de commit com rastreabilidade reversa: `TASK-NNN`, `REQ-NNN`, `ADR-NNN` em todo commit | Havia rastreabilidade spec→task→commit mas não o inverso — impossível auditar qual requisito gerou qual commit |
| 73 | Fase 10 | Sprint-execution atualizado: commits incluem REQ e ADR como trailers obrigatórios | Alinha a execução autônoma com a convenção de commit da Fase 5 |
| 74 | Fase 10 | AI Validation Gate adicionado como Step 8: Spec Compliance, Requirement Drift, ADR Compliance, Hallucination Proxy | Agentes podiam gerar código que passava em todos os gates técnicos mas divergia silenciosamente do spec |
| 75 | Fase 11 | Release Governance: template `release-[versão].md` com changelog, nível de risco, rollback plan e feature flags | Deploy acontecia sem artefato formal — cliente real sem plano de rollback documentado é risco operacional |
| 76 | Seção 13 (nova) | Roadmap de Modularização v4.0: 4 módulos + master como índice | Documento de 80KB+ como contexto único aumenta custo de tokens e dispersa atenção do modelo |

---

## 3. Diff v3.9 → v4.0 (Modularização)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 77 | `master-spec-core.md` | Seção 7 (strict_rules completa) removida — substituída por referência a `modules/security-constitution.md` | Elimina duplicação DRY: dois arquivos com as mesmas regras podiam divergir silenciosamente |
| 78 | `master-spec-core.md` | Seções 8 e 10 (stack + mapa de artefatos) removidas — mantidas em `modules/architecture-governance.md` | Conteúdo já estava no módulo; manter nos dois criava risco de divergência |
| 79 | `master-spec-core.md` | Seções 9, 11, 12 (fases operacionais 7–11 + gaps + diff) removidas — mantidas em módulos respectivos | Core deve ser índice; fases operacionais pertencem ao sprint-governance |
| 80 | `master-spec-core.md` | Seção 13 (roadmap v4.0) substituída por nota de execução concluída | Roadmap foi executado; manter como "futuro" seria impreciso |
| 81 | `master-spec-core.md` | Versão atualizada de 3.9.1 para 4.0 | Reflete a quebra estrutural da modularização |
| 82 | `master-spec-core.md` | Nota de ambiente adicionada à Fase 1: fases 7–11 requerem acesso a sistema de arquivos | Clarifica que sessões de chat puro não executam fases operacionais |
| 83 | `master-spec-core.md` | Aviso de módulos obrigatórios adicionado ao início da Fase 6 | Agente sabe quais módulos carregar sem consultar o SKILL.md |
| 84 | `master-spec-core.md` | `ui-context.md` e `handoff.md` adicionados à tabela do Memory Bank (Seção 6) | Esses artefatos estavam na Seção 10 mas ausentes da tabela central do Memory Bank |
| 85 | `SKILL.md` | Paths atualizados de `resources/modules/` para `modules/` (estrutura real de deploy) | Paths anteriores causariam erro ao tentar carregar os módulos |
| 86 | `SKILL.md` | Versão atualizada para v4.0 na mensagem de ativação | Consistência com o core |
| 87 | `SKILL.md` | Nota explicativa adicionada sobre por que `security-constitution.md` não é carregado nas Fases 7–9 | Elimina ambiguidade: agente sabe que a ausência nas 7–9 é intencional, não um erro |
| 88 | `SKILL.md` | Regra de conflito adicionada: módulo prevalece sobre core em caso de divergência | Estabelece hierarquia clara de autoridade entre arquivos |
| 89 | `modules/security-constitution.md` | Header atualizado: papel de "fonte única de verdade" explicitado | Remove ambiguidade sobre qual arquivo é autoritativo |
| 90 | `modules/security-constitution.md` | Seção renumerada de "7" para "1" | Numeração local do módulo, não herança do monolito |
| 91 | `modules/architecture-governance.md` | Seções renumeradas de "8"/"10" para "1"/"2" | Numeração local do módulo |
| 92 | `modules/architecture-governance.md` | Fluxo de geração e consumo do `ui-context.md` adicionado ao Mapa de Artefatos | Artefato presente no mapa mas sem fluxo explícito — agentes não sabiam como ele era gerado e consumido |
| 93 | `modules/sprint-governance.md` | Header de dependências alinhado com `SKILL.md`: nota sobre ausência de `security-constitution.md` nas Fases 7–9 | Elimina contradição entre o que o módulo declarava e o que o SKILL.md injetava |
| 94 | `modules/sprint-governance.md` | Nota de ambiente adicionada à Fase 0 | Fases 7–11 não funcionam em chat sem workspace — usuário precisa saber antes de iniciar |
| 95 | `modules/sprint-governance.md` | Nota de segurança adicionada à Fase 9 | Orienta quando carregar `security-constitution.md` mesmo nas Fases 7–9 |
| 96 | `modules/sprint-governance.md` | Aviso de módulo de segurança adicionado ao início da Fase 10 | Agente sabe que precisa do módulo antes de gerar o workflow |
| 97 | `modules/sprint-governance.md` | Seções renumeradas localmente a partir de 1 | Numeração local do módulo |
| 98 | `modules/maturity-gaps.md` | Roadmap v4.0 atualizado de "proposto" para "executado" | Reflete a realidade — a modularização foi concluída |
| 99 | `modules/maturity-gaps.md` | Diff v3.9 → v4.0 adicionado (esta tabela) | Registro histórico completo das mudanças estruturais |

---

## 3.1 Diff v4.0 → v4.0.1 (Auditoria de Consistência)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 100 | `SKILL.md` | Paths corrigidos para `resources/master-spec-core.md` e `resources/modules/...` | Estrutura real da skill usa `resources/`; paths antigos quebravam o carregamento dos módulos |
| 101 | `modules/security-constitution.md` | RTO corrigido de "Recovery Target Objective" para "Recovery Time Objective" | Erro factual de nomenclatura |
| 102 | `master-spec-core.md` | MODO MVP: Fase 6 não exige `handoff.md` (Fase 5 é pulada); `constitution-lite.md` equivale a `constitution.md` | MVP pulava a Fase 5 mas o gate da Fase 6 exigia `handoff.md`, e regras exigiam `constitution.md` que o MVP não gera — fluxo travava |
| 103 | `master-spec-core.md` + `.agents/rules/00-core.md` | Exceção MVP adicionada ao protocolo de leitura obrigatória | Mesma contradição do item 102 nos arquivos de regras |
| 104 | `master-spec-core.md` | Default de branching (Seção 2) alinhado com a Fase 5: main + develop + feature/* + hotfix/* | Tabela de defaults omitia `develop`, contradizendo a estratégia obrigatória da Fase 5 |
| 105 | `master-spec-core.md` | MODO EXPRESSO: removida contagem "7 fases" | Contagem não fechava com as fases realmente executadas |
| 106 | `.agents/rules/00-core.md` | Glob do roteamento para `20-migrations.md` inclui `**/*.sql` | Alinhamento com o padrão declarado no próprio `20-migrations.md` |
| 107 | `modules/sprint-governance.md` + `.agents/rules/10-sprint-tdd.md` | Memory Sync (Step 10c) atualiza `## Estado atual do projeto` (nome exato da seção); rule não manda mais tocar `## Checkpoint Atual` | Nome da seção divergia do template do CLAUDE.md; checkpoint é atualizado só pelo comando "checkpoint" |
| 108 | `modules/sprint-governance.md` | Layout do CLAUDE.md: adicionados `supabase/migrations/` (UP), `rules/`, `quick-fix.md`; `db/migrations/` descrito como DOWN pareado | Diagrama omitia artefatos citados nas regras (zona somente leitura, pareamento de migrations) |
| 109 | `modules/sprint-governance.md` | Template CLAUDE.md (Fase 6): esclarecido que os módulos vêm da skill `novo-projeto`, não do repositório do projeto | Referências relativas a `modules/...` não resolvem na raiz do projeto |
| 110 | `modules/sprint-governance.md` | Mensagens do `sync-rules.sh` e do pre-commit corrigidas: o detector monitora os arquivos de regras, não os módulos-fonte | Mensagens diziam o inverso do que o script faz |
| 111 | `modules/sprint-governance.md` | `ci-gates.sh` Gate 2: tolerante a migration sem prefixo numérico (não aborta via `set -e`) e resultado isolado em `GATE2_FAIL` | Bugs reais: script abortava silenciosamente e pulava o Gate 3 quando o Gate 1 falhava |
| 112 | `modules/sprint-governance.md` + `master-spec-core.md` + `.agents/rules/00-core.md` | Fase 0 movida de "fora do Antigravity" para dentro do workspace do projeto (Antigravity recomendado, Claude Code válido); agente salva `overview.md` diretamente e apenas formata — não entrevista | A regra "fora do Antigravity" era resquício da era do upload: com o bootstrap (`novo-projeto.ps1`), o workspace existe antes da Fase 0 — salvar direto elimina o passo manual onde erros de caminho aconteciam |

---

## 3.2 Diff v4.0.1 → v4.0.2 (Enforcement Mecânico + Aceite do Cliente)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 113 | `.agents/VERSION` (novo) + `novo-projeto.ps1` + `atualizar-projeto.ps1` (novo) + `atualizar-skill.ps1` (novo) | Versionamento do framework com sincronização automatizada: template → skill instalada no Claude Code e template → projetos existentes (preservando memory/ e workflows/, recalculando a baseline de deriva) | Existiam três cópias do framework sincronizadas à mão — a skill instalada ficou 3 semanas desatualizada e quebrada sem ninguém perceber; o mesmo problema que o framework resolve para código não era resolvido para si mesmo |
| 114 | `modules/sprint-governance.md` (`ci-gates.sh`) | Gate 4: para cada TASK-NNN, o primeiro commit test\|feat no histórico deve ser test — feat sem red anterior bloqueia | TDD atômico era a regra menos enforçável do framework: BLOQUEADOR por instrução, sem prova mecânica; a ordem dos commits no git é verificável por script |
| 115 | `modules/sprint-governance.md` (`ci-gates.sh`) | Gate 5: `tsc --noEmit` como gate bloqueante (se `tsconfig.json` existe) | `check-imports.js` pega pacote inventado, mas não método/tipo inventado dentro de pacote real — tsc verifica contra as tipagens instaladas |
| 116 | `modules/sprint-governance.md` (Fase 7) | Hook `commit-msg`: bloqueia `feat`/`test` sem escopo `(TASK-NNN)` e `refactor` sem `(TASK-NNN\|MAINT)`; avisa `feat` sem trailer REQ | Rastreabilidade reversa só funciona se todo commit segue a convenção — e commit fora do padrão no histórico não é corrigível sem rewrite |
| 117 | `modules/sprint-governance.md` (Fase 11) | Item 6: revisão do threat model contra as mudanças da sprint (integração, rota pública, upload, perfil, schema sensível) — ameaça nova sem mitigação = BLOQUEADOR de deploy | O STRIDE era gerado uma vez na Fase 3 e nunca revisitado — uma feature nova podia invalidar mitigação antiga silenciosamente |
| 118 | `modules/sprint-governance.md` (Fase 11) | Protocolo de Aceite do Cliente: demo em staging, resultado registrado no changelog do `spec.md`, ajustes viram CR (nunca ad-hoc), release sem aceite registrado = BLOQUEADOR (exceções: MVP/uso interno/sprint técnica) | O maior risco PME não é bug — é construir a coisa errada com perfeição; o fluxo terminava em notificação, não em validação |
| 119 | `modules/security-constitution.md` (SAST+SCA) | Dependency pinning: lockfile obrigatório e commitado; CI instala com `npm ci`; dependência nova sem lockfile atualizado = BLOQUEADOR | Supply chain básico custa quase zero e estava relegado a gap opcional |
| 120 | `.agents/rules/00-core.md` + `10-sprint-tdd.md` + release checklist | Rules condensadas e checklist pré-deploy atualizados: Gates 1–5, lockfile, ordem TDD, threat model e aceite do cliente | Manter os arquivos de regras alinhados com os módulos-fonte (regra DRY do próprio framework) |

---

## 3.3 Diff v4.0.2 → v4.1.0 (Comercialização: Frota + E2E + Proposta + Auth/Sessão)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 121 | `modules/fleet-operations.md` (novo) + `E:\@Projetos\FROTA.md` (novo) | Módulo de operação pós-entrega: runbook de go-live, ciclo de manutenção mensal, tabela de frota, canais formais e contrato mínimo de manutenção | O framework cobria a entrega mas não a operação — com N clientes ativos, dependências envelhecendo e alertas sem protocolo eram o risco que mais escala para dev solo |
| 122 | `modules/sprint-governance.md` (Fase 7) | `renovate.json` padrão: patch automerge com CI verde, minor/major aguardam janela mensal | Manter N clientes atualizados manualmente não escala; o CI com Gates 1–5 + E2E torna o automerge de patch seguro |
| 123 | `modules/sprint-governance.md` (Fase 11) | Primeiro go-live exige runbook.md + registro na FROTA.md + contrato de manutenção acordado | Sistema em produção sem runbook = operação no improviso durante incidente |
| 124 | `modules/security-constitution.md` | Bloco TESTES E2E: fluxos de "não podem falhar" exigem smoke Playwright (3–7 testes) no CI e pré-deploy — bloqueante no PADRÃO; itens novos no DoD | Cobertura unit/integration não prova que o sistema montado funciona; checkout quebrado em produção é a falha mais cara de software comercializado |
| 125 | `modules/sprint-governance.md` (Fase Comercial, nova) | Discovery → modo provável → estimativa por pontos (régua 16 pts) → `proposta-[cliente].md` com exclusões explícitas; estouro de escopo nas Fases 1–5 = renegociação, nunca absorção | O framework começava com projeto já aprovado; precificar antes das Fases 1–5 era improviso sem protocolo |
| 126 | `modules/security-constitution.md` | Bloco AUTENTICAÇÃO E SESSÃO: política de senha NIST, lockout, 2FA admin (PADRÃO), cookies/expiração de sessão, reset seguro | Strict_rules cobriam princípios de segurança mas não o checklist concreto de auth — a área mais atacada de qualquer sistema |
| 127 | `modules/security-constitution.md` + `master-spec-core.md` (Fases 4.0/4.1, Seção 2, CHECKPOINT itens 10–11) + `.agents/rules/00-core.md` | Identidade de Sessão como ESCOPO DEFAULT: shell mostra quem está logado (forma definida no ui-context.md), rotas `/account/profile` e `/account/security` obrigatórias na sprint do login; auditoria da Fase 6 bloqueia spec sem isso | Gap real observado em campo: IA nunca gera "quem está logado" nem telas de conta espontaneamente — o usuário tinha que instruir toda vez, em todo sistema |
| 128 | `SKILL.md` + `modules/architecture-governance.md` | Mapa de carregamento com fleet-operations e Fase Comercial; mapa de artefatos com proposta, renovate.json, runbook.md e e2e/ | Artefato sem entrada no mapa é invisível para os agentes |

---

## 3.4 Diff v4.1.0 → v4.1.1 (DAST Contínuo + Métricas do Processo)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 129 | `modules/security-constitution.md` | Bloco DAST E PENTEST: pirâmide de segurança em camadas explícita (commit → PR → staging → go-live); ZAP baseline semanal + pré-deploy bloqueante (PADRÃO); protocolo de pentest por marco (pré go-live com dados sensíveis/pagamento, pós-CR Tipo D em auth/tenancy, anual na frota); findings viram CR | Segurança dinâmica não existia e o pentest não tinha protocolo de "quando" — o medo de "só descobrir no fim" se resolve tornando cada camada contínua e agendada, não deixando para o final |
| 130 | `modules/sprint-governance.md` (checklist pré-deploy) + tabela de modos do core + `modules/fleet-operations.md` | DAST no checklist pré-deploy; linha DAST na tabela de recursos por modo; pentest anual no ciclo da frota com registro no runbook e FROTA.md | Fechar o ciclo: regra → gate de deploy → operação recorrente |
| 131 | `master-spec-core.md` (Fase 6, plan.md) + `modules/sprint-governance.md` (Step 10.b) + `.agents/rules/10-sprint-tdd.md` | Seção `## Métricas do Processo` no plan.md, preenchida mecanicamente pelo memory-agent a cada sprint: lead time (git log), pts planejados vs entregues, retrabalho, falhas de gate, bugs pós-release, custo IA | Sem medir, impossível provar que o framework compensa; 3 sprints de dados transformam o valor-sprint da Fase Comercial de chute em número |

---

## 3.5 Diff v4.1.1 → v4.2.0 (AI Red Team — Pentest White-Box Guiado por IA)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 132 | `modules/ai-pentest.md` (novo) | Módulo AI Red Team: persona adversarial, 5 Regras de Engajamento (staging-only, não-destrutivo, autorização), reconhecimento white-box a partir dos próprios artefatos, metodologia A–I (auth, IDOR/tenant, RBAC, injeção, API, lógica, upload, disclosure, infra) mapeando cada invariante do constitution a um objetivo de ataque, template de relatório, roteamento de findings via Change Request | O framework declara cada invariante de segurança — isso permite um pentest white-box de IA que verifica adversarialmente as próprias promessas do sistema, algo que pentest às cegas não faz; era o gap "DAST + pentest" elevado a capacidade de primeira classe |
| 133 | `modules/ai-pentest.md` (Seção 5) + `modules/security-constitution.md` (bloco DAST E PENTEST) | Limites explícitos: AI pentest ≠ pentest certificado; humano permanece obrigatório para dados sensíveis/pagamento; nunca representar teste só-IA como pentest formal a cliente | Proteção jurídica e reputacional — vender "pentest" só-IA a cliente de saúde é exposição legal |
| 134 | `modules/sprint-governance.md` (Fase 10) + `.agents/rules/00-core.md` | Workflow `.agents/workflows/ai-pentest.md` (`/ai-pentest`) com gate de autorização; recomendação de rodar no Claude Code (esforço máximo) | Torna o pentest repetível e agendável (pré go-live + anual), não um esforço pontual |
| 135 | `SKILL.md` + `modules/architecture-governance.md` + `modules/fleet-operations.md` | Mapa de carregamento e de artefatos com ai-pentest.md e pentest-report; ciclo anual da frota usa o AI Red Team | Integração completa: artefato e módulo visíveis aos agentes; pentest entra na operação recorrente |

---

## 3.6 Diff v4.2.0 → v4.3.0 (MODO SENSÍVEL — Overlay de Alta Garantia)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 136 | `modules/high-assurance.md` (novo) | Overlay MODO SENSÍVEL sobre o PADRÃO: criptografia em nível de campo + classificação de dados, trilha de auditoria imutável (hash-chain), controle de acesso elevado (2FA universal, break-glass, recertificação), artefatos LGPD (RoPA/DPIA/direitos do titular), testes elevados (matriz de autorização automatizada, mutation testing, fuzzing, ASVS L2, pentest humano obrigatório), observabilidade de segurança, adições ao CHECKPOINT e ao DoD, limites jurídicos | Máxima segurança para dado sensível não é só testar mais — é trilha auditável + conformidade provável; a ANPD, o cliente e um processo são riscos além do atacante. É o teto de valor comercial (saúde/jurídico/financeiro pagam 3–5× mais) |
| 137 | `master-spec-core.md` (Seção 4, tabela de recursos, Fase 3, CHECKPOINT) | MODO SENSÍVEL formalizado como overlay: critério de ativação (LGPD Art. 5 II/11/14), ativação já na Fase 3, tabela de recursos adicional, item 12 do CHECKPOINT | Detecção do dado sensível precisa disparar os controles cedo (Fase 3), não na Fase 6 |
| 138 | `modules/security-constitution.md` + `ai-pentest.md` | Índice de carregamento aponta para high-assurance; AI Red Team elevado a ASVS L2 + matriz de autorização quando MODO SENSÍVEL | Pentest de dado sensível exige alvo mais alto que o PME comum |
| 139 | `modules/fleet-operations.md` + `.agents/rules/00-core.md` + `modules/architecture-governance.md` | Ciclo trimestral (recertificação, restore drill, revisão de trilha), incidente de dados Art. 48 no runbook, regra de trilha imutável no core, artefatos data-classification/ropa/dpia no mapa | MODO SENSÍVEL não termina no go-live — recertificação e resposta a incidente são recorrentes |
| 140 | Limites em `high-assurance.md` §10 | Explícito: framework prepara RoPA/DPIA/DPA, mas assinatura e responsabilidade legal são do DPO/advogado; ASVS L2 aproxima mas não certifica; overclaim de conformidade é risco legal maior que a vuln | Vender "conformidade total/certificado" só com IA a cliente de saúde é exposição legal grave |

---

## 3.7 Diff v4.3.0 → v4.3.1 (Enforcement por Ambiente)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 141 | `modules/security-constitution.md` (bloco ENFORCEMENT POR AMBIENTE) | Enforcement graduado por ambiente via perfil único (`APP_ENV`): dev/test relaxam (2FA/lockout/rate limit/e-mail) para não travar o desenvolvimento; staging espelha produção; lista "nunca relaxa" (tenant, injeção, secrets, criptografia de campo); relaxamento em config única, nunca `if(dev)` espalhado | O usuário apontou dor real: segurança rígida trava a fase de testes. O erro comum é relaxar com checks ad-hoc que vazam para prod — a solução é ambiente-aware com fonte única e trava mecânica |
| 142 | `modules/sprint-governance.md` (`ci-gates.sh`) | Gate 6: build falha se flag de bypass (AUTH_BYPASS/SKIP_2FA/DISABLE_RATE_LIMIT/SEED_LOGIN…) estiver ativa em `.env.production`/`.env.staging` | Torna mecânica a garantia de que o atalho de dev não escapa para produção — não depende de alguém lembrar |
| 143 | `master-spec-core.md` (Fase 5) + bloco AUTH + `high-assurance.md` + `ai-pentest.md` + `.agents/rules/00-core.md` + `10-sprint-tdd.md` | `config/security-profile.ts` na Fase 5; postura de produção vs dev no bloco AUTH; criptografia de campo e escrita da trilha permanecem ON em todo ambiente (só alertas/break-glass viram no-op em dev); pentest exige staging espelhando prod; core e rules atualizados; Gates 1–6 | Fechar o ciclo em todas as camadas: infra → constituição → alta garantia → pentest → gates → rules |

---

## 3.8 Diff v4.3.1 → v4.4.0 (Carga Inicial de Dados / Migração de Conteúdo)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 144 | `modules/sprint-governance.md` (Fase 10.5, nova) | Fase de Carga Inicial de Dados entre execução de sprint e go-live: descoberta (volume/formato/qualidade), artefatos (migration-plan, data-mapping, reconciliation-report), protocolo não-bypassável (dry-run em Neon/staging, idempotência, backup pré-carga, limpeza antes, gate de reconciliação mecânico, controles de dado sensível na própria carga, aceite do cliente antes do go-live) | Gap recorrente: todo sistema que substitui planilha/sistema legado precisa trazer os dados existentes — é o passo mais esquecido em estimativa e o que mais atrasa go-live; um sistema perfeito com banco vazio é inútil no dia 1 |
| 145 | `modules/security-constitution.md` (bloco CARGA INICIAL DE DADOS) | Strict_rule da carga: dry-run, idempotência, rollback, backup pré-carga, reconciliação mecânica, criptografia/trilha desde a migração, aceite do cliente; distinta de migration de schema | Torna a segurança da carga parte da lei máxima, não recomendação |
| 146 | `master-spec-core.md` (Fase 1 pergunta 9 + Fase Comercial) + `.agents/rules/20-migrations.md` | Pergunta de dado legado na Fase 1 e na estimativa comercial; distinção explícita schema-migration vs content-migration na rule 20 | Detectar cedo (afeta preço/prazo) e evitar confusão entre os dois tipos de "migração" |
| 147 | `modules/architecture-governance.md` + `SKILL.md` + Fase 11 go-live | Artefatos migration/* no mapa; entrada no mapa de carregamento; go-live bloqueado sem carga reconciliada quando há dado legado | Integração completa: artefatos visíveis e carga como pré-requisito de go-live |

---

## 3.9 Diff v4.4.0 → v4.5.0 (Skills Auxiliares do Claude Code)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 148 | `modules/architecture-governance.md` (Camada 5) | Tabela de Skills Auxiliares do Claude Code, distinguindo auto-ativadas (xlsx/pdf/docx) de slash commands (`/security-review`, `/code-review`, `/simplify`, `/verify`, `/run`, `/schedule`) e onde cada uma encaixa | Skills embutidas do Claude Code potencializam o fluxo, mas só no Claude Code (não no Antigravity); as slash não disparam sozinhas — o framework precisa mandar invocá-las |
| 149 | `modules/sprint-governance.md` (Fase 10.5, Step 7, Aceite, Fase Comercial) | Invocação explícita: `xlsx`/`pdf` na carga de dados, `/security-review` no Security Gate, `/run`+`/verify` no aceite, `docx` na proposta | Corrige a suposição de "aciona automático": os slash commands precisam de invocação explícita no step certo, senão o Claude faz a versão genérica |

---

## 3.10 Diff v4.5.0 → v4.6.0 (Skills Próprias do Framework)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 150 | `.agents/skills/proposta/SKILL.md` (nova) | Skill `/proposta`: encapsula a Fase Comercial (discovery + estimativa por pontos + geração de `proposta-[cliente].md` + `.docx`) invocável numa sessão do Claude Code antes do projeto existir | Transforma o protocolo da Fase Comercial em ação de um comando, em vez de depender de carregar a novo-projeto e navegar até a seção |
| 151 | `.agents/skills/carga-dados/SKILL.md` (nova) | Skill `/carga-dados`: encapsula a Fase 10.5 (fonte via xlsx/pdf → mapa → limpeza → import idempotente → reconciliação → aceite), com bloqueadores explícitos | Migração de dados usa as skills xlsx/pdf (só Claude Code) — vira comando dedicado; consistente com sprint-execution/quick-fix/ai-pentest terem workflow próprio |
| 152 | `atualizar-skill.ps1` | Reescrito para sincronizar TODAS as skills de `.agents/skills/*` (não só novo-projeto) para a instalação do Claude Code, sem tocar em skills de terceiros | À prova de futuro: qualquer skill nova do framework é instalada com um comando |
| 153 | `modules/architecture-governance.md` + `modules/sprint-governance.md` | Tabela "Skills do Próprio Framework" (proposta/carga-dados/novo-projeto) separada das built-in; pointers `/proposta` na Fase Comercial e `/carga-dados` na Fase 10.5 | Distinguir as skills que SÃO o framework das built-in auxiliares do Claude |

---

## 3.11 Diff v4.6.0 → v4.7.0 (Escotilha de Canal + Guia de Modelo)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 154 | `master-spec-core.md` (Seção 5 reescrita) | Escotilha de escape: Antigravity é o executor de sprint **default**, não exclusivo — Claude Code assume módulos críticos quando direcionado, com o mesmo workflow e gates. Modelo híbrido por criticidade (Claude Code = crítico, Antigravity = volume) | A regra lia como proibição, contradizendo o uso real; o split é escolha de custo/throughput, não limite técnico ou de qualidade |
| 155 | `master-spec-core.md` (Seção 5.2, nova) | Guia de Modelo por Tarefa: Opus (sintetizar/decidir/auditar/atacar — Fase 6, módulo crítico, Step 8, pentest, CR C/D), Sonnet (execução padrão, CR A/B), Haiku (mecânico), Gemini (volume no sandbox); IDs atuais; regra de bolso; modelos novos encaixam por camada de esforço após teste | Faltava orientação explícita de QUAL modelo usar em cada ponto — capacidade proporcional ao risco, custo proporcional à trivialidade |
| 156 | `.agents/rules/00-core.md` + `modules/sprint-governance.md` (tabela de papéis do CLAUDE.md) | Papel do Claude Code atualizado: executor por direção do usuário (não só desbloqueio), com TDD + gates; "Não faça" ajustado de "executar autonomamente" para "executar sem o usuário pedir / pulando gates" | Alinhar rules e CLAUDE.md com a escotilha; evitar contradição entre o que o framework diz e o que o usuário faz |

---

## 3.12 Diff v4.7.0 → v4.8.0 (Criticidade de Sprint → Canal/Modelo/Esforço)

| # | Arquivo | O que mudou | Por quê |
|---|---------|-------------|---------|
| 157 | `master-spec-core.md` (Seção 5.3, nova) | Tabela de criticidade de sprint: 🔴 Crítica (auth/RLS/financeiro/pagamento/sensível/carga de dados) → Claude Code + Opus + Alto; 🟡 Padrão → Sonnet/Gemini + Médio; 🟢 Volume (CRUD/UI/boilerplate) → Antigravity + Gemini + Baixo–Médio. Regra "mistura assume o mais alto"; modelo vale para o code-agent (mecânicos ficam Haiku); fundação sempre 🔴 | O guia 5.2 era por tarefa; faltava a decisão por sprint inteira — qual canal/modelo/esforço uma sprint pede dado seu conteúdo |
| 158 | `master-spec-core.md` (Fase 6 plan.md) + `modules/sprint-governance.md` (Fase 8) | Roadmap do plan.md registra a criticidade de cada sprint; Fase 8 apresenta a recomendação de canal/modelo ao selecionar a sprint e pede confirmação | Deixa a decisão de orquestração pronta no roadmap e explícita no momento de orquestrar — não improvisada |

---

## 4. Roadmap de Evolução — v5.0 e além

### Critérios de ativação para próxima versão major

Uma nova versão major deve ser criada quando qualquer um dos seguintes for verdadeiro:

- Um novo modo de operação for adicionado que justifique módulo próprio (ex: MODO ENTERPRISE)
- Um módulo existente ultrapassar 40KB ou 600 linhas
- Um novo paradigma de orquestração substituir o Antigravity como ferramenta padrão
- Feedback de campo revelar um gap sistêmico não coberto pelos 5 gaps atuais

### Evolução incremental (sem nova versão major)

Atualizações menores (patch) não requerem nova versão major:
- Novos defaults na tabela de Decisão Guiada (Seção 2 do core)
- Atualização de free tiers ou limites de ferramentas na stack
- Novo gap de maturidade adicionado ao módulo `maturity-gaps.md`
- Correção de inconsistência identificada em auditoria

Registrar toda atualização incrementalmente no Diff deste módulo (Seção 2 ou 3).
