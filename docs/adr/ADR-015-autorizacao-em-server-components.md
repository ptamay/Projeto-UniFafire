# ADR-015 — Server Components consultam o banco sem verificar papel

- **Status:** Aceito
- **Data:** 2026-09-06 · **emendado no mesmo dia** (decisão 1: `/history` escopa em vez de bloquear)
- **Tipo de Change Request:** C (mudança em feature já implementada)
- **Relacionado:** constitution §3.2, ADR-014, REQ-005, REQ-010
- **Origem:** varredura lateral de migrations, workflows e telas, pedida após o ADR-014

## Contexto

O ADR-014 corrigiu duas rotas de API que validavam sessão e não papel. A varredura
seguinte aplicou o mesmo método às **páginas** — e encontrou a mesma falha num
lugar que a camada de API não protege.

As páginas são Server Components. Elas **consultam o banco diretamente**, com o
mesmo pool da aplicação, e entregam o resultado ao navegador. Quando uma página
verifica só a sessão, **não há 403 possível**: não existe rota no caminho.

| Página | Verifica sessão | Verifica papel | Consulta no servidor |
|---|---|---|---|
| `/logs` | ✅ | ✅ | — |
| `/settings` | ✅ | ✅ | — |
| `/users` | ✅ | ✅ | — |
| `/history` | ✅ | ❌ | **histórico completo** |
| `/keys` | ✅ | ❌ | **inventário completo** |
| `/` (dashboard) | ✅ | ❌ | chaves + **lista de usuários** |
| `/confirm` | ✅ | ❌ | — (a API escopa por papel) ✅ |
| `/account/*` | ✅ | n/a | próprio cadastro ✅ |

Três páginas expõem dados de terceiros a qualquer usuário autenticado.

### O que cada uma entrega hoje a um ALUNO

**`/history`** — o histórico completo de movimentação: quem retirou qual chave,
quando, quando devolveu, com nome e username. O `userId` de
`buildHistoryQuery` é **filtro de busca vindo da query string**, não escopo.

**`/keys`** — o inventário completo com estado e portador atual.

**`/`** — além das chaves, a **lista de todos os funcionários e alunos ativos**
(`id`, `username`, `full_name`, `role`). A consulta existe para a Ação Rápida do
porteiro ("para quem?"), e vai para o navegador de todo mundo.

### Por que o menu não protege

O `Sidebar` declara `roles: ['ADMIN','GESTOR','PORTEIRO']` para Histórico e Chaves
e esconde os links dos demais. **Isso é navegação, não autorização** — basta
digitar o endereço. É a mesma confusão do achado 1 do ADR-014, onde o consumidor
chamava a rota dentro de `if (isPorteiroOrAdmin)`.

A constitution §3.2 fala em "rota de API", e é razoável ler que a regra se dirige
a handlers. **A intenção é maior que a letra:** o que ela protege é a fronteira
entre quem pede e o dado. No App Router essa fronteira também é o Server
Component — e ali, hoje, ela não existe.

### Por que isto é mais grave que os achados do ADR-014

Naqueles, o dado saía por uma rota, e a correção foi acrescentar a checagem que as
rotas irmãs já tinham. Aqui o dado sai **direto do Server Component**, contornando
toda a camada de API onde as checagens vivem. Nenhum teste de rota alcançaria.

## Decisão

**1. Toda página que consulta dados de terceiros verifica papel no servidor.** O
que ela faz com o resultado depende de haver ou não uso legítimo para o papel
menor:

- **`/keys` bloqueia.** Não há leitura legítima do inventário alheio por
  FUNCIONARIO ou ALUNO — as chaves que importam a eles aparecem no dashboard.
  Redireciona, como `/logs`, `/settings` e `/users` já fazem.

- **`/history` ESCOPA.** *(Emenda de 2026-09-06, por decisão do usuário.)* "Quando
  peguei a chave da sala 12 e quando devolvi" é dado do próprio usuário, e negá-lo
  seria proteger a pessoa dela mesma. ADMIN, GESTOR e PORTEIRO veem tudo; os
  demais veem **apenas as próprias movimentações**.

  ⚠️ **E o escopo não pode ser um padrão — tem de ser um teto.** `buildHistoryQuery`
  já aceita `userId` como filtro **vindo da query string**. Se a restrição for
  aplicada como valor default desse mesmo campo, um FUNCIONARIO passa
  `?userId=outro` e lê o histórico alheio — trocaríamos uma exposição por outra,
  mais difícil de enxergar. A restrição entra como parâmetro separado, imposto
  pelo servidor, que **sobrescreve** o filtro da URL em vez de preenchê-lo.

**2. O dashboard escopa o que entrega, em vez de bloquear.** Ele é legitimamente
para todos os papéis: FUNCIONARIO e ALUNO precisam ver as próprias chaves. O que
não podem receber é a lista de usuários — que serve à Ação Rápida do balcão. A
consulta passa a ser condicional ao papel, e a lista só é montada para quem opera
o balcão.

**3. Uma guarda varre todas as `page.tsx`** e reprova página que consulta o banco
sem verificar papel, com exceções em lista. É o análogo da guarda do ADR-014 para
rotas, e existe pela mesma razão: sem ela, a próxima página nasce igual.

## Alternativas consideradas

**Mover as consultas para rotas de API.** Resolveria por tabela-rasa e jogaria
fora a vantagem que motivou o App Router — renderizar no servidor sem viagem extra.
Rejeitada: o problema não é consultar no Server Component, é não verificar quem
está perguntando.

**Bloquear o dashboard para papéis baixos.** Rejeitada: quebraria o uso principal
de FUNCIONARIO e ALUNO para proteger um pedaço da carga. Escopar o que se entrega
é a resposta certa, como foi na TASK-087.

**Confiar no `Sidebar`.** É o estado atual, e é o que a §3.2 nomeia.

## Consequências

**Positivas**
- Fecha três exposições de dados pessoais, uma delas na tela mais visitada.
- A guarda passa a cobrir a fronteira que a do ADR-014 não alcançava.

**Negativas / riscos**
- Um ALUNO que hoje consegue abrir `/history` passará a ser redirecionado. Não é
  regressão: o menu já não oferecia o link, e ver aquilo nunca foi função dele.
- O dashboard de papéis baixos deixa de receber a lista de usuários. A Ação Rápida
  não existe nesses perfis, então nada na tela deles usa a lista.

## O padrão, e por que ele se repete

Três achados em duas horas, todos com a mesma forma: **a sessão é verificada, o
papel não, e a interface esconde o que o servidor não protege.** Nenhum tinha
sintoma — a tela certa nunca pediu o que não devia, então nada quebrou.

A defesa não é lembrar melhor. É a varredura: comparar irmãos lado a lado, e
transformar a comparação em teste. Foi assim que os três apareceram, e é por isso
que a decisão 3 vale mais que as duas primeiras.

## Implementação

- **TASK-088** — `/keys` bloqueia; `/history` escopa ao próprio usuário, com a
  restrição imposta pelo servidor e não sobrescrevível pela query string
- **TASK-089** — o dashboard escopa a lista de usuários ao papel que a usa
- **TASK-090** — guarda que varre as `page.tsx`

> Fora deste ADR, e registrado na varredura: (a) não há `ALTER DEFAULT PRIVILEGES`
> nem teste garantindo que **toda tabela** nasça com RLS e sem grant — produção
> está limpa hoje, mas depende de cada migration lembrar; (b) os workflows não
> declaram `permissions:`, então o `GITHUB_TOKEN` recebe o padrão do repositório.
> Os dois são endurecimento, não defeito ativo, e cabem numa sprint própria.
