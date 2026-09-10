# Contrato de API

> **TASK-086 (Sprint 26 · CR Tipo C, ADR-014).** Este arquivo estava listado no
> mapa do projeto (`CLAUDE.md`, "Localização dos artefatos principais") e **nunca
> existiu**. Um critério BDD da TASK-082 ficou sem alvo por causa disso, e foi
> marcado como não cumprido em vez de riscado.
>
> **Gerado a partir do código**, enumerando `src/app/api/**/route.ts` e lendo as
> checagens de cada handler — não de memória. Quando este documento e o código
> discordarem, **o código está certo e este arquivo está velho**; corrija-o.

## Por que escrever isto valeu mais que o próprio documento

Enumerar a superfície e comparar rotas irmãs lado a lado revelou **duas falhas de
autorização vivas em produção**, nenhuma das quais tinha sintoma:

1. `/api/metrics/frequent-users` validava sessão e não papel — qualquer usuário
   autenticado, inclusive ALUNO, obtinha nome, username, papel e frequência de
   retirada dos maiores usuários de qualquer chave.
2. `GET /api/settings` não validava **nada** no handler e devolvia a senha padrão
   de reset a todos — o que, combinado com o fluxo de troca obrigatória do login,
   permitia **tomar a conta de alguém** na janela entre um reset e o primeiro
   acesso da vítima. *(A TASK-087 fechou o acesso ao valor; a **TASK-094** eliminou
   o valor — não existe mais senha compartilhada. Ver "O que NÃO existe".)*

As duas foram corrigidas antes deste arquivo ser escrito (ADR-014, TASK-085 e
TASK-087), para que ele nascesse descrevendo a superfície certa. **O débito se
pagou antes de o arquivo existir.**

---

## Como a autorização funciona aqui

São **duas camadas, e a divisão é deliberada** (constitution §3.2):

| Camada | Onde | O que garante |
|---|---|---|
| Proxy | `src/proxy.ts` | Que **há sessão** válida. Nega por padrão: rota nova nasce fechada (TASK-077) |
| Handler | cada `route.ts` | Que a sessão **pode** aquilo. É a autoridade sobre papel |

O proxy **não** autoriza papel, e isso não é lacuna. Ele roda no Edge Runtime, sem
acesso ao banco, e duplicar a decisão criaria dois lugares onde ela pode divergir
— com a divergência invisível até virar incidente.

**Consequência prática:** uma rota que só chama `verifySession` está aberta a
todos os papéis. Se isso não for intencional, é defeito — foi exatamente o achado
1 acima. `tests/autorizacao-metricas.test.ts` varre todas as rotas e reprova quem
exigir sessão sem verificar papel, com as exceções em lista.

### Rotas públicas — lista fechada

Casam com `ROTAS_PUBLICAS` em `src/proxy.ts`. **Cada entrada aqui é uma porta, e
portas se contam.**

| Rota | Por quê |
|---|---|
| `/login` | página de entrada |
| `POST /api/auth/login` | autenticar |
| `POST /api/auth/logout` | sair não pode exigir estar dentro — cookie corrompido deixaria o usuário preso |
| `GET /api/health` | batida do ping agendado; responde dois campos e nada mais (TASK-079) |

### Rotas de conta própria — sessão, sem papel

O dono é a **sessão**, não o papel: qualquer usuário autenticado gerencia o
próprio cadastro.

| Rota | Métodos |
|---|---|
| `/api/account/profile` | `GET`, `PUT` |
| `/api/account/security/password` | `PUT` |
| `/api/account/onboarding` | `POST` | **sessão** | Marca que a pessoa viu o tutorial de primeiro acesso. **Não recebe corpo**: o alvo sai da sessão, e só dela — aceitar um `userId` de fora seria escrita em linha alheia. `COALESCE` preserva a primeira data, então rever pela tela não a reescreve (TASK-098) |
| `/api/auth/me` | `GET` |

---

## Superfície completa — 24 rotas

Papéis: **A**DMIN · **G**ESTOR · **P**ORTEIRO. `FUNCIONARIO` e `ALUNO` não
alcançam nenhuma rota de operação — apenas as de conta própria acima.

### Operação de chaves

| Rota | Métodos | Papéis | Observação |
|---|---|---|---|
| `/api/keys` | `GET` `POST` `PUT` `DELETE` | A · G · P | Cadastro e estado das chaves |
| `/api/transactions` | `POST` | A · G · P | Abre retirada, devolução ou transferência |
| `/api/transactions/pending` | `GET` | A · G · P | Pendências de dupla confirmação |
| `/api/transactions/[id]/cancel` | `POST` | A · G · P | Cancela transação pendente |
| `/api/transactions/[id]/user-confirm` | `POST` | A · G · P | Confirmação pelo portador |

### Métricas

| Rota | Métodos | Papéis | Observação |
|---|---|---|---|
| `/api/metrics/business` | `GET` | A · G · P | Métricas do `spec.md` §5 |
| `/api/metrics/frequent-keys` | `GET` | A · G · P | Semântica muda por papel (REQ-029c) |
| `/api/metrics/frequent-users` | `GET` | A · G · P | ⚠️ **A checagem de papel foi acrescentada na TASK-085.** Devolve dados pessoais de terceiros — nome, username, papel e frequência — e por isso não é para todo autenticado |

### Usuários

| Rota | Métodos | Papéis | Observação |
|---|---|---|---|
| `/api/users` | `GET` `POST` `PUT` `DELETE` | A · G · P | `POST`/`DELETE` são de ADMIN; leitura é mais ampla |
| `/api/users/role` | `POST` | **A** | Troca de papel. Regra de negócio impede rebaixar o próprio ADMIN |
| `/api/users/reset-password` | `POST` | A · G | Aplica a senha padrão e liga `requires_password_change` |
| `/api/users/change-password` | `POST` | **A** | Exige a senha atual (`bcrypt.compare`) |

### Administração

| Rota | Métodos | Papéis | Observação |
|---|---|---|---|
| `/api/settings` | `GET` | **sessão** | Devolve **um campo só**: `autoLogoutTime`, e vai para **todo papel** — o `Sidebar` precisa. A senha padrão saiu na TASK-094 |
| `/api/settings` | `POST` | A · G | Grava numa transação. Aceita **só** `autoLogoutTime`; um cliente antigo que mande a senha padrão não a persiste (TASK-094) |
| `/api/settings/clear-database` | `POST` | **A** | Destrutivo. `app_logs` sobrevive por desenho (§7.1) |
| `/api/history/clear` | `DELETE` | **A** | Destrutivo. Usa o bypass transacional de manutenção |
| `/api/logs` | `GET` | A · G | Trilha de auditoria |
| `/api/backups` | `GET` | **A** | Lista execuções de `backup_runs` — **não** arquivos |
| `/api/backups/reliability` | `GET` | **A** | Métrica de confiabilidade. Restrita porque a resposta pode conter mensagem de erro do job |

---

## O que NÃO existe, e não deve voltar

Registrado para que ninguém procure — ou reconstrua achando que faltou:

| Rota | Saiu em | Por quê |
|---|---|---|
| **campo `defaultResetPassword`** em `GET`/`POST /api/settings` | TASK-094 | Não há mais senha compartilhada. O reset emite **código de uso único**, devolvido uma vez em `codigoDeAcesso` por `POST /api/users/reset-password` e `POST /api/users`. A TASK-087 havia fechado o ACESSO ao valor e registrado que não fechava a fragilidade: A · G o conheciam, e ele nunca mudava |
| `POST /api/backups` | TASK-082 | Gerar backup é o job agendado. Handler que responde 503 para sempre sugere capacidade em manutenção |
| `DELETE /api/backups` | TASK-075 | Não há arquivo local, e a trilha é imutável por trigger |
| `POST /api/backups/restore` | TASK-082 | Restaurar é procedimento com credencial — `docs/runbook-deploy.md` §6.5 |
| `POST /api/backups/import` | TASK-082 | Importava `.db` (SQLite), fora do runtime desde a Sprint 21 |
| `GET /api/server-info` | TASK-079 | Expunha IPs da rede interna, hostname, plataforma e uptime |

---

## Convenções de resposta

| Situação | Status | Corpo |
|---|---|---|
| Sem sessão | `401` | `{ "error": "Não autenticado" }` — do proxy, para caminhos `/api/` |
| Sessão sem o papel exigido | `403` | `{ "error": "Forbidden" }` ou `"Acesso negado."` |
| Entrada inválida | `400` | mensagem do schema Zod (`src/lib/schemas.ts`) |
| Excesso de tentativas de login | `429` | com `Retry-After` (constitution §2.6) |
| Recusa deliberada | `503` | operação que existiu e não existe mais |

**Enumeração de usuário é evitada de propósito** em `/api/auth/login`: usuário
inexistente e senha errada devolvem a mesma resposta.

**Página protegida** (não-API) recebe `307` para `/login`, não `401` — devolver
HTML a um `fetch` faria o cliente ler 200 com HTML no lugar de JSON e tratar como
sucesso, com a falha aparecendo longe da causa.
