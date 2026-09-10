# ADR-018 — Fluidez, primeiro acesso, e por que a sessão parece cair

- **Status:** Proposto — aguarda implementação pelo ciclo TDD
- **Data:** 2026-09-08
- **Tipo de Change Request:** C (mudança em features já implementadas), contendo uma
  task **Tipo B** (lacuna do REQ-010) e uma **Tipo A** (feature nova)
- **⚠️ Deixa registrada uma decisão Tipo D PENDENTE** — ver "A §2.2 fica em aberto"
- **Relacionado:** constitution §2.2, §7.1 · REQ-010 · ADR-013 · ADR-017
- **Origem:** relato de uso em 2026-09-08 — "no celular precisei ficar logando", tela de
  Configurações desequilibrada, troca de abas lenta, e ausência de tutorial

## Contexto

Quatro pedidos que parecem soltos e não são: os quatro descrevem o mesmo sistema visto
por quem o usa, e não por quem o escreveu.

### 1. "Precisei ficar logando" — a premissa estava errada, e o diagnóstico não fecha

**O login já persiste.** O que existe hoje:

| limite | valor | onde |
|---|---|---|
| idle | 24 h, renovado a cada requisição pelo `proxy.ts` | §2.2 |
| absoluto | 7 dias, no JWT | §2.2 |
| logout forçado | 18:30, timer no `Sidebar` | **nenhum requisito** |

Os dois primeiros são texto literal da §2.2: *"sessão com expiração absoluta de 7 dias
(`setExpirationTime`) e idle timeout de 24h"*. A implementação está correta.

Os `LOGIN_SUCCESS` reais de produção:

```
09-06  10:41, 10:46, 11:14
09-07  04:40, 04:40, 04:41     ← três em um minuto
09-08  13:00
```

O intervalo 09-07 → 09-08 é de ~32 h e **cabe no idle de 24 h**. Mas 09-06 11:14 →
09-07 04:40 são ~17 h, e **não deveria ter derrubado nada**. Há pelo menos três
explicações compatíveis com esses dados, e nenhuma se confirma daqui:

- o **logout automático das 18:30** disparando numa aba aberta;
- **superfícies diferentes** — o app é PWA com service worker, e no iOS a versão
  instalada na tela inicial tem cookies separados do Safari;
- o **idle** sendo cruzado em outros dias.

### 2. Por que não dá para distinguir: o fim de sessão não deixa rastro

`POST /api/auth/logout` **não chama `logAction`**. O login entra na trilha, a saída não.
Nem a manual, nem a automática, nem a expiração.

Isso quase produziu um erro de raciocínio ao escrever este ADR: "não há registro de
LOGOUT, logo o logout automático nunca disparou" é inferir de uma ausência que não prova
nada — a ausência é do instrumento, não do evento.

E é uma lacuna do **REQ-010** por si só, independente deste problema: uma trilha de
auditoria que registra entradas e não registra saídas descreve metade do que aconteceu.

### 3. A troca de abas é lenta, e a causa é estrutural

Duas coisas, ambas verificadas no código:

- **Não existe `loading.tsx` em nenhuma rota.** Todas as páginas são dinâmicas (`ƒ` no
  `next build`, porque todas leem o cookie de sessão). Sem *loading boundary*, o
  navegador fica com a **tela anterior parada** até o servidor terminar de renderizar.
  Nada indica que algo está acontecendo, então a impressão é de travamento.
- **O menu navega com `router.push()`, não com `<Link>`.** O `<Link>` do Next faz
  *prefetch* da rota; com `router.push` cada clique começa do zero.

As duas se reforçam, e a correção também: com um `loading.tsx` presente, o prefetch do
`<Link>` para rota dinâmica busca **só até o boundary** — barato, e é justamente o que
faz a transição parecer imediata.

### 4. A tela de Configurações vai ficar desequilibrada

Não por acaso: a **TASK-094** (ADR-017) remove o campo "Senha padrão de reset", e o card
"Sistema e Segurança" fica com **um único campo**. A tela já passou por uma faxina
(ADR-013) que tirou quatro controles inertes; esta é a consequência daquela mais a
substituição da senha compartilhada por código de uso único.

## Decisão

**1. Instrumentar o fim de sessão ANTES de mexer na §2.2.** *(Decisão do usuário,
2026-09-08.)*

A saída passa a entrar na trilha, com o **motivo**: manual, automática (18:30) ou sessão
recusada. Só com isso se sabe qual das três hipóteses é a verdadeira — e emendar a lei
máxima às cegas seria afrouxar um controle de segurança para todos os usuários com base
num palpite.

É o método que o REQ-032 acabou de validar: medir, corrigir a causa medida, medir de
novo. Ali a suspeita era o Realtime e a causa era a região da função.

**2. A navegação ganha `<Link>` e `loading.tsx`.** Com critério de aceite **medido**, não
"parece mais rápido" — o mesmo padrão do ADR-016.

> ### ⚠️ Emenda de 2026-09-09 (TASK-096) — a medição derrubou metade desta decisão
>
> Esta decisão pedia "`<Link>` **com prefetch**", e mandava observar as requisições. A
> observação, num build de produção local, disse para desligar o prefetch:
>
> | | com prefetch | sem prefetch |
> |---|---|---|
> | requisições no carregamento | **13** (14 KB) | **0** |
> | por `router.refresh()` | **7** | **1** |
> | esqueleto aparece em | 29–43 ms | **3–14 ms** |
>
> **O prefetch não comprava nada.** Quem faz a transição parecer imediata é o
> `loading.tsx`: o esqueleto vem do *bundle da rota*, não do payload prefetchado. Para
> rota dinâmica, o conteúdo é buscado fresco de qualquer maneira.
>
> E o custo não é por página. `router.refresh()` invalida o cache do roteador e **todos
> os links prefetcham de novo** — e ele é chamado pelo `refreshData` a cada sinal do
> Realtime, ou seja, **a cada operação de chave, em cada cliente aberto**. É um
> multiplicador ligado à ATIVIDADE, que é a forma exata do problema que criou o REQ-032:
> o polling de 3 s projetava ~10,5 mi de requisições/mês.
>
> Fica `<Link prefetch={false}>`: a navegação de cliente (sem recarregar a página) e o
> `loading.tsx`, sem o tráfego. Há cenário guardando a decisão, porque sem ele alguém lê
> o parágrafo acima, vê `prefetch={false}` e "corrige".

**3. A tela de Configurações é reequilibrada, sem virar painel de sistema.**

⚠️ **O que NÃO entra: versão, host, uptime, contagens, região.** A TASK-079 removeu
`/api/server-info` exatamente por isso — cada um desses campos é reconhecimento gratuito
para quem procura o que atacar, e a tela é acessível a papéis que não precisam deles.
"Adicionar elementos do sistema" é um pedido legítimo cuja resposta óbvia já foi
rejeitada uma vez neste projeto; o registro existe para não ser reintroduzida.

O que entra é o que ajuda **quem está usando**, e não descreve a infraestrutura:

- **estado da atualização em tempo real** — sinal conectado ou polling largo
  (`EstadoSinal`, da TASK-073). É a resposta para "por que a tela demorou a mudar", e é
  estado da sessão de quem olha, não do servidor;
- **rever o tutorial**, ligado à decisão 4;
- a **zona destrutiva separada**. Hoje "Limpar Banco de Dados" é um botão vermelho no
  meio da tela, com o mesmo peso visual de um campo de horário.

**4. Tutorial de primeiro acesso, em português, por papel.**

Um PORTEIRO precisa aprender o balcão; um ALUNO precisa saber onde vê as próprias chaves
e como confirmar. O mesmo tutorial para os dois ensina a pessoa errada.

**Onde se guarda que a pessoa já viu:** coluna em `users`, não `localStorage`. A pessoa é
a mesma em qualquer aparelho, e o balcão tem computador compartilhado — com
`localStorage`, quem entra depois no mesmo navegador nunca vê o tutorial, e a mesma
pessoa o revê em cada aparelho. Custa uma migration.

Encaixa com o ADR-017: o primeiro acesso agora é um momento real e identificável — a
pessoa acabou de entrar com um código de uso único e definir a própria senha.

## A §2.2 fica em aberto — e isso é deliberado

A persistência de sessão **não é decidida aqui**. Aumentar o idle de 24 h ou o absoluto de
7 dias é emenda da constitution → **CR Tipo D**, com aprovação explícita.

O que este ADR faz é **tornar a decisão possível**: depois da TASK-095, "a sessão cai
demais" deixa de ser relato e vira dado, com causa nomeada. Se a causa for o logout das
18:30, nem há §2.2 a emendar — é uma configuração de tela que ninguém escolheu, sem
requisito nenhum por trás. Se for o PWA, também não.

## Alternativas consideradas

**Emendar a §2.2 agora, para um idle de 30 dias.** Resolveria de imediato **se** a causa
for o idle — e não resolveria nada se for o logout das 18:30 ou o cookie separado do PWA.
Rejeitada por ora: afrouxa um controle de segurança para todos de uma vez, com base numa
hipótese entre três.

**"Manter conectado" opcional no login.** Melhor que a anterior — o balcão compartilhado
fica no padrão curto e o celular pessoal fica longo, com consentimento explícito. Continua
sendo Tipo D. Fica como candidata para depois da medição.

**Guardar o tutorial em `localStorage`.** Mais simples, sem migration. Rejeitada: erra
justamente no computador compartilhado do balcão, que é o caso de uso principal.

**Painel de informações do sistema na tela.** Rejeitada — ver decisão 3.

## Consequências

**Positivas**
- A trilha passa a descrever a sessão inteira, e não só a entrada (REQ-010).
- A navegação deixa de parecer travada, e o ganho é medido.
- Quem entra pela primeira vez tem para onde olhar.

**Negativas / riscos**
- O `<Link>` com prefetch **aumenta requisições** ao servidor. O `loading.tsx` limita o
  prefetch ao boundary, mas o número tem de ser observado: o plano gratuito da Vercel tem
  cota, e o REQ-032 nasceu justamente de um desenho que gerava ~10,5 mi de requisições/mês.
- Tutorial que aparece na hora errada é pior que tutorial nenhum. Tem de ser pulável,
  navegável por teclado, e não pode bloquear a primeira retirada de chave.
- A migration do tutorial toca `users`, tabela que a TASK-093 acabou de alterar.

## Implementação

- **TASK-095** (Tipo B) — o fim de sessão entra na trilha, com motivo. **Destrava a
  decisão da §2.2.**
- **TASK-096** — `<Link>` com prefetch e `loading.tsx` por rota, com o ganho medido antes
  e depois, e as requisições observadas.
- **TASK-097** — tela de Configurações reequilibrada: estado do tempo real, rever
  tutorial, zona destrutiva separada. **Depende da TASK-094.**
- **TASK-098** (Tipo A) — tutorial de primeiro acesso, pt-BR, por papel, com o "já viu"
  em coluna de `users`.

> A ordem importa: a 095 primeiro, porque é ela que transforma o relato em dado. A 097
> depois da 094, senão mexe num card que está prestes a mudar.
