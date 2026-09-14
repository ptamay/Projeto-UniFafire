# ADR-030 — PWA instalável sem service worker

- **Status:** Aceito, **implementado e verificado em produção** — aprovado pelo usuário em 2026-09-14
  (opção D); TASK-129 no ar no mesmo dia (#91, `8f8f0a3`): manifest e os quatro ícones 200 nos
  tamanhos medidos, `/sw.js` e `/workbox-*.js` → 307. Falta só a instalação real num Android e num
  iPhone (critério de aceite abaixo), feita pelo usuário. O risco "sem arte-fonte para o 512" não se confirmou: o
  `logo.svg` traz o emblema em vetor, e os ícones saíram dele
- **Data:** 2026-09-14
- **Tipo de Change Request:** **C** (corrige a especificação de uma feature já entregue — REQ-018 — e
  tira uma dependência; nenhum comportamento muda em produção). Por que não é D: a constitution não
  menciona PWA, service worker nem modo offline (conferido em 2026-09-14).
- **Relacionado:** REQ-018 · `spec.md` §6 ("Sem modo offline") · ADR-002 (CR retroativo que aceitou o
  PWA como entregue) · ADR-018 (hipótese dos cookies do PWA no iOS) · `src/proxy.ts` (arquivos
  públicos) · `tests/pwa.test.ts` · `tests/proxy-authorization.test.ts`
- **Origem:** medição do usuário em 2026-09-14 — `GET /sw.js` em produção responde **404**, e um
  `next build` local também não gerou `public/sw.js` nem `workbox-*.js`

## Contexto

### O service worker nunca existiu

Não houve upgrade que o quebrou. O projeto nasceu no **Next 16.1.6** (`13c0764`, 2026-02-01), e no
Next 16 o `next build` usa **Turbopack por padrão**. O `@ducanh2912/next-pwa` entrou em `fd7d603`
(2026-05-21) **no mesmo commit** que o `turbopack: {}`, com o comentário *"Silencing Turbopack/Webpack
conflict warning"*: o Next 16 reprova o build quando há configuração de webpack (a do plugin) sem
configuração de Turbopack, e a saída escolhida — declarar `turbopack: {}` — é justamente a que faz o
Next ignorar o callback `webpack`. O erro sumiu junto com o plugin. Nenhum commit, em nenhuma branch,
jamais usou `--webpack`; o `Build_Producao.bat` da era PM2 rodava `npm run build`.

No código do plugin (10.2.9), **tudo** mora no callback `webpack`: a geração do `sw.js` pelo Workbox
**e** a injeção do `sw-entry.js` — o script que chama `workbox.register()` — no bundle do cliente.
Sob Turbopack, nenhum dos dois acontece. O `register: true` é inerte.

### Medido em 2026-09-14

```
produção, sem sessão
  /sw.js, /workbox-4754cb34.js   → 404 (página HTML)
  /manifest.json                 → 200 application/json, <link rel="manifest"> no <head> do /login
  /logo/unifafire_logo.png       → 200 — o ÚNICO ícone: 300×283, não quadrado,
                                   declarado no manifest como "192x192 512x512"
  8 chunks JS do /login          → nenhum contém serviceWorker, workbox ou __PWA_
  navegador (Chromium 152)       → 0 requisições a /sw.js, console vazio,
                                   0 registros de service worker, 0 caches

worktree, next build
  padrão (Turbopack)             → verde, nenhum sw.js
  --webpack                      → gera public/sw.js + workbox-*.js, e REPROVA no type-check:
                                   POST(request?: Request) em api/auth/logout/route.ts
```

### O que isso significa para quem usa

- **Instalar funciona, pelo menu.** O Chrome deixou de exigir service worker para instalar pelo menu
  no 108 (celular) e no 112 (desktop). No iOS, "Adicionar à Tela de Início" nunca exigiu. Nada disso
  foi exercitado num aparelho físico — é o que a TASK-129 fecha.
- **O convite automático do Chrome no Android nunca apareceu**: ele ainda exige um service worker com
  `fetch`.
- **Não existe service worker antigo para limpar.** Nenhum build produziu um, e service worker é por
  origem — a da Vercel existe desde 2026-09-06, e a da intranet também era build Turbopack.

### O que o SW do plugin faria se fosse ligado

O `sw.js` que o build `--webpack` gerou traz o cache padrão do plugin: **`NetworkFirst` para todo
`/api/*`** (timeout de 10 s, 24 h de validade) e para as **páginas e o RSC** de mesma origem. Em
aparelho compartilhado, isso guardaria histórico, inventário e usuários de uma pessoa no Cache
Storage, legíveis depois do logout; em rede lenta, serviria estado de chave de até 24 h atrás sem
aviso — o contrário do REQ-032. E contradiz o `spec.md` §6: "Sem modo offline". Ligar o plugin **não
é devolver o que estava configurado**: seria o primeiro service worker da história do sistema.

## Decisão

1. **O PWA do sistema é o manifest, e não há service worker.** O REQ-018 é reescrito para dizer isso
   e deixa de contradizer a §6.
2. **Sai o `@ducanh2912/next-pwa`** do `package.json` e o `withPWA` do `next.config.ts`. O plugin não
   é publicado desde set/2024 e exige webpack; ficar com ele é deixar configurado algo que o build não
   executa.
3. **Saem `sw.js` e `workbox-*.js` da lista pública do `proxy.ts`** (e do teste do proxy). Liberam
   arquivos que não existem; a negação por padrão é o estado certo para o que não é servido.
   `manifest.json` e os ícones continuam públicos.
4. **Ícones de verdade:** 192×192 e 512×512 quadrados, `purpose: "any"`, e um maskable separado com
   margem segura — em vez de um PNG de 300×283 declarado nos dois tamanhos com `"any maskable"`.
5. **Guarda no lugar do teste que só via o arquivo existir:** o manifest é JSON válido com os campos
   de instalação; cada ícone existe, é PNG quadrado e tem as dimensões que declara; há 192 e 512 com
   `any`; e nada no código ou na configuração promete um service worker que o build não produz.

## Alternativas consideradas

**A. `next build --webpack`.** Uma linha, e o plugin volta a gerar o SW. Rejeitada: grava dados
autenticados no aparelho (item acima), tira o projeto inteiro do bundler padrão por causa de um
recurso, depende de um plugin sem manutenção e exige corrigir a assinatura da rota de logout. Um SW
com defeito também é difícil de tirar dos aparelhos — ele fica até outro SW o substituir.

**B. Serwist (`@serwist/turbopack`, 9.5.12).** Mantido, feito para Turbopack, citado pela
documentação do Next para modo offline. Rejeitada: dependência e mudança de stack novas, o SW vira
rota e pede exceção no proxy, e a política de cache continua sendo nossa — para um sistema que não
tem modo offline.

**C. Service worker escrito à mão, sem cache de dados** (só uma página offline estática). Traria de
volta o convite automático do Android. **Não é rejeitada, é adiada:** se a adoção pelo celular pedir
o convite, entra por CR próprio, em cima do estado limpo que esta decisão deixa. O próprio Chrome
desaconselha SW só para cumprir o critério de instalação.

## Consequências

**Positivas**
- A especificação passa a descrever o que está no ar desde sempre. Nada muda para quem usa, exceto os
  ícones.
- Sai uma dependência abandonada e a árvore de pacotes do Workbox/webpack que ela puxa.
- Duas exceções da negação por padrão deixam de existir.
- Um teste que dava verde sem verificar nada vira uma guarda que reprova o que foi achado aqui.

**Negativas / riscos**
- **Continua sem convite automático no Android.** A instalação depende de a pessoa usar o menu do
  navegador (ou a instrução do iOS). Se isso pesar na adoção, a alternativa C.
- **Sem página offline própria.** O Chrome mostra a dele para app instalado sem SW, e a §6 já dizia
  que não há modo offline.
- **O ícone de 512 precisa de arte-fonte.** A marca só existe como PNG de 300×283 (o `logo.svg` é o
  logotipo horizontal, 4916×864). Ampliar o PNG borra; se não houver vetor da marca, a task registra
  a ampliação como débito e pede a arte ao usuário.

### Nota para o ADR-018

A hipótese "cookies separados do PWA no iOS" continua válida — ela depende de o app estar instalado
na tela inicial, não de service worker. O que estava errado era a descrição "PWA com service worker".

## Implementação

- **TASK-129 — PWA sem service worker.** Tirar o plugin (`package.json`, lockfile, `next.config.ts`);
  tirar `sw.js`/`workbox-*` do `proxy.ts` e do `proxy-authorization.test.ts`; ícones 192/512 quadrados
  e um maskable, com o manifest apontando para eles; `tests/pwa.test.ts` reescrito como a guarda do
  item 5, com o vermelho conferido cenário a cenário (inclusive recolocar o `withPWA` e o ícone de
  300×283). `next build` verde; `npm audit --omit=dev` 0.
- **Critério de aceite:** a guarda verde; em produção, depois do merge, `manifest.json` e os ícones
  com 200 e `/sw.js` sem 200; o painel de manifest do DevTools sem erro de ícone; e **a instalação pelo
  menu num Android e pelo "Adicionar à Tela de Início" num iPhone**, feita pelo usuário, com o
  resultado registrado no `plan.md`.
