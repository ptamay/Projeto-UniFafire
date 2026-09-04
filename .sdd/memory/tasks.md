# tasks.md — Micro-spec da Sprint Ativa (Sprint 22 · 🔴 crítica)

> **Etapa 7a do ADR-012 — Pré-requisitos do Go-Live.** Tudo que precisa estar de pé
> **antes** de existir uma URL pública. Não é a sprint do deploy: é a que torna o deploy
> defensável.
>
> Canal: Claude Code · Modelo: Opus 5 · Esforço: alto.
> Criticidade 🔴 por três motivos independentes, qualquer um bastaria: cria credencial
> (TASK-080), muda o segredo de assinatura de sessão (TASK-076) e reescreve autorização
> (TASK-077).
>
> **Contexto que redefiniu esta sprint (2026-09-04):** não existe produção — sem servidor
> PM2, sem `keys.db` real, e o conteúdo do banco anterior era fictício. O objetivo declarado
> pelo usuário é fazer o sistema funcionar em Supabase + Vercel. A Etapa 7 foi antecipada
> (CR Tipo C, `f136c90`) e a Etapa 6 dissolvida — a TASK-074 subiu para cá porque é
> pré-requisito, não melhoria.

---

## Por que estas quatro, e não outras

Cada uma responde a uma pergunta diferente sobre o mesmo momento — o instante em que o
sistema passa a ter endereço público:

| Task | Pergunta | Sem ela |
|---|---|---|
| **080** | Alguém consegue entrar? | O sistema sobe **inacessível** |
| **074** | O que aconteceu fica registrado? | A trilha operacional evapora **em silêncio** |
| **076** | A sessão resiste a quem está no meio? | Cookie trafega em claro; segredo de baixa entropia |
| **077** | Uma rota nova nasce fechada? | Nasce **aberta**, e ninguém percebe |

A ordem é de dependência real: sem a **080** não há como testar nada logado no destino;
a **074** precisa existir antes da **076/077** para que as mudanças de auth já nasçam
auditáveis; e a **077** é a última porque muda o comportamento de toda rota — é a que mais
se beneficia de ter as outras três estáveis embaixo.

---

## Decisões de execução

**D1 — TASK-080 é script de operação, não rota HTTP.** Uma rota de bootstrap seria
superfície de ataque **permanente** para um uso **único**: mesmo protegida por token, ela
existe em toda requisição, para sempre, e a proteção vira mais uma coisa que pode ser
implementada errado. Um script em `db/` não é alcançável pela internet. Custo: exige acesso
ao terminal do operador com a `DATABASE_URL` — que é exatamente quem deveria poder fazer isso.

**D2 — A garantia de "uma vez só" fica no banco, não na disciplina.** O script recusa se
`users` tiver qualquer linha. É a mesma lição da TASK-070, em que o bypass da imutabilidade
deixou de ser uma linha numa tabela-flag (que dependia de quem chamava remover) e virou
`set_config` transacional (que o Postgres descarta sozinho). Estado que não pode vazar é
melhor que estado que se promete limpar.

**D3 — A TASK-080 não inventa fluxo de autenticação.** `login/route.ts:78` já devolve
`REQUIRE_PASSWORD_CHANGE` (403) quando `requires_password_change` é verdadeiro, e a baseline
Postgres já declara essa coluna com `DEFAULT true`. O script só cria a linha; a troca
forçada na primeira entrada é caminho existente e testado. **Nenhuma superfície nova de auth
nesta sprint** — o que é o oposto do que uma task de "criar o primeiro usuário" costuma virar.

**D4 — `app_logs` entra por migration pareada em `db/migrations-pg/`,** com DOWN escrito
antes do UP (constitution §4.1). A tabela recebe `REVOKE UPDATE, DELETE` como o `history`,
e fica **fora de `tablesToClear`**: é o destino que precisa sobreviver ao REQ-014.

**D5 — Testes contra o Postgres do container** (D-11 do `plan.md`), como na Sprint 21.
`npm run test:db:up` antes de `npx vitest`.

---

## TASK-080: Bootstrap do primeiro usuário ADMIN no Postgres

**Contexto**: numa base Supabase vazia **não existe caminho para autenticar**.
`scripts/init-db.js` cria um `admin`/`admin`, mas só fala SQLite e saiu do `postinstall` na
TASK-071; nenhuma migration de `db/migrations-pg/` insere usuário; e toda rota exige sessão,
com `/api/users` exigindo papel ADMIN. O sistema subiria e ninguém entraria.

O `admin`/`admin` do SQLite não serve de modelo: ele nasceu numa intranet fechada. Aqui a
exposição é pública, e uma senha padrão previsível num sistema alcançável pela internet é
uma conta ADMIN entregue a quem chegar primeiro.

**Critérios BDD**:
- [x] **Cenário**: Cria o primeiro ADMIN numa base vazia
      Dado um banco com o schema aplicado e a tabela `users` vazia
      Quando o script é executado
      Então existe exatamente um usuário com papel `ADMIN`
      E `requires_password_change` é verdadeiro
      E o hash é `bcryptjs` com custo ≥ 10 (constitution §1.1).
- [x] **Cenário**: Recusa numa base que já tem usuário
      Dado um banco com pelo menos uma linha em `users`
      Quando o script é executado
      Então ele recusa com mensagem explícita e código de saída diferente de zero
      E **nenhuma linha é criada, alterada ou apagada**.
- [x] **Cenário**: A senha inicial nunca é previsível
      Dado que nenhuma senha foi informada por ambiente
      Quando o script é executado
      Então ele gera uma senha aleatória de entropia adequada e a imprime **uma vez**
      E não existe valor padrão embutido no código que sirva de senha.
- [x] **Cenário**: A senha não vaza para lugar nenhum além da saída única
      Dado o script executado com sucesso
      Quando se inspeciona `audit_logs`, `action_logs` e o log estruturado
      Então a senha em claro não aparece em nenhum deles (constitution §6.1)
      E o hash também não.
- [x] **Cenário**: A criação fica registrada
      Dado o script executado com sucesso
      Então há entrada em `audit_logs` identificando a criação do usuário inicial.
- [x] **Cenário**: A primeira entrada força a troca
      Dado o ADMIN recém-criado e a senha impressa pelo script
      Quando ele faz login sem enviar `newPassword`
      Então a resposta é 403 `REQUIRE_PASSWORD_CHANGE`
      E, ao enviar uma nova senha de ≥ 8 caracteres, a sessão é criada e
      `requires_password_change` passa a falso.
- [x] **Cenário**: O script não é alcançável pela aplicação
      Dado o código de `src/`
      Então nenhuma rota importa ou expõe o bootstrap
      E ele vive em `db/`, fora do bundle.

---

## TASK-074: `structured-logger` grava em `app_logs`

**Contexto**: `src/lib/structured-logger.ts:51` faz `fs.mkdirSync` + `fs.appendFileSync` em
`logs/`. No Vercel o filesystem é efêmero e somente-leitura: a escrita falha, cai no `catch`
existente e degrada para `console`. **A aplicação não quebra — e é justamente esse o
problema.** Nada alerta, e a trilha operacional evapora a cada invocação.

A constitution §7 já antecipava: *"arquivo em `logs/` não serve à hospedagem serverless,
cujo filesystem é efêmero e somente-leitura — a trilha se perderia"*. E o critério de aceite
(d) do REQ-031 nomeia **o log estruturado** ao lado de `history` e `action_logs`.

⚠️ **Cuidado de teste, específico desta task:** como a falha atual é silenciosa por desenho,
um teste que apenas verifique "a chamada não lançou" passaria com o defeito presente. Todo
critério aqui afirma sobre **a linha chegando em `app_logs`**.

**Critérios BDD**:
- [x] **Cenário**: A migration de `app_logs` é pareada
      Dado `db/migrations-pg/`
      Então existe o UP com a tabela e o DOWN correspondente escrito antes dele
      E o Gate 2 passa (constitution §4.1).
- [x] **Cenário**: A linha é persistida em tabela, não em arquivo
      Dado o logger em uso
      Quando `logStructured` é chamado
      Então a entrada existe em `app_logs` com severidade, mensagem, contexto e instante
      E **nenhuma escrita em `logs/` acontece**.
- [x] **Cenário**: A trilha é imutável como o `history`
      Dada uma linha em `app_logs`
      Quando se tenta `UPDATE` ou `DELETE` nela
      Então o banco recusa (constitution §7 — `REVOKE UPDATE, DELETE`).
- [x] **Cenário**: `app_logs` sobrevive ao REQ-014
      Dado o fluxo destrutivo de `settings/clear-database`
      Quando ele é executado
      Então `app_logs` **não** é limpa — não está em `tablesToClear`.
- [x] **Cenário**: A máscara de dados sensíveis continua valendo
      Dado um contexto com chaves `password`, `token`, `hash` ou `secret`
      Quando a entrada é gravada
      Então os valores aparecem mascarados em `app_logs` (constitution §6.1).
- [x] **Cenário**: Falha ao gravar não derruba a requisição
      Dado que a escrita em `app_logs` falha
      Quando uma rota chama o logger
      Então a requisição segue normalmente
      E a falha é sinalizada por um canal que não depende da tabela.
- [x] **Cenário**: Nada em `src/` escreve no filesystem
      Dado o código de `src/`
      Então não há `appendFileSync`, `writeFileSync`, `mkdirSync` nem `createWriteStream`
      — o filesystem do destino é somente-leitura.

---

## TASK-076: `JWT_SECRET` com entropia real e cookie `secure` incondicional

**Contexto**: o segredo atual é um UUID com sufixo — entropia muito abaixo dos 32 bytes
aleatórios que a constitution §2.1 exige. E `proxy.ts` grava o cookie com
`secure: isHttps`, calculado por header (`x-forwarded-proto`), quando a §2.3 passou a exigir
`secure` **obrigatório em produção**: *"a hospedagem serve exclusivamente por HTTPS, então o
condicional 'quando servido via HTTPS' deixa de existir"*.

Um condicional derivado de header é pior que um valor fixo: quem controla o header controla
o `secure`.

**Critérios BDD**:
- [x] **Cenário**: Segredo fraco é recusado na partida
      Dado um `JWT_SECRET` com menos de 32 bytes de entropia
      Quando a aplicação tenta assinar ou verificar sessão
      Então ela falha alto, com mensagem que diz o que fazer
      E **não** cai num segredo gerado em runtime (constitution §2.1).
- [x] **Cenário**: `secure` não depende de header em produção
      Dado `APP_ENV` de produção
      Quando o cookie de sessão é emitido em qualquer caminho do código
      Então `secure` é verdadeiro **independentemente** de `x-forwarded-proto`
      E `httpOnly` e `sameSite` continuam aplicados.
- [x] **Cenário**: Dev local continua funcionando sem HTTPS
      Dado `APP_ENV` de desenvolvimento
      Então o relaxamento de `secure` é possível pelo perfil de ambiente (constitution §8)
      E esse relaxamento é impossível de ativar em produção.
- [x] **Cenário**: Nenhum segredo no código ou no repositório
      Dado o código-fonte e os arquivos versionados
      Então não há valor de `JWT_SECRET` embutido
      E `.env.example` documenta a chave sem valor (constitution §6.2).
- [x] **Cenário**: A expiração continua como está
      Dada uma sessão emitida após a mudança
      Então a expiração absoluta de 7 dias e o idle de 24 h permanecem (constitution §2.2)
      — esta task troca o segredo e o `secure`, não a política de sessão.

---

## TASK-077: Autorização com defesa em profundidade no `proxy.ts`

**Contexto**: hoje o `proxy.ts` faz duas coisas — renova a expiração do cookie e limpa JWT
inválido. Requisição **sem** cookie de sessão cai em `return NextResponse.next()` e **segue
adiante**. A verificação de papel é feita à mão em cada handler, então **uma rota nova
esquecida nasce aberta**, e nada avisa.

Débito registrado desde a Sprint 9 como *"tolerável em rede local; endereçar antes da
exposição pública"*. É agora.

⚠️ O `proxy` roda no **Edge Runtime**: sem Node APIs, sem `pg`. A verificação disponível ali
é a do JWT (`session-edge`), não a do banco. Isto é **defesa em profundidade, não
substituição** — a checagem de papel por rota (constitution §3.2) continua sendo a
autoridade; o proxy é a rede que pega o que ela esquecer.

**Critérios BDD**:
- [x] **Cenário**: Requisição sem sessão não passa
      Dada uma requisição a rota protegida sem cookie de sessão
      Então o proxy recusa — redireciona para login (página) ou responde 401 (API)
      E **não** chega ao handler.
- [x] **Cenário**: Requisição com sessão inválida ou expirada não passa
      Dado um cookie com JWT adulterado, expirado ou assinado com outro segredo
      Então o proxy recusa e limpa o cookie.
- [x] **Cenário**: A lista de rotas públicas é explícita e mínima
      Dado o proxy
      Então só `/login`, `/api/auth/*` e os estáticos passam sem sessão
      E o padrão é **negar** — rota nova nasce protegida por omissão.
- [x] **Cenário**: Uma rota nova esquecida nasce fechada
      Dada uma rota de API criada sem nenhuma verificação no handler
      Quando ela é acessada sem sessão
      Então a resposta não é do handler — o proxy barrou antes.
- [x] **Cenário**: A verificação por rota continua sendo a autoridade
      Dada uma sessão válida de papel insuficiente
      Quando ela acessa rota que exige papel maior
      Então o handler responde 403 (constitution §3.2)
      E o proxy não é o que autoriza papel — ele só garante que há sessão.
- [x] **Cenário**: Os quatro fluxos críticos do spec §4 continuam íntegros
      Dada a suíte completa
      Então login, retirada, confirmação e devolução passam sem alteração de comportamento.

---

## TASK-081: A trilha de auditoria é esperada, não largada

> Aberta em 2026-09-04 como CR Tipo B (`4c7055b`), durante a execução da TASK-076.

**Contexto**: 27 chamadas de `logAction` sem `await`, em 12 arquivos. `logAction` grava em
`action_logs` e chama `logStructured`, que a TASK-074 tornou assíncrono. Em execução
serverless a instância pode congelar assim que a resposta sai, e a escrita pendente morre
com ela.

**Isto tornava a TASK-074 incompleta.** O critério daquela task — "a linha chega em
`app_logs`" — foi verificado e passa; o REQUISITO (REQ-031(d), trilha sem perda) não estava
cumprido enquanto o principal chamador do logger soltava a promessa.

⚠️ **O que define os testes desta task:** promessa solta **não tem sintoma confiável em
teste**. Em Node, o `await` da asserção seguinte cede o event loop e a escrita pendente
completa — o teste de comportamento passa com o defeito presente E depois de corrigido, ou
seja, não mede nada. A prova disso ficou registrada no commit vermelho: os dois cenários de
comportamento **já passavam** antes da correção. O que distingue é o texto da chamada.

**Critérios BDD**:
- [x] **Cenário**: Nenhuma chamada da trilha fica sem espera
      Dado o código de `src/`
      Então nenhuma chamada de `logAction` está em posição de statement sem `await`
      E o mesmo vale para `logStructured`, `logTiming`, `recordLoginAttempt` e `clearLoginAttempts`.
- [x] **Cenário**: A guarda é mecânica, não vigilância humana
      Dado que promessa solta é invisível em revisão — sem sintoma, teste verde, tipo correto
      Então `@typescript-eslint/no-floating-promises` está ligada como erro na superfície de servidor
      E foi provado que ela reprova uma promessa solta reintroduzida.
- [x] **Cenário**: A espera não quebrou a gravação
      Dada uma rota destrutiva e uma rota de escrita comum
      Quando cada uma responde
      Então a entrada correspondente já está em `action_logs`.

---

## Definition of Done da sprint

- [ ] Os 4 pares `test(TASK-NNN)` → `feat(TASK-NNN)` na ordem, com a suíte inteira verde a cada um
- [ ] Migration de `app_logs` com DOWN escrito antes do UP
- [ ] `./scripts/ci-gates.sh` limpo (6 gates), `tsc --noEmit` 0, `eslint` 0
- [ ] `npm audit` sem HIGH/CRITICAL (constitution §6.3) — **lido inteiro, sem `head`/`tail`**
- [ ] `npm run build` verde — a Sprint 21 provou que ele pega o que a suíte não pega
- [ ] App exercitado no navegador contra o Postgres do container, incluindo **login com o
      ADMIN criado pelo bootstrap** e a troca forçada de senha
- [ ] Fase 11 + Memory Sync
