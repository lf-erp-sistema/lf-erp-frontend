# Auditoria de Segurança Premium — LF ERP — 2026-10-16

Segunda rodada de auditoria, focada especificamente em **segurança** (não repete as frentes de performance/cobertura de teste da auditoria completa anterior, `AUDITORIA_COMPLETA_2026-10-15.md`). 6 agentes adversariais paralelos, somente-leitura, cada um instruído a verificar independentemente — sem confiar no meu resumo — se as 47 correções da rodada anterior realmente seguraram, e a caçar problemas novos.

**HEAD auditado:** backend `e3fc923`, frontend `0aedc36` (ambos já continham as 47 correções da auditoria de 2026-10-15).

---

## Resumo executivo

A segunda rodada confirmou que **as 47 correções anteriores seguraram** — nenhuma foi revertida ou está "ainda problemática" na sua forma literal. Mas ela encontrou um padrão sério: **4 das correções de criptografia/SSRF da própria rodada anterior foram aplicadas de forma incompleta**, deixando alguns pontos de leitura sem o `decryptField`/`fetchSeguro` correspondente ao ponto de escrita/outras chamadas já corrigidas. O resultado prático foram **duas funcionalidades quebradas em produção** (NFC-e e webhook do Mercado Livre, ambos enviando/comparando segredo cifrado em vez de texto puro) e **uma reabertura pontual de SSRF-via-redirect** (exportação/webhook contábil) — regressões causadas pela própria correção de segurança, não o bug original.

Esses 4 + 1 (XSS armazenado confirmado no PDV) já foram **corrigidos, testados e commitados** durante esta auditoria, por serem regressões ativas de produção ou um XSS confirmado de alta severidade com correção trivial e de baixíssimo risco. Os demais achados (18 no total) ficam pendentes de decisão sua — nenhum deles é uma quebra ativa, e vários dependem de pré-condições específicas.

| Dimensão | Nota |
|---|---|
| Autenticação / sessão | 7/10 — login e multiempresa sólidos; revogação de sessão pós-troca-de-senha é a lacuna mais séria |
| Autorização / IDOR | 7/10 — padrão de validação de posse bem aplicado a `cliente_id`/`fornecedor_id`; `produto_id` em itens de orçamento/pedido/OS é o ponto cego recorrente |
| Integrações externas | 8/10 (após os fixes desta rodada) — SSRF, HMAC e criptografia de credenciais agora consistentes |
| Frontend / XSS | 8/10 (após os fixes desta rodada) — CSP forte; só a inconsistência pontual já corrigida |
| Dados financeiros | 6/10 — achado crítico novo em `contas_receber` (ver B2-DATA-001) ainda pendente |

---

## 1. Já corrigido nesta auditoria (commitado; 2 commits do backend ainda não enviados ao remoto — ver seção "Pendências de push")

Estes 5 foram corrigidos imediatamente por serem regressões de produção já ativas ou um XSS confirmado de correção trivial, consistente com o que já vinha sendo feito nesta sessão para esse tipo de achado.

| ID | Severidade | O que era | Arquivo(s) | Commit |
|---|---|---|---|---|
| C2-SEC-001 | **Crítico** | NFC-e 100% inoperante: `nfce.routes.js` nunca foi atualizado para descriptografar `token_focusnfe` depois que `nfe.routes.js` passou a gravá-lo cifrado — toda emissão/consulta/cancelamento de NFC-e enviava o token cifrado como Basic Auth ao Focus NFe | `backend/routes/nfce.routes.js` | `bd038d3` (backend, **já enviado**) |
| C2-SEC-002 | Médio | `saas_config.smtp_pass` (SMTP da própria plataforma) gravado e lido em texto puro, apesar de `encryptField`/`decryptField` já importados no arquivo | `backend/routes/admin-saas.routes.js`, `backend/utils/email.js` | `bd038d3` (backend, **já enviado**) |
| F2-SEC-002 / C2 (achado em duplicata pelos agentes C e F) | **Alto (funcional)** | Webhook do Mercado Livre sempre rejeitado: HMAC calculado com `client_secret` ainda cifrado (faltava `decryptField`) — toda notificação legítima de pedido do ML falhava silenciosamente | `backend/routes/marketplace/webhook.routes.js` | `592a841` (backend, **pendente de push**) |
| F2-SEC-005 | **Alto** | `exportacao.routes.js` usava `fetch()` nativo (em vez de `fetchSeguro()`) no teste de webhook contábil, reabrindo SSRF-via-redirect depois de validar a URL — mesma classe de bug que a correção original fechou em 4 outros arquivos | `backend/routes/exportacao.routes.js` | `592a841` (backend, **pendente de push**) |
| E2-SEC-201 | **Alto** | XSS armazenado confirmado: `telefone` do cliente não escapado no dropdown de autocomplete do PDV — executa no DOM principal do SPA (não numa janela de impressão isolada), com acesso a `localStorage`/`sessionStorage` (token JWT) | `frontend/js/pdv.js` | `a451b51` (frontend, **pendente de push**) |
| E2-SEC-202 | Baixo (defesa em profundidade) | 3 pontos em `assistenciaTecnica.js` onde o campo `resultado` do checklist (hoje restrito a um `<select>` de 4 valores) não passava por escape — incluindo um breakout de atributo `class="${item.resultado}"` | `frontend/js/assistenciaTecnica.js` | `a451b51` (frontend, **pendente de push**) |

Todos os 5 foram verificados com `node --check` e a suíte Jest completa (29 suites / 491 testes, 0 falhas) depois de cada mudança.

### Pendências de push

O commit `bd038d3` do backend já foi enviado ao remoto. Os commits `592a841` (backend) e `a451b51` (frontend) estão **commitados localmente mas não enviados** — o push automático foi bloqueado pelo classificador de permissões do Claude Code ("Production Deploy"), então preciso da sua confirmação explícita para `git push` nos dois.

---

## 2. Achados novos pendentes de decisão

Organizados por severidade. Nenhum é uma quebra ativa de produção — todos dependem de pré-condições específicas, listadas em cada item.

### Críticos

**B2-DATA-001 — `atualizarStatusContasReceberPorEmpresa` destrói o status `'parcial'` ao marcar atraso, reabrindo sozinha a falha que a correção de vendas fechou neste mesmo ciclo**
`backend/utils/financeiroOps.js`. O `UPDATE` que marca contas vencidas como `'atrasado'` inclui `'parcial'` no `WHERE status IN (...)` — então uma parcela com pagamento parcial já registrado, ao vencer, perde essa marcação e aparece como `'atrasado'` simples. Isso reabre em cascata: (1) `vendaPossuiParcelaPaga` deixa de bloquear edição/exclusão da venda; (2) o `DELETE` em `removerDadosDependentesVenda` passa a apagar essa `contas_receber` junto com as pendentes, mesmo tendo recebido pagamento parcial real; (3) `DELETE /contas-receber/:id` permite excluir direto, sem aviso. A função irmã de contas a pagar (`atualizarStatusContasPagarPorEmpresa`) não tem esse bug — é uma inconsistência pontual, não uma decisão deliberada. Risco de fraude real (funcionário recebe parcial em dinheiro e depois apaga o rastro após o vencimento). Correção: remover `'parcial'` do `IN (...)` dessa query específica.

### Altos

- **A2-SEC-001** — Troca de senha não revoga JWTs já emitidos, e `/auth/refresh` não tem teto absoluto de sessão: um token roubado uma vez (XSS, log, dispositivo compartilhado) continua válido indefinidamente via refresh, mesmo depois do usuário trocar a senha pelo fluxo normal.
- **B2-DATA-002** — `PUT /contas-receber/:id` (caminho "apenas esta") permite editar `valor`/`vencimento` de conta já paga ou parcialmente paga, sem a guarda de status que o `DELETE` e o caminho "em lote" já têm.
- **B2-DATA-003** — Editar uma compra com `contas_pagar` parcialmente paga apaga a parcela parcial — mesma classe de bug do B2-DATA-001/vendas, nunca replicada para o lado de compras.
- **B2-BUG-004** — `GET /financeiro/lancamentos/:empresa` lança `ReferenceError` (import de `normalizarInt` faltando) e quebra totalmente a tela de Lançamentos Financeiros em produção. Não é falha de segurança, mas impede auditoria manual de lançamentos.
- **D2-SEC-001** — IDOR de leitura: `produto_id`/`grade_id` em itens de Orçamento/Pedido/OS (nova e legada) não são validados contra a empresa antes do INSERT, e os JOINs de detalhe (`GET /:id`) não filtram por `empresa_id` — vazando `nome`, **estoque real** e atributos de produto de outra empresa. `pedidos.routes.js` e `assistencia/os.routes.js` vazam o campo mais sensível (estoque). A conversão pedido→venda revalida e bloqueia, então não há impacto financeiro confirmado — é disclosure de leitura.

### Médios

- **A2-SEC-002** — Um gerente com a permissão `usuarios.editar`/`usuarios.deletar` concedida (não é o padrão de fábrica) pode rebaixar ou excluir o admin da própria empresa — o guard da correção anterior só cobre a direção "promover a admin", não "remover um admin existente".
- **A2-SEC-003** — Login do portal do cliente: enviar um CPF/CNPJ sem senha e sem `empresa_id` revela (via status 409 vs 401) se aquele documento está cadastrado como cliente em mais de uma empresa do SaaS — vazamento de metadado cross-tenant sem necessidade de senha.
- **A2-SEC-004** — Rate limiter do login do portal é em memória do processo (não compartilhado via banco como o limiter principal), zera a cada deploy/restart.
- **F2-SEC-001** — `webhook_endpoints.secret` e `contabilidade_config.webhook_secret` ainda em texto puro no banco (os demais segredos do sistema já seguem o padrão de criptografia).
- **B2-DATA-005** — Detalhe de venda (`GET /vendas/detalhe/:id`) usa uma expressão de status mais simples que o resto do sistema, mostrando "Atrasado" em vez de "Parcial em atraso" para parcela parcial vencida — inconsistência de exibição, não de dado.

### Baixos

- **A2-SEC-005/006/007** — Sem header CSP nas respostas do backend (API JSON, risco baixo); HSTS depende de `NODE_ENV=production` estar corretamente configurado no Render (requer confirmação manual); nonce de SSE aparece em log de acesso via query string.
- **D2-SEC-002** — `fidelidade.routes.js POST /acumular` não revalida posse de `cliente_id` antes de gravar movimento (sem corrupção de saldo, mas registro órfão cross-tenant).
- **F2-SEC-003/004** — 3 webhooks Asaas e o callback OAuth do ML sem rate limiter dedicado (só verificação de assinatura, que já é fail-closed).
- **F2-SEC-006/007** — Mesmo padrão do D2-SEC-001 em `orcamento_itens` (unidade/atributos de grade) e `crm.routes.js` (`cliente_id` de oportunidade sem validação de posse — sem vazamento direto confirmado).
- **C2-INT-003** — `checkout.routes.js` reimplementa pela 3ª vez a verificação de webhook Asaas manualmente em vez de usar a função já consolidada em `utils/asaas.js` — não é vulnerável hoje, mas reintroduz risco de drift (foi exatamente esse padrão que causou o bug do `crypto.timingSafeEqual` corrigido na rodada anterior).
- **B2-DATA-006** — `GET /caixa/sessao-ativa` e `POST /caixa/fechar` usam o mesmo nome de campo (`saldo_calculado`) para fórmulas diferentes (um inclui vendas em dinheiro/pix, outro não) — risco de confusão operacional na conferência de caixa, não de corrupção de dado.

---

## 3. Pontos fortes confirmados (pelos 6 agentes, independentemente)

- Anti-enumeração de usuário no login do ERP: mesma mensagem de erro, `bcrypt.compare` dummy, senha validada antes de qualquer checagem de negócio.
- `validarAcessoEmpresa`/isolamento multiempresa: nenhuma rota auditada pula a validação final contra o token antes de tocar dado de outra empresa.
- `requirePermissao` aplicado em toda rota de escrita sem exceção legítima (185 rotas verificadas).
- `ssrfGuard.js`: bloqueio por padrão literal + resolução DNS (mitiga DNS rebinding), cobre IPv4/IPv6 privado e metadata de nuvem; `fetchSeguro()` revalida cada hop de redirect corretamente nos 4 pontos originais.
- Webhooks ML e Shopee fail-closed; idempotência de pedidos ML com advisory lock.
- `api-publica.routes.js`: isolamento por API key rigoroso, validação em lote de `produto_id`/`cliente_id` — modelo exemplar, deveria ser replicado nos pontos do D2-SEC-001.
- CSP do frontend forte (`script-src 'self'` sem `unsafe-inline`, `object-src none`, `frame-ancestors none`); `api.js` com whitelist de hosts para `setApiBaseUrl`.
- Nenhuma injeção SQL encontrada em nenhum dos ~70 arquivos lidos pelos 6 agentes.
- `npm test`: 491/491 passando. `npm audit --omit=dev`: 0 vulnerabilidades.
- Nenhum DROP/TRUNCATE perigoso em nenhuma das 59 migrations; runner idempotente por nome de arquivo, seguro contra deploys concorrentes.

---

## 4. Próximo passo

Aguardando sua decisão sobre:
1. Autorizar o `git push` dos 2 commits pendentes (backend `592a841`, frontend `a451b51`).
2. Se e em que ordem corrigir os 18 achados pendentes da seção 2 — sugiro, se topar seguir, priorizar B2-DATA-001 (crítico, fraude financeira real) e D2-SEC-001 (vazamento de estoque cross-tenant) primeiro.
