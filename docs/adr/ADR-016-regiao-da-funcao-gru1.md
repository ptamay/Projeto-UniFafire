# ADR-016 — A função executa em `gru1`, não em `iad1`

- **Status:** Proposto — aguarda a implementação pelo ciclo TDD
- **Data:** 2026-09-08
- **Tipo de Change Request:** C (mudança em feature já implementada)
- **Relacionado:** ADR-012 (topologia de deploy), REQ-032, REQ-031
- **Origem:** medição do REQ-032 em 2026-09-07

## Contexto

O REQ-032 exige defasagem típica **≤ 500 ms** entre a confirmação de uma operação
e a atualização na tela de outro dispositivo. A medição de 2026-09-07 mostrou que
ele **não está sendo cumprido**, e a causa não é a que se esperava.

### O que foi medido

Em produção, sem escrever nada:

| Perna | O que é | Medida |
|---|---|---|
| A | commit no Postgres → serviço Realtime | não medida |
| B | serviço Realtime → navegador | **64 ms** |
| C | sinal → dado novo em mãos | **335 ms por rota** |

O dashboard de PORTEIRO/ADMIN — quem opera o balcão — somava **~734 ms
observáveis** contra 500 ms de orçamento, com a perna A ainda por cima. Uma das
duas causas (duas buscas em série) foi corrigida na TASK-091. **Sobra esta, que é
a maior.**

### A causa

O cabeçalho de resposta diz onde tudo acontece:

```
X-Vercel-Id: gru1::iad1::slxhh-…
```

A requisição **entra** na borda de São Paulo (`gru1`) e a função **executa em
Washington** (`iad1`). O banco está em **`sa-east-1` — São Paulo**. Cada consulta
atravessa as Américas duas vezes para voltar a poucos quilômetros de onde saiu.

A atribuição não é inferência. Duas rotas, mesmas condições, mesma sessão TCP:

| rota | toca o banco | mediana | mínimo |
|---|---|---|---|
| `/login` | não | 86 ms | 82 ms |
| `/api/health` (`SELECT 1`) | sim | 335 ms | 331 ms |
| **diferença** | | **249 ms** | **249 ms** |

**Idêntica na mediana e no mínimo.** Um custo que não varia com a carga é
distância, não trabalho — `SELECT 1` numa conexão já aberta do pooler não custa
nada perto disso.

### Por que está assim

Não há `vercel.json` no repositório, e a região nunca foi escolhida. `iad1` é o
padrão da plataforma para todo projeto novo, e ele existe porque a maioria das
fontes de dados externas está na costa leste dos EUA. Não é o nosso caso: este
sistema tem os usuários e o banco na mesma cidade.

Isto não é regressão de nada. É uma decisão que **nunca foi tomada** — e o padrão
decidiu por nós.

## Decisão

**A função passa a executar em `gru1` (São Paulo).** A região é fixada em
`vercel.json`, versionada, e não apenas no painel:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["gru1"]
}
```

**Em arquivo e não no painel** porque configuração que só existe no painel é
invisível para quem lê o repositório, não aparece em revisão de PR e some se o
projeto for recriado. Foi exatamente assim que a região errada passou dois meses
sem ninguém notar.

### O plano gratuito permite

Verificado na documentação da Vercel em 2026-09-07, e é o ponto que destravou
este CR: o limite do plano Hobby é o **número** de regiões, não a escolha.

| Plano | Regiões de função |
|---|---|
| **Hobby** | **uma** |
| Pro | 5 |
| Enterprise | todas |

`gru1` é exatamente `sa-east-1`, a mesma região AWS do projeto Supabase, e
**nenhuma região é restrita a plano pago**. Usamos uma região só — cabe.

## Alternativas consideradas

**Mover o banco para `us-east-1`, perto da função.** Igualaria a distância entre
função e banco, e afastaria as duas dos usuários, que estão todos em Recife. Pior
nos dois eixos, e exigiria migrar o projeto Supabase inteiro. Rejeitada.

**Reduzir o número de consultas por refetch.** Já feito onde havia o que fazer
(TASK-091). O `GET /api/keys` faz **uma** consulta: não há o que cortar. Enquanto
cada ida custar 249 ms, otimizar a consulta é otimizar a parte que não é o
problema.

**Cache na borda.** O dado é estado de chave em tempo quase real e toda rota exige
sessão. Cachear seria trocar defasagem por defasagem, com risco de servir o estado
de uma sessão a outra. Rejeitada — e é o oposto do REQ-032.

**Aceitar e emendar o REQ-032 para um número maior.** É uma saída honesta se o
custo fosse alto. Não é: são três linhas de configuração, e a alternativa seria
afrouxar o requisito que motivou a migração inteira para a nuvem.

## Consequências

**Positivas**
- ~249 ms a menos **por ida ao banco**, em toda rota e em todo Server Component —
  não só no caminho do REQ-032. A aplicação inteira fica mais rápida.
- Some também a viagem do navegador até `iad1`: `/login`, que não toca o banco,
  deve cair dos 86 ms medidos para a casa das dezenas.
- Projeção para o caminho do REQ-032: **~150 ms** contra os ~734 ms de hoje.
  **Projeção, não medida** — o número real sai da verificação da task.

**Negativas / riscos**
- `gru1` fica na ponta cara do preço regional da Vercel. Irrelevante aqui: é
  cobrança **acima** da franquia (1 TB de transferência, 10 M de edge requests), o
  Hobby não cobra excedente — ele para —, e uma portaria com ~10 usuários não
  chega perto.
- Uma região só significa nenhuma redundância regional. **Já é o caso hoje**, e
  failover entre regiões é recurso Enterprise. Nada piora.
- O `proxy.ts` é Routing Middleware e continua rodando na borda, independentemente
  desta configuração. Não é afetado — e não toca o banco.

## Implementação

- **TASK-092** — fixar `regions: ["gru1"]` em `vercel.json`, com teste que reprove
  a ausência ou a alteração silenciosa da região, e **medir de novo** com
  `scripts/medir-req032.mjs` depois do deploy.

O critério de aceite desta task **não é o arquivo existir**: é o número cair. A
verificação tem de repetir a medição de 2026-09-07 e registrar o resultado no
`plan.md`, ao lado do antigo. Se a diferença de 249 ms não desaparecer, a
hipótese estava errada e o ADR precisa ser revisto — não o número, escondido.

> Continua fora deste ADR, e sem número: a perna A (commit → Realtime) e a
> defasagem total de ponta a ponta, que só a primeira operação real fecha.
> `scripts/medir-req032.mjs --operacao` existe para isso.
