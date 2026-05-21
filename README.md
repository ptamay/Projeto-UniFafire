# Sistema de Gerenciamento de Chaves - Colégio São José

Este é o sistema de gerenciamento de chaves do Colégio São José, desenvolvido com Next.js e SQLite.

## 🚀 Como Executar em Produção

Para o ambiente de produção, utilizamos o **PM2** para manter o sistema rodando em segundo plano e garantir a reinicialização automática.

### Processo Completo (Build + Start)
Se você fez alterações no código ou deseja garantir que tudo está atualizado, execute:
- `Build_Producao.bat`

Este script irá:
1. Parar o serviço atual.
2. Instalar dependências.
3. Gerar o build otimizado do Next.js.
4. Reiniciar o serviço no PM2.

### Apenas Ligar o Sistema
Se o build já foi feito e você apenas deseja iniciar o servidor:
- `Ligar_Sistema.bat`

### Desligar o Sistema
Para parar o serviço em segundo plano:
- `Desligar_Sistema.bat`

---

## 🛠️ Desenvolvimento

Para rodar em modo de desenvolvimento (com Hot Reload):
- `iniciar_sistema.bat`
ou
```bash
npm run dev
```

## 📋 Requisitos
- Node.js (v18 ou superior)
- PM2 (`npm install -g pm2`)

## 🌐 Acesso
O sistema estará disponível em: [http://localhost:3000](http://localhost:3000)

