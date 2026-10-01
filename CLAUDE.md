# LF ERP — Instruções para Claude Code

## Contexto do Projeto

ERP SaaS profissional, multiempresa, escalável. Em operação real com empresa piloto **Lucileide Variedades**.
Tratar sempre como ambiente de produção — qualquer alteração afeta dados e clientes reais.

---

## Stack Técnica

### Backend
- Node.js + Express
- PostgreSQL via **Neon Database** (`db.js`)
- Autenticação JWT
- Deploy: **Render**
- Arquivo principal: `backend/server.js` (modular — monta as rotas de `backend/routes/`)

### Frontend
- HTML + CSS + JavaScript modular (sem framework)
- Deploy: **Vercel**
- Entrada: `frontend/index.html`, `frontend/admin.html`

### Timezone
- **America/Fortaleza** em todo o sistema — nunca usar UTC ou outro fuso sem solicitação explícita

---

## Estrutura de Arquivos

```
backend/
  server.js
  db.js
  routes/
    clientes.routes.js
    compras.routes.js
    estoque.routes.js
    financeiro.routes.js
    fornecedores.routes.js
    produtos.routes.js
    relatorios.routes.js
    vendas.routes.js
  utils/
    financeiroUtils.js
    normalizadores.js
    periodoUtils.js

frontend/
  index.html
  admin.html
  css/
  js/
    api.js, app.js, auth.js
    clientes.js, compras.js, configuracoes.js
    contasPagar.js, contasReceber.js, dashboard.js
    estoque.js, feedback.js, fluxoCaixa.js
    fornecedores.js, lancamentosFinanceiros.js, pdv.js
    produtos.js, relatoriosFinanceiros.js, usuarios.js, vendas.js
```

---

## Módulos Implementados

| Módulo | Arquivos principais |
|---|---|
| Dashboard | `dashboard.js` |
| Produtos | `produtos.js` / `produtos.routes.js` |
| Clientes | `clientes.js` / `clientes.routes.js` |
| Fornecedores | `fornecedores.js` / `fornecedores.routes.js` |
| Compras | `compras.js` / `compras.routes.js` |
| Vendas / PDV | `vendas.js`, `pdv.js` / `vendas.routes.js` |
| Estoque | `estoque.js` / `estoque.routes.js` |
| Financeiro | `contasPagar.js`, `contasReceber.js`, `fluxoCaixa.js`, `lancamentosFinanceiros.js` / `financeiro.routes.js` |
| Relatórios | `relatoriosFinanceiros.js` / `relatorios.routes.js` |

---

## Arquitetura Multiempresa

Em migração gradual. Coexistem dois campos — **sempre manter compatibilidade com ambos**:
- `empresa` (TEXT) — legado
- `empresa_id` (INTEGER) — novo padrão

---

## Status Financeiros

```
pendente | atrasado | pago | parcial | parcial_atrasado
```

`parcial_atrasado` = status `parcial` + `data_vencimento < hoje` → exibe "Parcial em atraso"

---

## Funções Críticas (não alterar sem análise completa)

```
validarAcessoEmpresa()
validarEmpresa()
obterPeriodo()
adicionarFiltroPeriodo()
normalizarDecimal()
normalizarInt()
normalizarDataISO()
atualizarStatusContasReceberPorEmpresa()
atualizarStatusContasPagarPorEmpresa()
registrarMovimentacaoEstoque()
registrarLogFinanceiro()
criarParcelasContasReceber()
```

---

## Regras Obrigatórias de Trabalho

1. **Patches cirúrgicos** — nunca recriar módulos, nunca reescrever arquivos inteiros sem necessidade explícita
2. **Nunca remover funcionalidades** existentes
3. **Nunca trabalhar por achismo** — sempre ler o código real antes de propor mudanças
4. **Nunca simplificar** código funcional que está em produção
5. **Sempre preservar retrocompatibilidade** (`empresa` TEXT + `empresa_id` INTEGER)
6. **Sempre considerar impacto multiempresa** em qualquer alteração
7. **Não misturar frontend e backend** sem necessidade clara
8. **Não propor refatorações grandes** sem solicitação explícita
9. **Pensar como arquiteto de software sênior**

---

## Formato Obrigatório de Resposta (para bugs e alterações)

1. **Diagnóstico técnico**
2. **Causa raiz**
3. **Impacto**
4. **Arquivo(s) necessário(s)**
5. **TRECHO PARA LOCALIZAR** `[código]`
6. **SUBSTITUIR POR** `[código]`
7. Explicação objetiva
8. **TESTES** (lista numerada)
9. **DEPLOY** (`git add . / git commit / git push`)

---

## Contas Manuais

Criadas para registrar promissórias antigas.
- NÃO criam venda
- NÃO movimentam estoque
- NÃO geram faturamento
- Apenas criam título financeiro
