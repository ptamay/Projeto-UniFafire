# Overview - Sistema de Gerenciamento de Chaves (Universidade UniFafire)

## Contexto do Negócio
O sistema atual é um gerenciador de chaves sendo desenvolvido e adaptado para a Universidade UniFafire (utilizando como base um legado do Colégio São José). Seu principal objetivo é controlar o empréstimo (retirada) e a devolução de chaves das diversas salas e ambientes da instituição de forma segura e auditável. 

## Usuário Final e Atores
O sistema é utilizado internamente pela equipe do colégio, com diferentes níveis de acesso estruturados através de perfis (Roles):
- **Administrador / Gestor**: Têm acesso total ou quase total, podendo gerenciar chaves, usuários, configurações e visualizar históricos e logs.
- **Porteiro**: Responsável por operar a entrega e devolução física das chaves, podendo gerenciar as chaves e visualizar o histórico e o dashboard.
- **Funcionário / Aluno**: São os usuários finais que recebem as chaves. Têm permissões restritas a confirmar as transações (retirada/devolução) através de um fluxo com dupla confirmação.

## Funcionalidade Core (MVP)
A funcionalidade principal do sistema é registrar de forma confiável quem está com qual chave em determinado momento e manter o histórico dessas transações (Transactions), suportando ações de `withdraw` (retirada) e `return` (devolução).

## Entidades Principais
A partir do banco de dados e esquemas identificados, as entidades centrais do sistema são:
- **Usuários (Users)**: Quem interage com o sistema (Administradores, Porteiros, Funcionários, etc.).
- **Chaves (Keys)**: O ativo físico sendo gerenciado (nome/número da chave, sala correspondente).
- **Transações (Transactions)**: O registro de movimentação das chaves (retirada/devolução).
- **Configurações (Settings)**: Regras do sistema, horários de backup e outras configurações operacionais.

## Restrições e Ambiente
- **Tecnologia Atual**: O sistema foi construído ("vibecodado") utilizando Node.js, Next.js (App Router), React, e um banco de dados local SQLite (`better-sqlite3`).
- **Infraestrutura**: A aplicação roda num servidor local usando PM2 para manter o processo contínuo (conforme detalhado nos scripts `.bat` e `README.md`). 
- **Modo de Operação**: Como é um sistema interno, o uso será classificado para determinar se o fluxo será MODO MVP, MODO EXPRESSO ou MODO PADRÃO, dependendo do direcionamento das próximas fases.
