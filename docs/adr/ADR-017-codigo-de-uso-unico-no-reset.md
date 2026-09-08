# ADR-017 — O reset entrega um código de uso único, não uma senha compartilhada

- **Status:** Proposto — aguarda implementação pelo ciclo TDD
- **Data:** 2026-09-08
- **Tipo de Change Request:** C (mudança em feature já implementada)
- **Relacionado:** constitution §2.1, §2.4, §7.1 · ADR-014 (achado 2) · REQ-001
- **Origem:** ressalva registrada na TASK-087 — "fechou o ACESSO, não a fragilidade"

## Contexto

Quando um ADMIN ou GESTOR reseta o acesso de alguém, o sistema grava na conta o
hash de uma **senha padrão compartilhada** e liga `requires_password_change`. A
pessoa entra com essa senha e é obrigada a trocá-la na hora.

A senha padrão vem de `settings.default_reset_password`, com recuo para
`SENHA_PADRAO_RESET`. Ela é **a mesma para todo mundo, para sempre**.

### A janela, e por que ela não fechou

A TASK-087 (ADR-014, achado 2) descobriu que `GET /api/settings` devolvia esse
valor a **qualquer usuário autenticado**, inclusive ALUNO. Isso permitia:

1. ler a senha padrão;
2. esperar um reset legítimo (fluxo rotineiro);
3. entrar com o username da vítima, a senha padrão e uma senha nova, **antes do
   primeiro acesso dela** — o login troca a senha na hora;
4. ficar com a conta, e com o papel dela.

A correção omitiu o campo para papéis baixos. Isso fechou **o acesso ao valor**, e
está certo. **Não fechou a fragilidade**, e a própria task registrou isso:

- ADMIN e GESTOR continuam conhecendo a senha, legitimamente e por desenho;
- ela **nunca muda**, então quem a soube uma vez a sabe para sempre — um
  ex-funcionário, alguém que viu a tela por cima do ombro, um print antigo;
- a janela entre o reset e o primeiro acesso **continua existindo** para todos
  esses.

O valor em produção hoje é resíduo da carga sintética da TASK-067, e ninguém o
escolheu.

### Por que não há link de recuperação

O desenho óbvio — e-mail com link — **não é possível neste sistema**, e não por
falta de vontade:

- a tabela `users` não tem coluna de e-mail;
- não há provedor de envio, nem secret para um;
- o próprio modal "Esqueci minha senha" da tela de login já diz, hoje, para
  procurar um ADMIN ou GESTOR presencialmente.

Isto é uma portaria de instituição de ensino: as duas pessoas estão no mesmo
prédio. A entrega **em mãos** não é um contorno, é o canal real — e construir
e-mail transacional para substituí-la seria um projeto inteiro (provedor,
entregabilidade, mais um secret, mais um modo de falha) para um problema que a
proximidade física já resolve.

### A cláusula que decide o desenho

> **§2.1** — Nunca armazenar, logar ou **transmitir senha em claro** ou hash em
> resposta de API.

O reset precisa entregar **alguma coisa** ao ADMIN para ele repassar. Se essa
coisa for uma senha, ela trafega em claro na resposta e a §2.1 é violada — o que
exigiria emendar a constitution, e tornaria isto um CR Tipo D.

Há uma saída que é ao mesmo tempo mais segura e compatível com a letra: **o que se
entrega não é uma senha.**

## Decisão

**O reset passa a emitir um CÓDIGO DE USO ÚNICO.** A pessoa entra com
`username + código` e **define a própria senha** naquele momento.

| | hoje | com o ADR-017 |
|---|---|---|
| o que o ADMIN entrega | a senha padrão, igual para todos | um código só daquela pessoa |
| validade | eterna | curta, e expira |
| quantos usos | ilimitados até a vítima entrar | **um** |
| guardado como | hash de senha, indistinguível de senha real | hash, em campo próprio |
| quem sabe a senha da pessoa | o ADMIN sabe | **ninguém além dela** |
| §2.1 | senha em claro na resposta do `/settings` | nenhuma senha trafega |

**1. O código é gerado aleatoriamente e guardado com hash**, em colunas próprias
(`reset_code_hash`, `reset_code_expires_at`) — e **não** no `password_hash`.

Colunas próprias, e não reaproveitamento do `password_hash`, pela razão que este
projeto já pagou caro em outros lugares: **dado que mora num campo assume o
significado do campo.** Um código guardado em `password_hash` é lido por todo
mundo depois como "a senha do usuário", e o primeiro leitor a tratá-lo assim
reabre exatamente a janela que este ADR fecha. Separado, o reset também pode
**invalidar a senha antiga na hora**, em vez de substituí-la por uma conhecida.

**2. O código expira e é consumido no primeiro uso.** Prazo curto — a pessoa está
do outro lado do balcão. Depois de usado ou vencido, não vale mais, e a conta fica
sem caminho de entrada até um novo reset, que é o estado correto.

**3. A senha padrão compartilhada deixa de existir.** Saem
`settings.default_reset_password`, o campo na tela de Configurações,
`SENHA_PADRAO_RESET` e o uso na **criação de usuário** — que hoje sofre do mesmo
problema: todo usuário novo nasce com a mesma senha conhecida.

**4. O código nunca é logado.** A §7.1 já proíbe senha em log; o código entra na
mesma proibição, **explicitamente**, porque não é senha e alguém poderia concluir
que está liberado. O `logAction` do reset registra que **houve** reset e por quem,
nunca o valor.

**5. Usuários com reset pendente na hora da migração têm o acesso invalidado.**
Quem estiver com `requires_password_change = true` tem hoje, no `password_hash`, o
hash da senha compartilhada. Remover a configuração não apaga isso: a conta
continuaria aberta a quem conhece o valor antigo, agora **sem nada na tela que
denuncie**. A migração tem de zerar essas contas e exigir novo reset. Quantas são,
é para verificar na implementação — provavelmente nenhuma, mas "provavelmente
nenhuma" não é um plano.

## Alternativas consideradas

**Senha aleatória por reset, exibida uma vez.** Era o pedido literal, e é mais
simples. Rejeitada por dois motivos, e o segundo pesa mais que o primeiro:
transmite senha em claro na resposta (violaria a §2.1 e tornaria isto Tipo D); e
faz o ADMIN **saber a senha de outra pessoa**, ainda que por minutos. O código de
uso único custa quase o mesmo e remove essa propriedade de vez.

**Link de recuperação por e-mail.** Impossível hoje — sem coluna de e-mail, sem
provedor, sem secret. Ver o contexto.

**Manter a senha compartilhada e rotacioná-la periodicamente.** Reduz a janela sem
fechá-la, e cria um ritual que ninguém vai executar. Rejeitada.

**Não fazer nada.** Defensável enquanto o time é pequeno e todos são de confiança.
Mas o custo de fechar é uma sprint, e a falha é escalada de privilégio: quem reseta
um GESTOR e é interceptado, entrega um GESTOR.

## Consequências

**Positivas**
- Fecha a janela do ADR-014 achado 2 pela raiz, em vez de esconder o valor.
- Ninguém além da própria pessoa conhece a senha dela, em momento nenhum.
- Resolve junto a pendência operacional do `default_reset_password = "trocar123"`
  em produção: a linha deixa de existir, em vez de ser corrigida à mão.
- Usuário novo deixa de nascer com senha conhecida.

**Negativas / riscos**
- **Um passo a mais no balcão:** o ADMIN precisa ler e repassar um código. Hoje
  ele diz "é a senha de sempre". É o custo real desta decisão, e é o que a torna
  uma escolha e não uma obviedade.
- Código expirado gera reincidência ("expirou, reseta de novo"). O prazo tem de
  ser generoso para o ritmo do balcão, e a mensagem de expiração tem de dizer o
  que fazer.
- Mexe no caminho de login, que é o Fluxo 1 da spec §4 — "não pode falhar". A
  cobertura tem de incluir o caminho de quem **não** está em reset, para provar
  que o login normal não regrediu.

## Implementação

- **TASK-093** — o código de uso único: migration UP/DOWN com `reset_code_hash` e
  `reset_code_expires_at`, geração no reset e na criação de usuário, validação e
  consumo no login, e o código devolvido **uma vez** na resposta ao ADMIN.
- **TASK-094** — a senha compartilhada sai: `settings.default_reset_password`, o
  campo da tela, `SENHA_PADRAO_RESET`, o `defaultResetPassword` do `GET`/`POST
  /api/settings`, `docs/api-contract.md` — e a invalidação das contas com reset
  pendente (decisão 5).

> A TASK-094 depende da 093: enquanto o código não existir, remover a senha
> compartilhada deixa o sistema sem nenhum caminho de reset.
