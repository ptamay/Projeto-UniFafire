# Threat Model — STRIDE (UniFafire · Sistema de Gerenciamento de Chaves)

> Criado na TASK-031 (Sprint 7 — Dívida de Estabilização). Documenta o modelo de
> ameaças do sistema em produção na intranet, incluindo a exceção consciente do
> REQ-014 à imutabilidade do REQ-005. Atualizar a cada mudança de superfície de
> ataque (nova rota pública, novo perfil, mudança de auth).
>
> Fonte canônica: `docs/threat_model_stride.md`. Esta cópia em `.sdd/memory/`
> existe para carregamento rápido pelo agente de execução — mantida em sincronia
> manual a cada atualização do documento canônico (sincronizada em 2026-07-10).

## Contexto de implantação
- Instância única (PM2) em servidor local; acesso apenas pela rede interna da instituição.
- Sem API pública, sem integrações externas (spec §6). Superfície: UI Next.js + rotas `/api/*`.
- Perfis: ADMIN, GESTOR, PORTEIRO, FUNCIONARIO, ALUNO (RBAC isolado, `ROLE_PERMISSIONS`).

## STRIDE

### S — Spoofing (falsificação de identidade)
| Ameaça | Mitigação |
|---|---|
| Roubo/adivinhação de credenciais | bcrypt; senha mínima 8 (REQ-012); lockout 5 falhas/15min por conta+IP; rate limit 30 req/min em `/api/auth/*` |
| Enumeração de usuários no login | Mensagem única "Credenciais inválidas" (REQ-001, TASK-005) |
| Sequestro de sessão | JWT HS256 em cookie `httpOnly`/`sameSite=lax`; expiração 24h idle / 7d absoluta (REQ-011); `pwd_hash` no payload invalida sessões após troca de senha |

### T — Tampering (adulteração)
| Ameaça | Mitigação |
|---|---|
| Adulteração do histórico de movimentações | **Triggers de imutabilidade no banco (TASK-030)**: UPDATE/DELETE em `history` bloqueados; único caminho é o modo manutenção transacional do fluxo ADMIN (REQ-014) |
| SQL Injection | Prepared statements obrigatórios (better-sqlite3); validação Zod nas entradas |
| Adulteração de schema fora de controle | Migrações UP/DOWN pareadas com teste em cópia (`db/migrate.mjs`, TASK-029) |
| Upload de backup malicioso (import/restore) | Restrito a ADMIN; validação de nome de arquivo + anti path traversal |

### R — Repudiation (repúdio)
| Ameaça | Mitigação |
|---|---|
| Admin nega ter executado operação destrutiva | **Registro PRÉVIO em log estruturado de arquivo (TASK-031)** — sobrevive à limpeza do banco; fases `pre` e `done` com usuário e timestamp |
| Ações administrativas sem trilha | `logAction` → `action_logs` (REQ-010) + espelho no log estruturado (TASK-033) |
| Movimentação de chave contestada | Dupla confirmação (REQ-003/004): porteiro E portador confirmam; histórico imutável |

### I — Information Disclosure (vazamento)
| Ameaça | Mitigação |
|---|---|
| Dados sensíveis em logs | Máscara automática de senha/hash/token/cookie no logger estruturado (TASK-033); LGPD básica (spec §6) |
| Logs de auditoria expostos | `/logs` restrito a ADMIN (REQ-010) |
| Segredo JWT exposto | `JWT_SECRET` em `.env` fora do git; falha explícita no boot se ausente (TASK-001) |

### D — Denial of Service
| Ameaça | Mitigação |
|---|---|
| Flood nas rotas de auth | Rate limit em memória (D-05) — suficiente para instância única em intranet |
| Perda do banco | Backup diário automático com retenção + verificação (REQ-009, TASK-032); DR: RPO 24h / RTO 4h |
| Exaustão de disco por logs | Rotação diária de arquivos; retenção operacional documentada no runbook |

### E — Elevation of Privilege
| Ameaça | Mitigação |
|---|---|
| Usuário comum acessa rota administrativa | Validação de sessão + papel server-side em toda rota (matriz RBAC testada — Sprint 3) |
| PORTEIRO executa operação destrutiva | `history/clear` e `clear-database` exigem `role === 'ADMIN'` no servidor + modal destrutivo na UI |
| Auto-elevação de papel | Mudança de papel restrita a ADMIN/GESTOR via `/api/users/role` com trilha em `audit_logs` |

## Exceção consciente — REQ-014 × REQ-005
O REQ-005 declara o histórico imutável. O REQ-014 cria a única exceção: o super admin
(ADMIN) pode limpar histórico e resetar o banco. Controles compensatórios:
1. Restrição de papel server-side (ADMIN apenas).
2. Modal de confirmação destrutiva na UI.
3. **Registro prévio persistente fora do banco** (log estruturado em arquivo) — a
   operação não consegue apagar a própria trilha.
4. Bypass de imutabilidade transacional (`withMaintenanceMode`) — nunca persiste;
   qualquer falha reverte a flag junto.

## Riscos aceitos (registrados)
- Estado de lockout/rate-limit em memória: reinício do processo zera contadores (aceito — instância única, intranet, D-05).
- `clear-database` apaga `action_logs`/`audit_logs`: trilha compensada pelo log de arquivo (item R acima).
- Sem TLS interno: tráfego em rede local confiável (aceito pelo cliente; revisar se a rede mudar).
