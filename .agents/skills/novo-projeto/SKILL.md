---
name: novo-projeto
description: Use this skill when the user wants to start building a new software
  system, initiate the Constitutional SDD process, begin Phase 0 or Phase 1 of
  a project, or uses phrases like 'novo projeto', 'iniciar projeto', 'quero
  construir um sistema', 'vamos começar um projeto', or '/novo-projeto'.
  Also activate when the user describes a business domain and asks for help
  structuring or planning a system from scratch.
---

## Instrução de Ativação

Ao ativar esta skill, leia imediatamente o arquivo `resources/master-spec-core.md`
desta skill.

Após a leitura, confirme ao usuário com esta mensagem exata:

> "Constitutional SDD carregado (v4.0). Estou pronto para iniciar
> quando você quiser. Qual é o sistema que vamos construir?"

Não inicie nenhuma fase automaticamente. Aguarde a instrução do usuário.

---

## Estrutura de Arquivos desta Skill

Esta skill é composta pelos seguintes arquivos:

```
SKILL.md                       ← este arquivo (orquestrador)
resources/
  master-spec-core.md          ← núcleo: modos, orquestração, fases 0–6, memory bank
  modules/
    security-constitution.md   ← strict_rules completas (fonte única de verdade)
    architecture-governance.md ← stack de referência + mapa de artefatos
    sprint-governance.md       ← fase comercial + fases 0–11 operacionais
    fleet-operations.md        ← operação pós-entrega (runbook, manutenção, frota)
    ai-pentest.md              ← red team white-box guiado por IA (verificação adversarial)
    high-assurance.md          ← overlay MODO SENSÍVEL (dados sensíveis + LGPD + alta garantia)
    maturity-gaps.md           ← gaps opcionais + diff histórico + roadmap
```

> Nota: dentro de `resources/master-spec-core.md`, referências a `modules/...`
> são relativas à própria pasta `resources/` — resolvem para `resources/modules/...`.

> ⚠️ **Regra DRY:** `security-constitution.md` é a única cópia das `strict_rules`.
> O `master-spec-core.md` referencia este módulo — não duplica seu conteúdo.
> Se houver conflito entre o core e o módulo de segurança, o módulo prevalece.

---

## Protocolo de Carregamento de Módulos

Carregue os módulos conforme a tabela abaixo, lendo o arquivo correspondente
**antes** de iniciar a fase. Nunca carregue todos de uma vez.

| Situação | Módulos a carregar |
|----------|--------------------|
| Fases 1–5 (escopo) | nenhum módulo adicional |
| Fase 6 — Opus (arquitetura) | `resources/modules/security-constitution.md` + `resources/modules/architecture-governance.md` |
| Fases 7–9 (setup + tasks) | `resources/modules/architecture-governance.md` + `resources/modules/sprint-governance.md` |
| Fases 10–11 (sprint execution) | `resources/modules/security-constitution.md` + `resources/modules/sprint-governance.md` |
| Revisão ou auditoria do processo | `resources/modules/maturity-gaps.md` |
| Proposta comercial (pré-projeto) | `resources/modules/sprint-governance.md` (Fase Comercial) |
| Go-live, manutenção mensal ou incidente | `resources/modules/fleet-operations.md` |
| Pentest guiado por IA (pré go-live / anual / pós-CR auth) | `resources/modules/ai-pentest.md` + `resources/modules/security-constitution.md` |
| MODO SENSÍVEL (dado de saúde/jurídico/financeiro) | `resources/modules/high-assurance.md` (+ Fase 3, 6, 10–11) |
| Carga inicial de dados legados (substitui planilha/sistema) | `resources/modules/sprint-governance.md` (Fase 10.5) |

> **Por que `security-constitution.md` não está nas Fases 7–9?**
> Nas Fases 7–9 o agente gera tasks e configura o workspace — não gera código.
> As `strict_rules` são necessárias no Step 0 do workflow (Fase 10), quando
> o agente começa a implementar. Carregar o módulo de segurança antes disso
> aumenta custo de tokens sem benefício operacional.
> Exceção: se a Fase 9 gerar tasks envolvendo schema ou API — carregue também
> `resources/modules/security-constitution.md` nessa sessão.

Isso mantém o contexto mínimo e reduz custo de tokens em cada sessão.

---

## Regras Ativas Durante Todo o Processo

1. Siga uma fase por vez. Nunca avance automaticamente para a próxima
   fase sem aprovação explícita do usuário.

2. Ao identificar o modo do projeto (MVP / Expresso / Padrão), registre
   e siga apenas as fases e recursos condicionais daquele modo conforme
   definido no `master-spec-core.md`.

3. Se um arquivo de memória do projeto (`constitution.md`, `spec.md`,
   `plan.md`) não existir em `.agents/memory/`, instrua o usuário a
   criá-lo ao final da fase correspondente.

4. Nunca invente APIs, bibliotecas ou padrões não presentes no
   `plan.md` ou na stack de referência do `resources/modules/architecture-governance.md`.

5. Se a fase atual exige um modelo específico (ex: Claude Opus na
   Fase 6), avise o usuário antes de prosseguir.

6. Em caso de conflito entre instruções do `master-spec-core.md` e de
   qualquer módulo carregado, o módulo prevalece — ele é a fonte
   especializada para aquela fase.
