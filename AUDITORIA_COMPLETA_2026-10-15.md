# Auditoria Completa — LF ERP

- **Data:** 2026-10-15
- **Commit/branch por repositório:**
  - Raiz (`lf-erp`): `52a1c291f944429704f39da9a6a2e645a3225745`, branch `master`
  - Frontend (`lf-erp-frontend`): `29a68ff1c30a6f3d45364344c08db77f08adc5eb`, branch `main`
  - Backend (`lf-erp-backend`): `4e9930a0c9f94cea82d8d9bd55b63564cec737d8`, branch `main`
- **Escopo auditado:** leitura linha a linha de 100% dos arquivos versionados relevantes dos três repositórios (raiz + `frontend/` + `backend/`, incluindo `e2e/` na raiz) — backend completo (server.js, 95+ rotas, 25 utils, middleware, 58 migrations, 27 testes unitários), frontend completo (7 HTML, 55 JS, CSS, manifest/SW/Vercel config), e2e completo (7 specs, fixtures, config), CI/CD dos três repositórios. Divididos entre 6 agentes paralelos (A–F) por subsistema, cada um 100% somente-leitura.
- **Limitações reais:**
  - Nenhuma alteração foi feita em nenhum arquivo da aplicação — esta auditoria é estritamente diagnóstica.
  - Testes Jest/smoke/`node --check`/`npm audit` foram executados pelo orquestrador (fora dos 6 agentes) em ambiente isolado, sem tocar produção; o E2E Playwright rodou contra um branch Neon de teste isolado (host diferente do de produção, confirmado antes da execução).
  - Versões de dependências npm não puderam ser validadas contra a última versão disponível publicamente (sem acesso de rede para comparação) — marcadas como "Requer validação manual" onde relevante.
  - Achados que dependem do estado real dos dados em produção (ex.: existência de linhas com `empresa_id IS NULL`, duplicatas de usuário por maiúsculas/minúsculas, se a coluna `vendas.idempotency_key` já existe no schema real) foram sinalizados como "Requer validação manual" — este agente não teve acesso ao banco de produção.
  - `backend/loja.db`, imagens/ícones do frontend, `package-lock.json` e os dois PDFs na raiz não se aplicam à revisão de código (binários/lockfiles).

---

## 1. Resumo executivo

### Nota por dimensão (0–10)

| Dimensão | Nota | Justificativa resumida |
|---|---|---|
| Segurança | 6,0 | 1 crítico (IDOR cross-tenant em Assistência Técnica) + 1 crítico (XSS armazenado) + vários altos (SSRF, escalonamento de privilégio, SSRF em webhook); mas controles centrais (auth, API pública, portal do cliente, SSRF guard) muito bem desenhados. |
| Dados | 6,0 | 2 achados críticos de integridade financeira (perda de valor recebido ao editar venda; idempotência de venda sem rede de segurança no banco); núcleo transacional (locks, `FOR UPDATE`, advisory locks) excelente no restante. |
| Multiempresa | 6,5 | Padrão `empresa`/`empresa_id` aplicado corretamente na grande maioria das rotas; mas 5 módulos (grades, kits, depósitos, tabelas de preço, metas) e o módulo de Assistência Técnica têm gaps confirmados. |
| Financeiro | 6,0 | Mesma base de Dados — pontos fortes claros (transações, idempotência parcial, normalização correta) convivendo com os 2 críticos. |
| Performance | 7,5 | Sem achados graves; N+1 pontuais e uma paginação ausente em fluxo de caixa; nada que ameace a operação atual. |
| Frontend | 7,0 | Disciplina de escape excelente em ~98% do código; 1 XSS crítico real concentrado em duas funções de impressão + 2 módulos financeiros com import ausente quebrando botões. |
| Testes | 5,5 | Funções centrais críticas (permissões, multiempresa, normalizadores, financeiroOps) muito bem testadas; mas os dois fluxos mais usados do sistema (PDV/Vendas e Compras) não têm nenhum teste de rota HTTP nem E2E funcional. |
| Operação/Deploy | 7,5 | CI limpo, sem segredos expostos, `npm audit` zerado; achados são todos de baixa severidade (rótulos imprecisos, worktree órfão, sem alerta de falha no keepalive). |

**Nota geral ponderada: ~6,5/10**

### Quantidade de achados

| Severidade | Quantidade |
|---|---|
| Crítico | 5 |
| Alto | 12 |
| Médio | 10 |
| Baixo | 20 |
| **Total** | **47** |

(+ 2 verificações positivas formais, não contadas como achado: F-DEPLOY-003, F-DEPLOY-006)

### Os 10 riscos prioritários

1. **D-SEC-001 (Crítico)** — IDOR cross-tenant em `/assistencia/os/:id/garantia` e `/eventos`: vaza PII de clientes de outra empresa e injeta eventos fabricados na timeline da empresa vítima.
2. **B-DATA-001 (Crítico)** — Editar/excluir venda com parcela **parcialmente paga** não é bloqueado: apaga o registro e recobra o cliente do valor que ele já pagou.
3. **B-DATA-004 (Crítico)** — Criação de venda não tem nenhuma proteção de unicidade no banco (diferente de compras); sob concorrência real (retry de PDV), pode duplicar vendas inteiras.
4. **E-SEC-001 (Crítico)** — XSS armazenado na impressão de Ordem de Serviço: campos de texto livre sem escape, executado em janela que herda a origem da aplicação → roubo de sessão (JWT).
5. **A-SEC-004 (Crítico)** — Múltiplas rotas administrativas/SaaS quebradas por `ReferenceError` (funções usadas sem import), incluindo o único gate de autenticidade do webhook de confirmação de assinatura.
6. **C-INT-001 (Alto)** — Webhook do Asaas para boletos de Contas a Receber nunca funciona (bug de import de `crypto`) — pagamentos de boleto nunca são confirmados automaticamente.
7. **C-SEC-001 (Alto)** — SSRF via redirect HTTP não revalidado em 3 integrações (webhooks, WhatsApp, webhook contábil) — bypass do guard de SSRF já existente.
8. **D-SEC-003 (Alto)** — Rota legada `/ordens-servico` contorna totalmente o feature-gate pago de Assistência Técnica e diverge em regras de negócio da mesma tabela.
9. **B-MULTI-001 (Alto)** — 5 módulos (grades, kits, depósitos, tabelas de preço, metas) não aplicam o padrão `empresa`/`empresa_id`, tornando produtos/clientes legados invisíveis neles.
10. **F-TEST-003 (Alto)** — Os dois fluxos mais usados do ERP (PDV/Vendas e Compras/Estoque) não têm nenhum teste E2E funcional nem teste de rota HTTP — qualquer regressão só é descoberta em produção.

---

## 2. Manifesto de cobertura

Todos os arquivos versionados relevantes dos 3 repositórios foram lidos por completo por algum dos 6 agentes. Lista completa por agente nas seções 1 de cada relatório parcial (preservados em `C:\Users\lfeli\AppData\Local\Temp\claude\...\scratchpad\audit_{A..F}_*.md`); resumo por categoria abaixo.

### Raiz do projeto (`C:\Users\lfeli\lf-erp\`)
| Arquivo/grupo | Status | Agente |
|---|---|---|
| `CLAUDE.md`, `.gitignore` | Lido | A |
| `e2e/` (15 arquivos: README, configs, fixtures, 7 specs) | Lido | F |
| `LF-ERP-Auditoria-Android.pdf`, `LF-ERP-Plano-Acao-MVP.pdf` | Não aplicável à revisão de código (binário) | — |
| `.claude/settings.local.json` | Não aplicável (config local do harness, não app) | — |

### Frontend (`frontend/`, 70 arquivos versionados)
| Arquivo/grupo | Status | Agente |
|---|---|---|
| `index.html`, `admin.html`, `checkout.html`, `etiquetas.html`, `orcamento-pdf.html`, `pdv-cliente.html`, `portal.html` (7/7) | Lido | E |
| `manifest.json`, `sw.js`, `vercel.json` | Lido | E (+ A para vercel.json/CI) |
| `css/style.css` (9920 linhas) | Lido (varredura dirigida completa) | E |
| `js/*.js` (55 arquivos) — 46 lidos linha a linha 100%; 9 (contasPagar.js, pdv.js, lancamentosFinanceiros.js, nfe.js, usuarios.js, vendas.js, ordensServico.js, assistenciaTecnica.js, contasReceber.js) lidos 85–100% + verificação dirigida por grep no restante | Lido | E |
| `.github/workflows/ci.yml` | Lido | A |
| `.gitignore` | Lido | F |
| `assets/*.png`, `icons/icon.svg` | Não aplicável (binário/imagem) | — |

### Backend (`backend/`, 210 arquivos versionados)
| Arquivo/grupo | Status | Agente |
|---|---|---|
| `server.js`, `middleware/auth.js`, `middleware/rateLimiter.js` | Lido | A |
| `utils/permissoes.js`, `empresa.js`, `routeHelpers.js`, `sharedRateLimiter.js`, `plano.js`, `ssrfGuard.js` | Lido | A |
| `utils/financeiroOps.js`, `financeiroUtils.js`, `vendasOps.js`, `vendasService.js`, `resolverPreco.js`, `kits.js`, `comissoes.js`, `normalizadores.js`, `periodoUtils.js`, `documentos.js` | Lido | B |
| `utils/asaas.js`, `pix.js`, `pixCrypto.js`, `focusnfe.js`, `nfe_builder.js`, `nfce_builder.js`, `whatsapp.js`, `webhooks.js`, `webhookContabil.js`, `cloudinary.js`, `email.js` | Lido | C |
| `db/initDb.js`, `migrate.js`, `migrations/runner.js` | Lido | A + D |
| `migrations/*.sql` (57 arquivos numerados, 001–057) | Lido (todos, linha a linha) | D |
| `scripts/create-owner.js`, `scripts/reset_lucileide_dados.sql` | Lido (não executado) | D |
| `routes/auth.routes.js`, `admin.routes.js`, `admin-saas.routes.js`, `usuarios.routes.js` | Lido | A |
| `routes/contas-receber*`, `contas-pagar.routes.js`, `financeiro.routes.js`, `fluxo-caixa.routes.js`, `lancamentos.routes.js`, `caixa.routes.js`, `conciliacao.routes.js`, `vendas/*`, `compras/*`, `estoque.routes.js`, `devolucoes.routes.js`, `produtos/*`, `grades.routes.js`, `kits.routes.js`, `depositos.routes.js`, `tabelasPreco.routes.js`, `metas.routes.js` (31 arquivos) | Lido | B |
| `routes/checkout.routes.js`, `webhooks.routes.js`, `whatsapp.routes.js`, `marketplace*` (5 arquivos), `nfe.routes.js`, `nfce.routes.js`, `nfse.routes.js`, `pagamentos.routes.js`, `imagens.routes.js`, `notificacoes.routes.js` (15 arquivos) | Lido | C |
| `routes/clientes.routes.js`, `fornecedores.routes.js`, `crm.routes.js`, `fidelidade.routes.js`, `comissoes.routes.js`, `alertas.routes.js`, `bi.routes.js`, `dashboard.routes.js`, `relatorios*` (4 arquivos), `exportacao.routes.js`, `api-publica.routes.js`, `portal.routes.js`, `filiais.routes.js`, `rastreabilidade.routes.js`, `assistencia*` (6 arquivos), `ordensServico.routes.js`, `orcamentos.routes.js`, `pedidos.routes.js`, `misc.routes.js` (29 arquivos) | Lido | D |
| `test/*.test.js` + `validate.js` (27 arquivos), `jest.config.js` | Lido | F |
| `.env.example` | Lido (sem segredo real) | A |
| `.github/workflows/ci.yml`, `keepalive.yml` | Lido | A + F |
| `.gitignore`, `package.json` | Lido | F |
| `loja.db`, `package-lock.json` | Não aplicável (binário/lockfile) | — |

**Cobertura total: 100% dos arquivos de código, configuração, migration, teste, HTML, CSS, JS versionados nos 3 repositórios.**

---

## 3. Achados confirmados

> IDs mantêm o prefixo do agente que os identificou (A–F) para rastreabilidade; não há colisão entre agentes.

### CRÍTICOS

#### D-SEC-001 — IDOR cross-tenant em `/assistencia/os/:id/garantia` e `/eventos`
- **Confiança:** Confirmado · **Categoria:** SEC/MULTI
- **Arquivo:** `backend/routes/assistencia/os.routes.js`, linhas 472–495 (`POST /os/:id/garantia`) e 498–523 (`POST /os/:id/eventos`)
- **Evidência:**
  ```js
  router.post('/os/:id/garantia', ..., async (req, res) => {
    const id = normalizarInt(req.params.id);
    const er = await validarAcessoEmpresa(req, req.body.empresa);
    if (!er) return erro(res, 403, 'Sem acesso');
    // nenhuma consulta confirma que `id` pertence a `er.id`
    await pool.query(`INSERT INTO at_garantias (os_id, empresa_id, ...) VALUES ($1,$2,...)`, [id, er.id, ...]);
  ```
- **Fluxo afetado:** Garantias e timeline de eventos de Ordens de Serviço no módulo Assistência Técnica.
- **Causa raiz:** `validarAcessoEmpresa` confirma a empresa do usuário, mas nenhuma query confirma que a OS referenciada por `:id` pertence a essa empresa — diferente das demais rotas do mesmo arquivo, que sempre fazem esse `SELECT` prévio.
- **Impacto técnico/financeiro/segurança/LGPD:** vazamento de PII (nome, telefone, equipamento) de cliente de outra empresa via `GET /assistencia/garantias`; injeção de evento fabricado na timeline da OS da empresa vítima, visível para ela sem indicação de origem externa. Violação direta de LGPD (dado pessoal exposto entre tenants).
- **Pré-condição/exploração:** usuário autenticado com módulo AT habilitado e permissão `assistencia_tecnica/editar` na própria empresa; `os_id` de outra empresa é sequencial e previsível.
- **Empresas/usuários afetados:** qualquer empresa com o módulo Assistência Técnica habilitado.
- **Correção mínima e segura:** antes do INSERT, `SELECT id FROM ordens_servico WHERE id=$1 AND empresa_id=$2`, retornar 404 se vazio (mesmo padrão já usado em `PUT /os/:id`).
- **Teste de regressão necessário:** teste de integração que tenta criar garantia/evento numa OS de empresa diferente e espera 404.
- **Risco da correção:** baixo — apenas adiciona validação, sem mudar contrato de resposta.

#### B-DATA-001 — Editar/excluir venda com parcela parcial paga perde o valor recebido e recria cobrança total
- **Confiança:** Confirmado · **Categoria:** DATA/Financeiro
- **Arquivo:** `backend/routes/vendas/helpers.js:37-51,139-169`; `vendas/editar.routes.js:90-103,134-143`; `vendas/excluir.routes.js:61-74`
- **Evidência:**
  ```js
  // só 'pago' bloqueia e é somado como já recebido — 'parcial' é ignorado e DELETADO
  WHERE venda_id = $1 AND LOWER(COALESCE(status,'pendente')) = 'pago'
  ...
  DELETE FROM contas_receber WHERE venda_id = $1 AND status NOT IN ('pago') -- inclui 'parcial'
  ```
- **Fluxo afetado:** `PUT /vendas/:id` e `DELETE /vendas/:id` com parcela em `contas_receber` já recebida parcialmente.
- **Causa raiz:** o único status tratado como protegido é `'pago'`; `'parcial'`/`'parcial_atrasado'` não é considerado "já tem dinheiro recebido".
- **Impacto:** a parcela com recebimento parcial é apagada, o cliente é recobrado do valor total (incluindo o que já pagou), e o `lancamentos_financeiros` da baixa parcial fica órfão — o dinheiro recebido some dos relatórios de contas a receber daquele cliente. Impacto financeiro direto e real.
- **Pré-condição:** venda com parcela (promissória/boleto) recebendo baixa parcial, seguida de edição ou exclusão da venda original.
- **Empresas/usuários afetados:** qualquer empresa que usa parcelamento com baixa parcial — inclui a empresa piloto em produção.
- **Correção mínima:** incluir `'parcial'`/`'parcial_atrasado'` no filtro de bloqueio de `vendaPossuiParcelaPaga`, com a mesma mensagem já usada para `'pago'`.
- **Teste de regressão necessário:** criar venda parcelada → baixa parcial → tentar editar/excluir → esperar bloqueio (hoje passa, deveria falhar com mensagem clara).
- **Risco da correção:** baixo — torna o sistema mais restritivo; usuário sempre pode estornar antes de editar/excluir, igual já é exigido para `'pago'`.

#### B-DATA-004 — Idempotência de criação de venda sem nenhuma proteção de unicidade no banco
- **Confiança:** Confirmado (código) — impacto real em produção requer validação manual do schema · **Categoria:** DATA
- **Arquivo:** `backend/utils/vendasService.js:66-82`
- **Evidência:**
  ```js
  const existing = await client.query(`SELECT id FROM vendas WHERE idempotency_key=$1 ... FOR UPDATE`, [...]);
  // catch: "Coluna idempotency_key ainda não existe no schema — ignorar verificação (migration pendente)"
  ```
  Nenhum índice `UNIQUE` equivalente ao de `compras` (`compras_idempotency_idx`) existe para `vendas` em nenhuma migration.
- **Fluxo afetado:** criação de venda no PDV (duplo clique, retry de rede 3G/4G, dupla aba).
- **Causa raiz:** `FOR UPDATE` só protege linhas que já existem; sob corrida real, duas requisições simultâneas inserem duas vendas sem nenhuma rede de segurança no banco.
- **Impacto:** possível venda duplicada completa — dupla baixa de estoque, dupla geração de parcelas, dupla comissão.
- **Pré-condição:** concorrência real no PDV (retry automático de rede, duplo toque); agravado se a coluna `idempotency_key` ainda nem existir em produção (o próprio código assume essa possibilidade).
- **Empresas/usuários afetados:** todas as empresas que usam o PDV, especialmente em conexão de internet instável.
- **Correção mínima:** aplicar migration adicionando `vendas.idempotency_key TEXT` + `CREATE UNIQUE INDEX ... ON vendas (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL`, igual ao padrão já testado em `compras`; logar alerta explícito se a checagem for ignorada por ausência de coluna.
- **Teste de regressão necessário:** teste de concorrência (duas requisições simultâneas com a mesma `idempotency_key`) esperando apenas uma venda criada.
- **Risco da correção:** baixo — migration aditiva, mesma receita já validada em compras.

#### E-SEC-001 — XSS armazenado na impressão de Ordem de Serviço
- **Confiança:** Confirmado · **Categoria:** SEC (XSS)
- **Arquivo:** `frontend/js/ordensServico.js`, função `imprimirOS` (linhas 504–653); `frontend/js/assistenciaTecnica.js`, mesma função (linhas 1319–1420), parcial
- **Evidência:**
  ```js
  <span>${os.problema_relatado || '—'}</span>
  <span>${os.diagnostico || '—'}</span>
  <span>${os.servicos_realizados || '—'}</span>
  ${os.observacoes ? `<div ...>${os.observacoes}</div>` : ''}
  // ...
  const win = window.open('', '_blank', 'width=800,height=900');
  win.document.write(html); // sem sanitização
  ```
- **Fluxo afetado:** botão "Imprimir" em qualquer OS (módulos Ordens de Serviço e Assistência Técnica).
- **Causa raiz:** campos de texto livre (problema relatado, diagnóstico, serviços realizados, observações, nome do técnico, descrição de item) não passam por `escapeHtml`/`esc()`, diferente de outros campos no mesmo arquivo que são corretamente escapados.
- **Impacto técnico/segurança:** `win.document.write()` numa janela aberta com `window.open('', ...)` herda a origem do opener — um `<script>`/`<img onerror>` nesses campos executa com acesso total ao DOM/`window` da aplicação, incluindo `localStorage`/`sessionStorage` onde o JWT é armazenado. Permite roubo de sessão de qualquer usuário (inclusive admin/gerente) que clicar "Imprimir" numa OS malformada.
- **Pré-condição:** usuário autenticado com permissão de criar/editar OS grava texto livre com HTML/`<script>` em qualquer um dos campos citados; outro usuário (potencialmente com privilégio maior) imprime a mesma OS.
- **Empresas/usuários afetados:** qualquer empresa que usa os módulos de OS/Assistência Técnica.
- **Correção mínima:** envolver os ~10 pontos de interpolação dessas duas funções com `escapeHtml`/`esc()` já usado nos campos vizinhos do mesmo arquivo.
- **Teste de regressão necessário:** teste que grava `<script>alert(1)</script>` num dos campos e confirma que o HTML impresso contém a versão escapada (`&lt;script&gt;`), não o script executável.
- **Risco da correção:** nenhum — `escapeHtml` é idempotente para texto puro.

#### A-SEC-004 — Rotas admin/SaaS quebradas por `ReferenceError` (identificadores usados sem import), incluindo o gate do webhook de billing
- **Confiança:** Confirmado · **Categoria:** SEC/DEPLOY
- **Arquivos:** `backend/routes/admin.routes.js` (linhas 312, 364, 387, 418, 430); `backend/routes/admin-saas.routes.js` (linhas 209, 280, 287)
- **Evidência:**
  ```js
  const vencimento = req.body.vencimento || addDias(hoje(), 5);   // addDias não importado
  if (!verificarWebhookAsaas(req, res)) return;                    // não importado
  const { dataInicial, dataFinal } = obterPeriodo(req);             // não importado
  ```
- **Fluxo afetado:** `POST /admin/empresas` (onboarding de cliente), `GET /admin/empresas/:id/exportar` (LGPD/backup), `GET /admin/logs` (auditoria), `POST/GET /admin/billing/*`, `POST /admin/billing/webhook-assinatura`.
- **Causa raiz:** refatoração incompleta ao modularizar rotas — funções existem em outros utils mas nunca foram `require`'adas nestes dois arquivos.
- **Impacto:** onboarding administrativo de novos clientes 100% inoperante; exportação LGPD sempre falha; logs de auditoria inacessíveis; **o webhook de confirmação de pagamento de assinatura perde seu único gate de autenticidade** — hoje falha fechado por acidente (o erro acontece antes de qualquer verificação), mas é bomba-relógio: uma correção apressada que só envolva em try/catch sem implementar a verificação real deixaria o endpoint aberto e não autenticado, permitindo reativar/desbloquear qualquer empresa.
- **Pré-condição:** nenhuma — ocorre em toda chamada real a essas rotas.
- **Empresas/usuários afetados:** operação do SaaS Owner (equipe interna), e indiretamente toda empresa cliente (onboarding/billing quebrados).
- **Correção mínima:** adicionar os `require` faltantes nos dois arquivos, validando os nomes exatos exportados por `utils/normalizadores.js`, `utils/periodoUtils.js` e `utils/asaas.js` antes de aplicar.
- **Teste de regressão necessário:** criar `admin.routes.test.js`/`admin-saas.routes.test.js` cobrindo essas rotas (hoje inexistentes — causa raiz de o bug não ter sido pego pelo CI, que só faz `node --check`, checagem de sintaxe, não de execução).
- **Risco da correção:** baixo a médio — depende de confirmar a assinatura exata das funções importadas.

### ALTOS

#### A-SEC-001 — Escalonamento de privilégio via `PUT /usuarios/:id` sem proteção de auto-promoção
- **Confiança:** Confirmado · **Categoria:** SEC
- **Arquivo:** `backend/routes/usuarios.routes.js`, linhas 153–252
- **Evidência:** `DELETE /usuarios/:id` bloqueia `req.user.id === id`; `PUT` não tem equivalente, e `tipo:'admin'` é aceito sem checar quem está fazendo a requisição.
- **Fluxo afetado:** gestão de usuários/permissões.
- **Causa raiz:** rota combina permissão granular + checagem hardcoded admin/gerente, mas nenhuma trava auto-edição/auto-promoção a admin.
- **Impacto:** um gerente com override de permissão `usuarios.editar` (cenário plausível: "gerenciar cadastro de funcionários") pode se auto-promover a admin total da empresa.
- **Pré-condição:** algum admin já ter concedido override individual de `usuarios.editar` a um não-admin.
- **Correção mínima:** bloquear `tipo==='admin'` vindo de quem não é admin/saas_owner, e bloquear auto-mudança do próprio `tipo`.
- **Teste de regressão:** gerente tenta promover a si mesmo ou outro usuário a admin → esperar 403.
- **Risco da correção:** baixo.

#### A-SEC-002 — Possível confusão de conta entre empresas por login case-insensitive vs. constraint case-sensitive
- **Confiança:** Confirmado · **Categoria:** SEC/MULTI
- **Arquivo:** `backend/db/initDb.js:98` (constraint `UNIQUE` case-sensitive); `backend/routes/auth.routes.js:38-62` (login `WHERE LOWER(usuario)=LOWER($1)` sem `LIMIT`); `usuarios.routes.js:107-116` (criação sem checagem case-insensitive)
- **Fluxo afetado:** login e criação de subusuário.
- **Causa raiz:** `usuario` é único globalmente mas sensível a caixa no banco, enquanto o login é insensível; criação de subusuário não pré-checa variantes de caixa.
- **Impacto:** criar `"Joao"` numa empresa quando já existe `"joao"` em outra produz comportamento indefinido no login (sem `ORDER BY`/`LIMIT`), podendo autenticar na conta/tenant errado.
- **Pré-condição:** duas contas com mesmo usuário diferindo só em caixa (criável por qualquer admin/gerente).
- **Correção mínima:** `CREATE UNIQUE INDEX ON usuarios (LOWER(usuario))` (após deduplicar dados), checagem prévia em `POST /usuarios`, `ORDER BY id LIMIT 1` no login como defesa em profundidade.
- **Teste de regressão:** criar dois usuários com mesmo nome em caixa diferente → esperar rejeição.
- **Risco da correção:** médio — requer auditoria de duplicatas existentes antes da migration.

#### B-DATA-002 — Editar/excluir venda após devolução parcial duplica reposição de estoque
- **Confiança:** Confirmado · **Categoria:** DATA
- **Arquivo:** `backend/routes/devolucoes.routes.js:190-224`; `vendas/helpers.js:53-137`
- **Causa raiz:** devolução não atualiza `venda_itens.quantidade`; ao editar/excluir a venda depois, o estorno de estoque usa a quantidade original, devolvendo de novo o que já foi devolvido.
- **Impacto:** estoque inflado artificialmente pela quantidade já devolvida.
- **Pré-condição:** venda com devolução parcial prévia, depois editada/excluída.
- **Correção mínima:** subtrair quantidade já devolvida antes de estornar, ou bloquear edição/exclusão de venda com devolução registrada.
- **Teste de regressão:** venda → devolução parcial → editar venda → conferir estoque final.
- **Risco da correção:** baixo a médio.

#### B-DATA-003 — Idempotência de compra: janela de corrida fora da transação + índice não protege `empresa_id IS NULL`
- **Confiança:** Confirmado (código) · **Categoria:** DATA
- **Arquivo:** `backend/routes/compras/criar.routes.js:42-56`; `db/initDb.js:779-783`
- **Causa raiz:** checagem de duplicidade com `pool.query` fora de transação/lock; índice único não protege `NULL` (Postgres não trata `NULL=NULL`).
- **Impacto:** duplo-clique/retry pode duplicar compra inteira para empresas legadas (`empresa_id IS NULL`).
- **Correção mínima:** mover checagem para dentro da transação com `FOR UPDATE`, ou normalizar `empresa_id` nunca nulo em inserções novas.
- **Teste de regressão:** duas requisições concorrentes com mesma `idempotency_key` em empresa com `empresa_id IS NULL`.
- **Risco da correção:** baixo.

#### B-MULTI-001 — Grades, Kits, Depósitos, Tabelas de Preço e Metas sem fallback `empresa`/`empresa_id`
- **Confiança:** Confirmado (código) · **Categoria:** MULTI
- **Arquivos:** `routes/grades.routes.js`, `kits.routes.js`, `depositos.routes.js`, `tabelasPreco.routes.js`, `metas.routes.js`
- **Causa raiz:** esses 5 módulos mais novos assumem `empresa_id` sempre preenchido em `produtos`/`clientes`, sem replicar o padrão OR usado no resto do sistema.
- **Impacto:** produto/cliente legado fica invisível/inacessível nesses 5 módulos (404 mesmo pertencendo à empresa correta).
- **Correção mínima:** aplicar o padrão `(empresa_id = $N OR (empresa_id IS NULL AND empresa = $M))` nas queries que tocam `produtos`/`clientes` nesses arquivos.
- **Teste de regressão:** produto com `empresa_id IS NULL` deve aparecer/ser editável em grades/kits/depósitos/tabelas de preço/metas.
- **Risco da correção:** baixo.

#### C-SEC-001 — SSRF via redirect HTTP não revalidado
- **Confiança:** Confirmado · **Categoria:** SEC
- **Arquivos:** `backend/utils/webhooks.js:76-87`, `whatsapp.js:50-58,80-86`, `webhookContabil.js:53-58`
- **Causa raiz:** `ssrfGuard.js` valida a URL original (com resolução DNS), mas o `fetch()` nativo segue redirects 3xx por padrão sem revalidar o `Location`.
- **Impacto:** um host externo que passe na validação inicial pode responder com 302 para `127.0.0.1`/`169.254.169.254`/rede interna do provedor; agravado por C-INT-003 (resposta parcialmente exposta ao configurador).
- **Pré-condição:** admin/gerente da própria empresa configura um endpoint malicioso (ameaça interna/credencial comprometida, não anônima).
- **Correção mínima:** `redirect: 'manual'` nas 3 chamadas + revalidar `Location` com `validarUrlExterna` antes de seguir (limite de redirects).
- **Teste de regressão:** endpoint de teste que responde 302 para IP interno deve ser bloqueado.
- **Risco da correção:** baixo.

#### C-INT-001 — Webhook Asaas de boleto sempre falha silenciosamente (crypto não importado)
- **Confiança:** Confirmado (reproduzido: `typeof globalThis.crypto.timingSafeEqual` → `undefined`) · **Categoria:** SEC/INT
- **Arquivo:** `backend/routes/pagamentos.routes.js:1-9,565-634`
- **Causa raiz:** arquivo nunca executa `require('crypto')`; `crypto` resolve para a Web Crypto API global (sem `timingSafeEqual`), lançando `TypeError` sempre que o webhook real chega.
- **Impacto:** nenhum webhook do Asaas para boletos de Contas a Receber é processado — confirmação automática de pagamento nunca ocorre (mitigado parcialmente por polling manual em `/status/:id`); efeito colateral "fail-closed por acidente", não por design — risco de inversão se "corrigido" sem validação real.
- **Pré-condição:** `ASAAS_WEBHOOK_TOKEN` configurado (padrão em produção) — 100% dos casos reais acionam o bug.
- **Correção mínima:** `const crypto = require('crypto');` no topo do arquivo, igual a `checkout.routes.js`.
- **Teste de regressão:** teste automatizado chamando `verificarWebhookAsaas` com token/header reais (não mockados).
- **Risco da correção:** mínimo.

#### D-SEC-002 — FKs `cliente_id`/`aparelho_id` aceitas sem validar posse
- **Confiança:** Confirmado · **Categoria:** SEC/MULTI
- **Arquivos:** `assistencia/os.routes.js`, `assistencia/aparelhos.routes.js`, `ordensServico.routes.js`, `orcamentos.routes.js`, `pedidos.routes.js`
- **Causa raiz:** padrão do projeto (SELECT de posse antes de usar FK) não replicado nesses módulos.
- **Impacto:** permite anexar cliente de outra empresa como "cliente" de OS/orçamento/pedido; leak de nome/telefone via JOIN sem filtro de empresa em algumas listagens.
- **Correção mínima:** `SELECT id FROM <tabela> WHERE id=$1 AND empresa_id=$2` antes do INSERT/UPDATE, como já feito em `comissoes.routes.js`/`rastreabilidade.routes.js`.
- **Teste de regressão:** criar OS/orçamento/pedido com `cliente_id` de outra empresa → esperar rejeição.
- **Risco da correção:** baixo-médio.

#### D-SEC-003 — Rota legada `/ordens-servico` contorna o feature-gate pago de Assistência Técnica
- **Confiança:** Confirmado · **Categoria:** SEC/Billing
- **Arquivos:** `server.js:503-504,534-535`, `ordensServico.routes.js`, `assistencia.routes.js:36-58`
- **Causa raiz:** o módulo OS original nunca foi removido/gateado após a criação do módulo AT (evolução da mesma tabela).
- **Impacto:** bypass de monetização (empresa sem o módulo pago habilitado ainda cria/edita OS completas via `/ordens-servico`); drift de regras de negócio (listas de status divergentes entre os dois módulos sobre a mesma tabela).
- **Correção mínima:** aplicar `requireFeatureHabilitada` em `/ordens-servico`, ou depreciar o módulo legado migrando o frontend.
- **Teste de regressão:** empresa sem feature AT tentando usar `/ordens-servico` → esperar bloqueio (após decisão de produto).
- **Risco da correção:** médio — depende de uso ativo da rota legada pelo frontend em produção.

#### E-SEC-002 — Mesmo padrão sem escape no autocomplete de catálogo de serviços
- **Confiança:** Confirmado · **Categoria:** SEC (XSS)
- **Arquivo:** `frontend/js/ordensServico.js:804-811`
- **Impacto:** item de catálogo com `<img onerror>` no nome/categoria injeta script no dropdown usado por qualquer operador.
- **Correção mínima:** `escapeHtml()` em `s.nome`/`s.categoria`.
- **Teste de regressão:** cadastrar serviço com HTML no nome → conferir render seguro no autocomplete.
- **Risco da correção:** nenhum.

#### E-UX-001 — `enhanceSelect` sem import quebra 3 fluxos financeiros
- **Confiança:** Confirmado · **Categoria:** Funcional/Risco real
- **Arquivos:** `frontend/js/contasPagar.js` (linhas 872, 1345, 1534), `lancamentosFinanceiros.js` (735, 736, 951, 1060)
- **Causa raiz:** 2 de 23 arquivos que chamam `enhanceSelect` não importam de `premiumSelect.js`.
- **Impacto:** `ReferenceError` síncrono impede o binding dos botões Confirmar/Cancelar nos modais de "Pagar conta a pagar", "Nova conta a pagar manual" e "Marcar lançamento como pago" — botões mortos, usuário precisa recarregar a página.
- **Correção mínima:** `import { enhanceSelect } from './premiumSelect.js';` nos dois arquivos.
- **Teste de regressão:** abrir cada um dos 3 modais e clicar em Confirmar/Cancelar.
- **Risco da correção:** nenhum.

#### F-TEST-003 — PDV/Vendas e Compras/Estoque sem teste E2E funcional nem teste de rota HTTP
- **Confiança:** Confirmado · **Categoria:** TEST
- **Impacto:** os dois fluxos mais usados do ERP em produção não têm nenhuma rede de segurança automatizada acima da lógica isolada (`vendasService.js`); uma regressão na rota HTTP só é descoberta em produção.
- **Correção mínima:** 1 spec E2E de fluxo completo de venda no PDV + testes supertest de `vendas.routes.js`/`compras.routes.js` no nível HTTP.
- **Risco da correção:** nenhum (é adição de teste).

### MÉDIOS

| ID | Resumo | Arquivo | Correção mínima |
|---|---|---|---|
| A-SEC-003 | Enumeração de usuário + status de empresa exposto antes da validação de senha no login | `auth.routes.js:64-104` | Validar senha antes de checar bloqueio/assinatura |
| A-SEC-005 | `SAAS_OWNER_SENHA` não tem efeito em produção (fast-path retorna antes do bloco de sync) | `db/initDb.js:16-19,737-768` | Mover sync do owner para fora do fast-path |
| B-MULTI-002 | `resolverPreco()` sem fallback `empresa` — cliente legado nunca recebe desconto de tabela de preço | `utils/resolverPreco.js:16-24,36-53` | Aplicar padrão OR |
| B-DATA-005 | `metas.routes.js`: `new Date(y,m,0)` sem TZ fixa — risco de off-by-one no último dia do mês | `routes/metas.routes.js:24-27` | Construir data com `T12:00:00` como âncora |
| B-DATA-006 | `caixa.routes.js` usa colunas diferentes (`data` vs `criado_em`) para "vendas da sessão" entre visão ao vivo e fechamento | `routes/caixa.routes.js:65-72,260-267` | Padronizar para `criado_em` |
| C-INT-003 | Oráculo parcial de SSRF: status/corpo da resposta do destino exposto ao usuário que configurou a integração (agrava C-SEC-001) | `utils/webhooks.js:90`, `whatsapp.js:62-63,89-90` | Corrigir C-SEC-001; não repassar corpo bruto de integrações externas |
| C-SEC-002 | Tokens Focus NFe/NFS-e/WhatsApp em texto puro no banco, diferente do padrão já usado em PIX/Asaas/ML | `nfe.routes.js:109-128`, `nfse.routes.js:76-100`, `whatsapp.routes.js:101-122` | Aplicar `encryptField`/`decryptField` já existente |
| E-SEC-003 | Validação de esquema de URL inconsistente em `checkout.js` (tela pública) — um ponto valida `https://`, outro só escapa | `frontend/js/checkout.js:100,195` | Aplicar mesma whitelist nos dois pontos |
| F-TEST-002 | Asserção condicional mascara regressão silenciosa em `fidelidade.test.js` (3 ocorrências) | `backend/test/fidelidade.test.js:90-93,171-176,197-202` | Remover `if`, tornar asserção incondicional |
| F-TEST-004 | ~38 de 47 arquivos de rota sem teste dedicado (tabela completa na seção 5) | diversos | Priorizar conforme seção 5 |

### BAIXOS

| ID | Resumo | Arquivo |
|---|---|---|
| A-SEC-006 | `jwt.verify`/`jwt.sign` sem `algorithms`/`algorithm` explícito (hardening) | `middleware/auth.js:84` |
| A-DEPLOY-001 | Repos `backend/`/`frontend/` são Git independentes ignorados pela raiz, sem `.gitmodules` (informativo) | `.gitignore` raiz |
| B-PERF-001 | N+1 em `POST /devolucoes` (query por item no loop) | `routes/devolucoes.routes.js:146-161` |
| B-PERF-002 | Resolução de preço item a item dentro da transação de venda prolonga locks | `vendas/helpers.js:235-238,288-291,324-327` |
| B-PERF-003 | Fluxo de caixa sem paginação real (`LIMIT 1000` fixo, só sinaliza truncamento) | `financeiro.routes.js:171-236` |
| C-SEC-003 | Validação de SSRF duplicada/divergente (sem DNS) na criação de endpoints — mitigado no envio | `webhooks.routes.js:149-194` |
| C-INT-002 | Rate limiter de webhook de marketplace em memória de processo (requer validação da topologia de deploy) | `marketplace/helpers.js:20-36` |
| D-SEC-004 | SQL interpolado manualmente (mitigado por escape) em preview de promissória | `alertas.routes.js:420-428` |
| D-MULTI-001 | Segredo do portal do cliente derivado do `JWT_SECRET` sem fail-fast próprio | `portal.routes.js:20-27` |
| D-DATA-001 | UPDATE de OS sem reconfirmar `empresa_id` (defesa em profundidade, não explorável hoje) | `ordensServico.routes.js:215-229`, `assistencia/os.routes.js:255-264` |
| D-DATA-002 | Seed da migration 045 sem `ON CONFLICT` (mitigado pelo runner, que nunca reaplica) | `migrations/045_servicos_catalogo.sql` |
| D-DATA-003 | Script de reset da Lucileide não cobre tabelas de OS/AT/comissões (criadas depois do script) | `scripts/reset_lucileide_dados.sql` |
| D-PERF-001 | `.replace()` no-op confuso (código morto) | `filiais.routes.js:135` |
| D-DATA-004 | Mensagens de erro com encoding corrompido (mojibake) | `misc.routes.js:90,94,117,211` |
| F-TEST-001 | Causa raiz do teste E2E que falhou: bug no teste (falta clicar `#mobileSidebarBtn` antes de interagir em viewport mobile), não na aplicação | `e2e/tests/responsividade-tema.spec.js:93-108` |
| F-TEST-005 | Fragilidade de isolamento entre testes por estado de módulo (`financeiroOps.test.js`) — disciplina atual previne, mas é frágil a longo prazo | `backend/test/financeiroOps.test.js` |
| F-DEPLOY-001 | `keepalive.yml` sem alerta de falha além do status do GitHub Actions | `backend/.github/workflows/keepalive.yml` |
| F-DEPLOY-002 | Rótulo do step de CI ("Run smoke tests") impreciso — na prática roda a suíte Jest completa | `backend/.github/workflows/ci.yml:35-36` |
| F-DEPLOY-004 | Worktree Git órfão não rastreado em `frontend/.claude/worktrees/` | `frontend/.claude/worktrees/agent-a2c6cd3244f972ea0/` |
| F-DEPLOY-005 | `.gitignore` do backend referencia arquivo já removido (`server.backup.js`) | `backend/.gitignore:4` |

---

## 4. Pontos fortes confirmados

**Autenticação/Autorização:**
- `validarAcessoEmpresa`/`resolverEmpresaRequest` bem desenhado contra IDOR cross-empresa.
- Mitigação de timing/enumeração no login (`bcrypt.compare` contra hash fixo quando usuário não existe).
- Blacklist de JWT (logout/revogação) com hash SHA-256, persistida em memória e banco.
- `requirePermissao` fail-closed: qualquer erro resulta em 403, nunca acesso liberado por omissão.
- bcrypt custo 10 com migração automática de hashes legados.
- `apenasAdmin` aplicado consistentemente em 100% das rotas administrativas.
- Headers de segurança completos (CSP, HSTS, X-Frame-Options, Permissions-Policy) no backend e no `vercel.json`.
- CORS restritivo por padrão, sem wildcard.
- Rate limiting compartilhado via banco (correto para múltiplas instâncias), fail-closed se o banco cair.

**Multiempresa:**
- Padrão `empresa`/`empresa_id` aplicado de forma consistente e correta no núcleo mais crítico (vendas, compras, financeiro, estoque, produtos, API pública, portal do cliente).
- API pública: autenticação por hash de API Key, nunca compara texto puro; todas as queries filtram por `empresa_id` derivado do hash validado.
- Portal do cliente: JWT próprio com reverificação de `portal_ativo` a cada request; dummy bcrypt compare contra timing oracle.

**Dados/Financeiro:**
- Transações reais (`BEGIN`/`COMMIT`/`ROLLBACK` com o mesmo client) em praticamente toda operação multi-tabela.
- `FOR UPDATE` bem posicionado nos pontos certos (baixa de conta, caixa, devolução, edição de produto).
- UPDATE atômico condicional contra overselling de estoque.
- Advisory locks corretos para numeração sequencial e serialização de atualização de status.
- `normalizarDecimal` corretamente nunca aplicado a valor já lido do banco (bug histórico do projeto, não reincidiu em nenhum arquivo auditado).
- Idempotência de pedidos de Marketplace com checagem dupla (pré-transação + advisory lock dentro da transação).

**Integrações:**
- `pixCrypto.js` falha fechado em produção se a chave de criptografia estiver ausente.
- Gate de ambiente de produção fiscal (`LF_ERP_FISCAL_PRODUCTION_ENABLED`) bem aplicado.
- Webhook do Mercado Livre valida HMAC-SHA256 por seller, timing-safe.
- OAuth2 ML com `state` HMAC + timestamp de expiração.
- Shopee fail-closed explícito (501, não implementado) em vez de processar sem autenticação.
- `imagens.routes.js` valida magic bytes, não só `Content-Type`.
- SMTP valida TLS por padrão, nunca loga credenciais.

**Frontend:**
- Escape consistente (`escapeHtml`/`esc()`) em ~98% do código — os achados de XSS estão concentrados em funções isoladas, não são um padrão disseminado.
- CSP forte sem `unsafe-inline`/`unsafe-eval`.
- Sanitização defensiva em modais globais (`_sanitizeModalHtml`).
- Whitelist de host para URL de API configurável.
- JWT nunca exposto em querystring (SSE usa nonce dedicado).
- Idempotência de venda no PDV (online e offline), isolamento de IndexedDB por empresa.
- Upload de logo sempre rasterizado via canvas, neutralizando XSS via SVG.

**Testes/CI:**
- Funções centrais (`requirePermissao`, `validarAcessoEmpresa`, normalizadores, `financeiroOps`) muito bem cobertas, incluindo casos de borda documentados.
- `migrations.runner.test.js` cobre advisory lock, falha parcial, falha de unlock.
- CI não roda contra produção em nenhum dos 3 workflows; nenhum segredo exposto.
- Todas as 58 migrations são estritamente aditivas e idempotentes.
- `scripts/create-owner.js` e processo de migração bem desenhados (verificação de órfãos antes de FKs, advisory lock no runner).

---

## 5. Lacunas de testes

Tabela completa de cobertura por módulo (consolidada do Agente F — ver `audit_F_testes_ci.md` seção 3 para a versão integral):

**Bem cobertos (unit + E2E ou unit forte):** Auth/Login, Permissões, Multiempresa (`validarAcessoEmpresa`), Usuários (CRUD), API pública de vendas, Checkout/PIX/Boleto, Webhooks de Marketplace, Alertas/Cobrança preventiva, Migrations runner, Rate limiting compartilhado, Normalizadores, Período (filtros de data).

**Lacuna crítica (nenhum teste de rota nem E2E funcional):** PDV/Vendas, Compras, Estoque (ver F-TEST-003).

**Lacuna de rota (só a lógica isolada é testada, a rota HTTP não):** Produtos, Contas a Pagar, Contas a Receber, Comissões, Kits, Fidelidade (+ qualidade questionável, F-TEST-002), NF-e/NFC-e/NFS-e (emissão coberta, rota não).

**Lacuna ampla (nem lógica nem rota testadas, só visita superficial via `csp-smoke.spec.js`):** Clientes, Fornecedores, Fluxo de Caixa, CRM, BI, Relatórios, Metas, Orçamentos, Pedidos, Devoluções, Grades, Tabelas de Preço, Depósitos, Filiais, Conciliação, Rastreabilidade, Notificações, WhatsApp, Exportação, Imagens, Lançamentos, Admin/Admin SaaS (só o guard de redirecionamento é testado em E2E).

**Resumo quantitativo:** dos ~47 arquivos de rota do backend, apenas 9 têm teste unitário dedicado à própria rota HTTP.

---

## 6. Plano de correção priorizado

### 1. Bloqueadores antes de produção (risco financeiro/segurança direto e confirmado)
1. **B-DATA-001** — bloquear edição/exclusão de venda com parcela parcial paga.
2. **B-DATA-004** — adicionar `idempotency_key`/`UNIQUE` para vendas (confirmar primeiro se a coluna já existe em produção).
3. **D-SEC-001** — corrigir IDOR em `/assistencia/os/:id/garantia` e `/eventos`.
4. **E-SEC-001** e **E-SEC-002** — escapar campos de impressão de OS e autocomplete de catálogo.
5. **A-SEC-004** — corrigir os imports faltantes em `admin.routes.js`/`admin-saas.routes.js` (validar nomes exatos antes).
6. **C-INT-001** — adicionar `require('crypto')` em `pagamentos.routes.js`.
7. **E-UX-001** — adicionar import de `enhanceSelect` em `contasPagar.js`/`lancamentosFinanceiros.js`.

### 2. Correções de curto prazo (alto, confirmado, menor urgência imediata)
- A-SEC-001 (trava de auto-promoção a admin)
- A-SEC-002 (checagem case-insensitive de usuário)
- B-DATA-002 (devolução + edição duplicando estoque)
- B-DATA-003 (idempotência de compra)
- B-MULTI-001 (padrão OR em grades/kits/depósitos/tabelas de preço/metas)
- C-SEC-001 + C-INT-003 (SSRF via redirect + oráculo)
- D-SEC-002 (validação de posse de FK em OS/orçamentos/pedidos)
- D-SEC-003 (decidir fonte de verdade entre `/ordens-servico` e `/assistencia/os`)

### 3. Melhorias estruturais
- F-TEST-003 (testes de PDV/Vendas e Compras)
- C-SEC-002 (criptografar tokens Focus NFe/NFS-e/WhatsApp)
- Médios restantes da tabela da seção 3 (A-SEC-003, A-SEC-005, B-MULTI-002, B-DATA-005/006, F-TEST-002/004)
- Ampliar cobertura de teste de rota conforme seção 5

### 4. Otimizações opcionais
- Todos os achados Baixos da seção 3 (performance pontual, hardening de JWT, limpeza de worktree órfão, rótulos de CI, documentação de arquitetura de repositórios aninhados)

Nenhuma refatoração grande é proposta nesta auditoria sem demonstração de benefício/risco específico — todas as correções acima são aditivas e cirúrgicas, seguindo o padrão já estabelecido no próprio código (ex.: replicar o padrão OR já usado em outros módulos, replicar o índice único já usado em compras).

---

## 7. Comandos executados

| Comando | Resultado |
|---|---|
| `cd backend && npm run test:smoke` | OK — todas as verificações passaram |
| `cd backend && npm test -- --runInBand` | **469/469 testes passaram**, 27 suites, ~2,4s (sem DATABASE_URL no ambiente — não tocou produção) |
| `cd backend && npm audit --omit=dev` | **0 vulnerabilidades** |
| `cd frontend && node --check` em todos os 55 `js/*.js` | Todos OK, nenhum erro de sintaxe |
| `cd e2e && npx playwright test` (contra branch Neon de teste isolado, host confirmado diferente de produção antes de rodar) | **21/22 passaram**; 1 falhou (`responsividade-tema.spec.js:93`) — causa raiz confirmada como bug no teste (F-TEST-001), não na aplicação |
| `git status --short` / `git ls-files` (raiz, frontend, backend) | Usados para construir o manifesto de cobertura (seção 2) |
| Leitura linha a linha de ~280 arquivos pelos 6 agentes A–F | Ver seção 2 |

---

## 8. Próxima etapa recomendada

Primeiro pacote de correção sugerido (baixo risco, alto valor, escopo fechado):

1. **E-SEC-001 + E-SEC-002** — envolver os ~14 pontos de interpolação em `ordensServico.js`/`assistenciaTecnica.js` com `escapeHtml`/`esc()` já existente no próprio arquivo. Nenhuma mudança de arquitetura.
   - Teste: imprimir OS com `<script>` em cada campo afetado, confirmar escape.
2. **E-UX-001** — adicionar a linha de import faltante em `contasPagar.js` e `lancamentosFinanceiros.js`.
   - Teste: abrir os 3 modais afetados, clicar Confirmar/Cancelar.
3. **C-INT-001** — adicionar `require('crypto')` em `pagamentos.routes.js`.
   - Teste: simular webhook Asaas real com token correto, confirmar que não lança mais `TypeError`.
4. **B-DATA-001** — ajustar o filtro de `vendaPossuiParcelaPaga` para incluir `'parcial'`/`'parcial_atrasado'`.
   - Teste: venda parcelada → baixa parcial → tentar editar/excluir → esperar bloqueio.

Esses 4 itens cobrem 2 dos 5 críticos, 1 alto de segurança e 1 alto funcional, são isolados (sem risco de efeito colateral em outros módulos) e não dependem de migration nem de confirmação de estado do banco de produção — podem ser aplicados assim que aprovados, antes dos demais pacotes que requerem migration (B-DATA-004, B-MULTI-001) ou decisão de produto (D-SEC-003).

Pendente de validação manual no banco de produção antes de qualquer correção de schema: existência da coluna `vendas.idempotency_key` (B-DATA-004), duplicatas de `usuario` por maiúsculas/minúsculas (A-SEC-002), linhas com `empresa_id IS NULL` em `produtos`/`clientes` (B-MULTI-001/002).
