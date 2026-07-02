# high-assurance.md
> **Módulo:** High-Assurance / MODO SENSÍVEL | **Versão:** 4.3
> **Carregado em:** Fase 3 (se dados sensíveis) | Fase 6 | Fases 10–11 | ciclo da frota
> **Depende de:** `master-spec-core.md` + `modules/security-constitution.md` + `modules/ai-pentest.md`
> **Papel:** Overlay sobre o MODO PADRÃO para sistemas que tratam dados sensíveis
> (saúde, jurídico, financeiro, biométrico, dados de menores). NÃO substitui o PADRÃO —
> soma controles. "Máxima segurança" aqui = testar mais + trilha auditável + conformidade
> provável. O atacante não é o único risco; a ANPD, o cliente e um processo também são.

---

## 1. Ativação — MODO SENSÍVEL

Ativa automaticamente, sobre o MODO PADRÃO, se QUALQUER condição for verdadeira:
- Dados de saúde (prontuário, exame, diagnóstico) — LGPD Art. 11 (dado sensível)
- Dados jurídicos sob sigilo profissional
- Dados financeiros que processam pagamento/cartão (PCI-DSS) ou dados bancários
- Dados biométricos, genéticos, de orientação sexual, religião, filiação (LGPD Art. 5, II)
- Dados de crianças e adolescentes (LGPD Art. 14)

> Em dúvida sobre a natureza do dado → assuma MODO SENSÍVEL. O custo de sobreproteger
> um dado comum é baixo; o de subproteger um dado sensível é multa da ANPD + reputação.

> ⚠️ O framework fornece controles técnicos. **DPO, parecer jurídico e assinatura de
> DPIA são responsabilidade humana** — o módulo prepara os artefatos, não substitui o
> advogado/encarregado. Deixe isso explícito no contrato com o cliente.

---

## 2. Proteção de Dados (além do at-rest/in-transit do PADRÃO)

- **Classificação de dados:** todo campo que armazena dado sensível é marcado no schema
  (comentário ou convenção de nome) e listado em `docs/data-classification.md`. Nenhum
  dado sensível existe fora dessa lista — o que não está classificado não pode ser sensível.
- **Criptografia em nível de campo:** dados sensíveis (não só o disco) são cifrados na
  aplicação antes de persistir (envelope encryption; chave no secrets manager, nunca no
  banco). Disco cifrado protege contra roubo físico; field-level protege contra dump de
  banco e acesso indevido de DBA. Ambos obrigatórios.
  > A criptografia de campo permanece LIGADA em todo ambiente (dev usa uma chave de dev) —
  > é da lista "nunca relaxa" do bloco ENFORCEMENT POR AMBIENTE. Desligar no dev significa
  > nunca exercitar o caminho cifrado e descobrir o bug só em produção.
- **Minimização:** colete o mínimo necessário para a finalidade declarada. Campo sensível
  sem finalidade registrada no RoPA = BLOQUEADOR de schema.
- **Retenção e expurgo:** toda categoria de dado sensível tem prazo de retenção definido;
  job automatizado de expurgo/anonimização após o prazo. Sem política de retenção = spec
  incompleta.
- **Mascaramento:** dado sensível exibido na UI e em relatórios é mascarado por padrão
  (CPF `***.***.**9-00`), com revelação sob ação explícita e logada.

---

## 3. Trilha de Auditoria Imutável (o controle mais importante)

> LGPD Art. 37 (registro das operações). Para saúde/jurídico/financeiro, saber QUEM
> acessou ou alterou QUAL registro sensível e QUANDO é inegociável — é a diferença entre
> "temos como provar" e "não temos defesa".

- **Append-only, à prova de adulteração:** toda leitura e escrita de dado sensível gera
  entrada de auditoria. Encadeamento por hash (cada entrada inclui o hash da anterior),
  de modo que remoção/edição retroativa seja detectável.
- **Conteúdo mínimo por entrada:** ator (user_id + role + tenant_id), ação, recurso
  (tipo + id), timestamp, IP/origem, resultado. NUNCA o dado sensível em si — referência,
  não conteúdo (senão a trilha vira novo vazamento).
- **Imutável para a aplicação:** a app escreve, nunca edita/deleta a trilha. Idealmente
  storage separado (append-only bucket, tabela com RLS que nega UPDATE/DELETE, ou serviço
  dedicado).
  > A gravação da trilha permanece LIGADA em todo ambiente; apenas os ALERTAS de anomalia
  > e o break-glass viram no-op em dev/test (via perfil de ambiente). Você testa a escrita
  > da trilha sempre, mas não é acordado por alertas a cada teste local.
- **Retenção da trilha** ≥ exigência legal do setor (defina na Fase 3, registre no
  `constitution.md`).

---

## 4. Controle de Acesso Elevado

- **2FA obrigatório para TODOS os usuários** (não só admin) que acessam dado sensível.
- **Recertificação de acesso:** revisão periódica (trimestral) de quem tem acesso a quê;
  registro no ciclo da frota. Acesso não recertificado é revogado.
- **Break-glass:** acesso de emergência exige justificativa obrigatória + alerta imediato
  ao responsável + entrada destacada na trilha. Acesso emergencial silencioso = proibido.
- **Menor privilégio real:** RBAC do PADRÃO + verificação de que nenhum perfil tem acesso
  além do estritamente necessário à finalidade (revalidado no pentest).

---

## 5. Conformidade LGPD — Artefatos (preparados pela IA, assinados por humano)

| Artefato | Base legal | Localização | Quem assina |
|----------|-----------|-------------|-------------|
| `docs/compliance/ropa.md` — Registro de Operações de Tratamento | LGPD Art. 37 | `/docs/compliance/` | Encarregado/DPO |
| `docs/compliance/dpia.md` — Relatório de Impacto (RIPD) | LGPD Art. 38 | `/docs/compliance/` | DPO + jurídico |
| `docs/compliance/data-subject-rights.md` — fluxos Art. 18 | LGPD Art. 18 | `/docs/compliance/` | — |
| `docs/data-classification.md` — inventário de dados sensíveis | Art. 37 | `/docs/` | — |
| DPA — Contrato de Operador de Dados | Art. 39 | contrato | advogado |

**Direitos do titular (Art. 18) como fluxos de primeira classe no `spec.md`:**
- Exportação (portabilidade): titular baixa todos os seus dados em formato legível
- Exclusão/anonimização: prazo de execução documentado; respeitando retenção legal
- Correção e revogação de consentimento
- Registro de consentimento: finalidade, data, versão do termo — auditável

**Resposta a incidente de dados (Art. 48):** plano específico no runbook — detecção,
contenção, avaliação de risco ao titular, notificação à ANPD e aos titulares no prazo
legal. Ensaiado, não improvisado.

---

## 6. Testes Elevados (o "máximo possível" técnico)

Somam-se aos testes do PADRÃO (unit/integration 80%, E2E, SAST/SCA/DAST, Gates 1–5):

| Teste | O que prova | Obrigatório |
|-------|-------------|:---:|
| **Matriz de autorização automatizada** | Suite permanente: cada perfil × cada recurso sensível → allow/deny esperado. Não é só pentest pontual — é regressão contínua no CI | ✅ |
| **Mutation testing** (Stryker) nos módulos sensíveis | Que os testes REALMENTE pegam bugs — cobertura 80% pode ser 80% de asserts fracos. Meta: ≥ 70% mutation score nos módulos de auth/dados sensíveis | ✅ |
| **Fuzzing de inputs** dos endpoints sensíveis | Entradas malformadas/limítrofes não quebram nem vazam | ✅ |
| **AI Red Team com alvo ASVS Level 2** | Pentest white-box (`ai-pentest.md`) elevado de L1 para L2 | ✅ |
| **Pentest humano** | Antes do go-live e anual — aqui é OBRIGATÓRIO, não recomendado | ✅ |
| **Teste de restore de backup** | Backup cifrado restaura de fato — ensaio trimestral | ✅ |

> A matriz de autorização e o mutation testing são os dois que mais elevam a garantia
> real: a primeira transforma "confiamos que o RBAC segura" em teste que falha o build se
> quebrar; o segundo fecha a fraqueza conhecida de que cobertura ≠ qualidade de teste.

---

## 7. Observabilidade de Segurança

- **Alerta de anomalia** sobre a trilha de auditoria: acesso em massa a registros
  sensíveis, acesso fora de horário, escalada de privilégio, muitos 403 seguidos.
- **Alertas de segurança** (não só de erro) roteados para canal dedicado com resposta
  definida no runbook.
- Retenção de logs de segurança ≥ exigência do setor.

---

## 8. Adições ao CHECKPOINT da Fase 6 (MODO SENSÍVEL)

Além do checklist padrão, o CHECKPOINT bloqueia se:
- [ ] Existe dado sensível sem entrada em `data-classification.md` e sem finalidade no RoPA
- [ ] Algum campo sensível não tem criptografia de campo definida
- [ ] Alguma categoria de dado sensível não tem prazo de retenção + expurgo
- [ ] A trilha de auditoria imutável não está especificada para todo acesso a dado sensível
- [ ] Os fluxos do Art. 18 (exportar/excluir/corrigir/consentir) não têm task vinculada
- [ ] Não há plano de resposta a incidente de dados (Art. 48) no runbook
- [ ] O RoPA e o DPIA não estão gerados para revisão do DPO/jurídico

---

## 9. Adições ao DoD (MODO SENSÍVEL)

- Dado sensível criptografado em nível de campo, nunca em log/resposta (verificado)
- Todo acesso a dado sensível gera entrada na trilha imutável (verificado)
- Matriz de autorização passa 100% no CI
- Mutation score ≥ 70% nos módulos de auth e dados sensíveis
- Mascaramento aplicado na UI e relatórios
- Direitos do titular funcionais e testados (export/exclusão)

---

## 10. Limites — a honestidade que protege seu CNPJ

- **Conformidade não é só técnica.** RoPA e DPIA precisam de revisão de um Encarregado/DPO;
  o DPA precisa de advogado. O framework entrega os artefatos prontos para revisão — não
  a assinatura nem a responsabilidade legal.
- **Certificação formal** (ISO 27001, SOC 2 Type II, HIPAA compliance atestada) exige
  auditor externo e evidências operacionais ao longo do tempo — está fora do que a IA
  entrega. O framework aproxima do alvo (ASVS L2), não certifica.
- **Represente com precisão ao cliente:** "aplicamos controles alinhados à LGPD e ASVS
  Level 2, com pentest humano" — nunca "somos certificados/em conformidade total" sem o
  parecer do DPO e, quando aplicável, do auditor. Overclaim de conformidade é risco legal
  maior que a vulnerabilidade que você tentava evitar.
