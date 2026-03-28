# Notion Templates — Marina Veauvy

## Como publicar os templates

Cada template abaixo é uma página Notion pronta. Para disponibilizar para clientes:

1. Crie cada template no Notion (conteúdo abaixo)
2. Clique em "Share" → "Publish to web" → Ative "Allow duplicate as template"
3. Copie o link de duplicação
4. Atualize os links nas landing pages

## Template 1: Dashboard Financeiro Pessoal (R$27)

### Estrutura da página Notion:

**Página principal: "💰 Dashboard Financeiro Pessoal"**

Databases (tabelas):
1. **📊 Transações** — Banco de dados principal
   - Nome (title)
   - Valor (number, formato R$)
   - Tipo (select: Receita / Despesa)
   - Categoria (select: Moradia, Alimentação, Transporte, Saúde, Lazer, Educação, Investimento, Outros)
   - Data (date)
   - Conta (select: Nubank, Itaú, Dinheiro, Cartão)
   - Pago? (checkbox)
   - Notas (text)

2. **🎯 Metas Financeiras** — Tracker de objetivos
   - Meta (title)
   - Valor Alvo (number)
   - Valor Atual (number)
   - Progresso (formula: prop("Valor Atual") / prop("Valor Alvo") * 100)
   - Prazo (date)
   - Status (select: Em andamento, Concluída, Pausada)
   - Prioridade (select: Alta, Média, Baixa)

3. **📈 Investimentos** — Carteira
   - Ativo (title)
   - Tipo (select: Renda Fixa, Ações, FIIs, Cripto, Tesouro, CDB, Poupança)
   - Valor Investido (number)
   - Valor Atual (number)
   - Rendimento (formula: prop("Valor Atual") - prop("Valor Investido"))
   - Rentabilidade % (formula: (prop("Valor Atual") / prop("Valor Investido") - 1) * 100)
   - Data Compra (date)
   - Vencimento (date)

4. **🔄 Assinaturas** — Gastos recorrentes
   - Serviço (title)
   - Valor Mensal (number)
   - Dia Cobrança (number)
   - Categoria (select)
   - Necessário? (select: Essencial, Útil, Dispensável)
   - Notas (text)

5. **📅 Orçamento Mensal** — Planejamento
   - Mês (title: Janeiro 2026, Fevereiro 2026...)
   - Receita Prevista (number)
   - Receita Real (number)
   - Despesa Prevista (number)
   - Despesa Real (number)
   - Saldo (formula)
   - Status (select: Superávit, Déficit, Neutro)

### Views sugeridas:
- Transações: Table (default), Calendar, Board by Tipo
- Metas: Gallery com progress bar
- Investimentos: Table + Board by Tipo
- Orçamento: Table ordenada por mês

### Conteúdo da página principal (acima dos databases):
```
# 💰 Dashboard Financeiro Pessoal

> Bem-vinda ao seu centro de controle financeiro! Aqui você organiza receitas, despesas, metas e investimentos em um só lugar.

## 🚀 Como começar
1. Registre suas receitas e despesas na tabela **Transações**
2. Defina suas metas na tabela **Metas Financeiras**
3. Liste seus investimentos
4. Cadastre todas as assinaturas recorrentes
5. Planeje o orçamento do mês

---
```

## Template 2: Kit Empreendedora Digital — 5 Templates (R$37)

### Template 2.1: "🚀 Planejamento de Negócio"
Database:
- Área (title)
- Tipo (select: Missão, Visão, Meta Q1, Meta Q2, Meta Q3, Meta Q4, OKR)
- Descrição (text)
- Métrica (text)
- Status (select: Planejado, Em Andamento, Concluído)
- Responsável (text)

Conteúdo fixo:
- Business Model Canvas (callout blocks)
- Proposta de Valor
- Segmento de Clientes
- Canais
- Fontes de Receita

### Template 2.2: "💵 Financeiro do Negócio"
Database:
- Descrição (title)
- Valor (number)
- Tipo (select: Receita, Custo Fixo, Custo Variável, Investimento)
- Categoria (select: Serviço, Produto, Marketing, Ferramenta, Impostos)
- Data (date)
- Cliente (text)
- Status (select: Pago, Pendente, Atrasado)
- Nota Fiscal (checkbox)

### Template 2.3: "📱 Calendário Editorial"
Database:
- Título do Post (title)
- Plataforma (multi-select: Instagram, TikTok, YouTube, Blog, Newsletter, LinkedIn)
- Formato (select: Carrossel, Reels, Story, Post, Artigo, Vídeo, Thread)
- Pilar (select: Educativo, Inspiracional, Vendas, Bastidores, Entretenimento)
- Data Publicação (date)
- Status (select: Ideia, Em Produção, Pronto, Publicado)
- Copy (text)
- Link (url)
- Engajamento (number)

Views: Calendar, Board by Status, Table by Plataforma

### Template 2.4: "🎯 Funil de Vendas"
Database:
- Lead (title)
- Email (email)
- WhatsApp (phone)
- Origem (select: Instagram, Blog, Pinterest, Indicação, Anúncio, Webinário)
- Etapa (select: Lead Frio, Lead Morno, Qualificado, Proposta, Negociação, Fechado, Perdido)
- Valor Potencial (number)
- Próximo Passo (text)
- Data Contato (date)
- Notas (text)

View principal: Board by Etapa (Kanban)

### Template 2.5: "👥 CRM de Clientes"
Database:
- Nome (title)
- Email (email)
- WhatsApp (phone)
- Empresa (text)
- Serviço Contratado (select)
- Valor Total (number)
- Data Início (date)
- Status (select: Ativo, Inativo, Churn)
- Satisfação (select: 😊 Excelente, 🙂 Bom, 😐 Regular, 😞 Ruim)
- Notas (text)
- Próximo Follow-up (date)

### Bônus: "✅ Checklist de Lançamento Digital"
- 47 items checkbox organizado em 3 grupos:
  - Pré-Lançamento (15 items)
  - Lançamento (17 items)
  - Pós-Lançamento (15 items)

---

## Entrega ao cliente

Após pagamento no Asaas, enviar por email:
1. Link para duplicar Template 1 OU Templates 2.1-2.5
2. Vídeo tutorial (gravar Loom de 5 min mostrando como usar)

## Links das landing pages
- Template Financeiro: marinaveauvy.github.io/costuras-meditacoes/template-financeiro-pessoal.html
- Kit Empreendedora: marinaveauvy.github.io/costuras-meditacoes/template-empreendedora.html
