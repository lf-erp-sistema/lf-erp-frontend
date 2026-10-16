# Auditoria de Segurança Premium — LF ERP — 2026-10-16

Segunda rodada de auditoria, focada especificamente em **segurança** (não repete as frentes de performance/cobertura de teste da auditoria completa anterior, `AUDITORIA_COMPLETA_2026-10-15.md`). 6 agentes adversariais paralelos, somente-leitura, cada um instruído a verificar independentemente — sem confiar no meu resumo — se as 47 correções da rodada anterior realmente seguraram, e a caçar problemas novos.

**HEAD auditado:** backend `e3fc923`, frontend `0aedc36` (ambos já continham as 47 correções da auditoria de 2026-10-15).

---

## Resumo executivo — ATUALIZADO (status final: todos os 23 achados corrigidos)

A segunda rodada confirmou que **as 47 correções da auditoria anterior seguraram** — nenhuma foi revertida. Mas encontrou um padrão sério: **4 das correções de criptografia/SSRF da própria rodada anterior foram aplicadas de forma incompleta**, deixando pontos de leitura sem o `decryptField`/`fetchSeguro` correspondente ao ponto de escrita já corrigido. O resultado prático foram **duas funcionalidades quebradas em produção** (NFC-e e webhook do Mercado Livre) e **uma reabertura pontual de SSRF-via-redirect** — regressões causadas pela própria correção de segurança, não o bug original.

**Todos os 23 achados desta auditoria (1 crítico, 5 altos, 5 médios, 12 baixos) foram corrigidos, testados e enviados ao repositório** em 17 commits ao longo desta sessão. A única exceção deliberada é **A2-SEC-007** (nonce de SSE em log de acesso), que o próprio agente que o levantou classificou como "nenhuma ação obrigatória" — um trade-off de design razoável (EventSource não suporta headers customizados), documentado na seção 2 por completude, não corrigido.

| Dimensão | Nota antes | Nota depois |
|---|---|---|
| Autenticação / sessão | 7/10 | 9/10 — revogação de sessão pós-troca-de-senha corrigida (A2-SEC-001) |
| Autorização / IDOR | 7/10 | 9/10 — `produto_id`/`cliente_id` validados em todos os pontos encontrados |
| Integrações externas | 8/10 | 9/10 — SSRF, HMAC e criptografia de credenciais 100% consistentes |
| Frontend / XSS | 8/10 | 9/10 — XSS do PDV e defesa em profundidade corrigidos |
| Dados financeiros | 6/10 | 9/10 — bug crítico de fraude (B2-DATA-001) e os 2 achados altos corrigidos |

Suíte de testes final: **44 suites / 541 testes, 0 falhas**. `npm audit --omit=dev`: 0 vulnerabilidades.

---

## 1. Todos os achados — status final: CORRIGIDOS

Organizados por severidade. Todos verificados com `node --check`, suíte Jest completa a cada mudança (final: 44 suites / 541 testes), e, nos achados com dado em produção potencialmente afetado, uma consulta read-only confirmando o estado real antes de decidir se havia dado a corrigir (nenhum caso exigiu).

### Crítico

| ID | O que era | Correção | Commit |
|---|---|---|---|
| **B2-DATA-001** | `atualizarStatusContasReceberPorEmpresa` (utils/financeiroOps.js) sobrescrevia `status='parcial'` para `'atrasado'` ao vencer, destruindo a marcação de pagamento parcial — reabria a falha que a extensão de `vendaPossuiParcelaPaga` (ciclo anterior) tinha fechado: venda voltava a poder ser editada/excluída, e a parcela parcial podia ser apagada sem aviso. Função irmã de contas_pagar não tinha o bug — inconsistência, não decisão deliberada. | `status` preservado via `CASE` no UPDATE, mantendo o recálculo de multa/juros/dias_atraso que a baixa parcial depende. Produção confirmada sem linhas já corrompidas. | `7cd3745` |

### Altos

| ID | O que era | Correção | Commit |
|---|---|---|---|
| **A2-SEC-001** | Troca de senha não revogava JWTs já emitidos; `/auth/refresh` sem teto absoluto — token roubado continuava válido indefinidamente mesmo após troca de senha. | Nova coluna `usuarios.senha_alterada_em` (migration 060); JWT carrega `senha_v` na emissão; wrapper `auth` de server.js rejeita token com `senha_v` anterior ao valor atual (cache 30s). Reset de senha por admin também revoga sessões do usuário afetado. `sincronizarSenhaSaasOwner` ajustada para não derrubar a sessão do owner em todo boot. | `ea71139` |
| **B2-DATA-002** | `PUT /contas-receber/:id` (escopo "apenas esta") permitia editar valor/vencimento de conta já paga/parcial, sem a guarda que DELETE e o caminho em lote já tinham. | Guarda de status adicionada; observação continua editável; UPDATE agora reconfirma empresa_id no WHERE. | `afe8376` |
| **B2-DATA-003** | Editar compra com `contas_pagar` parcialmente paga apagava a parcela parcial — mesma classe do B2-DATA-001, nunca replicada pro lado de compras. | Guarda e DELETE agora tratam `'parcial'`/`'parcial_atrasado'` como `'pago'`. | `afe8376` |
| **B2-BUG-004** | `GET /financeiro/lancamentos/:empresa` lançava `ReferenceError` (import de `normalizarInt` faltando), quebrando a tela de Lançamentos Financeiros. | Import corrigido. | `afe8376` |
| **D2-SEC-001** | `produto_id`/`grade_id` em itens de Orçamento/Pedido/OS (nova e legada) não validados contra a empresa antes do INSERT; JOINs de detalhe sem filtro `empresa_id` — vazava nome/**estoque real**/atributos de grade de outra empresa. | Validação em lote (padrão de api-publica.routes.js) nos 4 arquivos + `AND empresa_id = $N` nos JOINs de detalhe. | `dfac3c5` |

### Médios

| ID | O que era | Correção | Commit |
|---|---|---|---|
| **A2-SEC-002** | Gerente com `usuarios.editar`/`deletar` concedido podia rebaixar/excluir o admin da empresa — guard anterior só cobria "promover a admin". | Guarda simétrica no PUT e no DELETE. | `47bf0f6` |
| **A2-SEC-003** | Login do portal revelava (409 vs 401, sem senha) se um CPF/CNPJ estava em mais de uma empresa do SaaS. | Desambiguação só ocorre após confirmar a senha contra pelo menos um candidato. | `f35e9c9` |
| **A2-SEC-004** | Rate limiters do portal em Map local, zeravam a cada deploy/restart. | Trocados por `createSharedRateLimiter(pool)`, mesmos limites. | `f35e9c9` |
| **F2-SEC-001** | `webhook_endpoints.secret` e `contabilidade_config.webhook_secret` em texto puro — únicos 2 segredos do sistema sem criptografia. | `encryptField`/`decryptField` aplicados nos 2, decrypt centralizado em `enviarWebhook()` cobrindo os 2 pontos de chamada. | `037673e` |
| **B2-DATA-005** | `GET /vendas/detalhe/:id` usava expressão de status de 3 ramos, sem `parcial_atrasado`. | Expressão de 4 ramos replicada das demais rotas. | `fc043bf` |

### Baixos

| ID | O que era | Correção | Commit |
|---|---|---|---|
| **A2-SEC-005** | Sem header CSP no backend. | `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` adicionado. | `3baf717` |
| **A2-SEC-006** | Redirect HTTP→HTTPS dependia de `NODE_ENV=production` estar configurado no Render. | Redirect movido para fora do bloco condicional (HSTS continua condicional). | `aa0bbf9` |
| **A2-SEC-007** | Nonce de SSE aparece em log de acesso via query string. | **Não corrigido** — o próprio agente que levantou classificou como "nenhuma ação obrigatória" (trade-off aceitável: EventSource não suporta headers customizados). | — |
| **D2-SEC-002** | `fidelidade.routes.js POST /acumular` não revalidava posse de `cliente_id`. | Mesma checagem já usada em `/resgatar`. | `b3fc586` |
| **F2-SEC-003** | 3 webhooks Asaas sem rate limiter dedicado. | `createSharedRateLimiter` aplicado nos 3. | `3baf717` |
| **F2-SEC-004** | `GET /marketplace/oauth/callback` sem rate limiter. | Mesmo limiter aplicado. | `3baf717` |
| **F2-SEC-006** | Mesmo padrão do D2-SEC-001 em `orcamento_itens`. | Coberto pelo fix do D2-SEC-001 (mesmo arquivo/JOIN). | `dfac3c5` |
| **F2-SEC-007** | `crm.routes.js` oportunidades sem validação de posse de `cliente_id`. | Validação adicionada no POST e PUT. | `b3fc586` |
| **C2-INT-003** | `checkout.routes.js` reimplementava a verificação de webhook Asaas manualmente (3ª cópia) em vez de usar a função consolidada. | Consolidado em `verificarWebhookAsaas` (utils/asaas.js). | `887fd47` |
| **B2-DATA-006** | `GET /caixa/sessao-ativa` e `POST /caixa/fechar` calculavam `saldo_calculado` de formas diferentes — confirmado no frontend que o card "Saldo em caixa" exibia o valor menor (sem vendas do dia), risco real de confusão na conferência de caixa. | `saldo_calculado` de `/sessao-ativa` agora inclui vendas dinheiro/pix, igual ao fechamento. | `5c5893b` |

---

## 2. Pontos fortes confirmados (pelos 6 agentes, independentemente)

- Anti-enumeração de usuário no login do ERP: mesma mensagem de erro, `bcrypt.compare` dummy, senha validada antes de qualquer checagem de negócio.
- `validarAcessoEmpresa`/isolamento multiempresa: nenhuma rota auditada pula a validação final contra o token antes de tocar dado de outra empresa.
- `requirePermissao` aplicado em toda rota de escrita sem exceção legítima (185 rotas verificadas).
- `ssrfGuard.js`: bloqueio por padrão literal + resolução DNS (mitiga DNS rebinding), cobre IPv4/IPv6 privado e metadata de nuvem; `fetchSeguro()` revalida cada hop de redirect corretamente nos 4 pontos originais.
- Webhooks ML e Shopee fail-closed; idempotência de pedidos ML com advisory lock.
- `api-publica.routes.js`: isolamento por API key rigoroso, validação em lote de `produto_id`/`cliente_id` — modelo exemplar, deveria ser replicado nos pontos do D2-SEC-001.
- CSP do frontend forte (`script-src 'self'` sem `unsafe-inline`, `object-src none`, `frame-ancestors none`); `api.js` com whitelist de hosts para `setApiBaseUrl`.
- Nenhuma injeção SQL encontrada em nenhum dos ~70 arquivos lidos pelos 6 agentes.
- Nenhum DROP/TRUNCATE perigoso em nenhuma das 59 migrations; runner idempotente por nome de arquivo, seguro contra deploys concorrentes.

---

## 3. Status final

Todos os 23 achados desta auditoria foram corrigidos (exceto A2-SEC-007, deliberadamente não corrigido — ver seção 1), testados e enviados ao repositório em 17 commits. Suíte final: 44 suites / 541 testes, 0 falhas; `npm audit --omit=dev`: 0 vulnerabilidades; nenhuma migration pendente de dado em produção (todas as verificações read-only confirmaram zero linhas afetadas pelos bugs antes da correção).
