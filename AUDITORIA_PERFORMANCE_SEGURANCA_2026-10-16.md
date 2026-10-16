# Nova auditoria de performance e segurança — LF ERP

Data: **16/10/2026**. Backend: **4ae5889**. Frontend: **6422d46**. Ambiente local: Node **24.14.0**.

## Resultado executivo

Foram identificados **21 achados: 8 de prioridade alta e 13 de prioridade média**. Nenhum foi classificado como crítico com a evidência disponível. A classificação considera impacto e condições de ocorrência; não significa que houve exploração em produção.

Os pontos prioritários são: criação de administrador por gerente; tokens que continuam úteis após exclusão ou rebaixamento de usuário; autenticação que libera acesso se a revalidação falhar; proteção SSRF incompleta; catálogo truncado silenciosamente; falhas financeiras exibidas como sucesso; CI dependente do layout local; e Node 20 ainda configurado no CI.

**Validação executada:**

| Verificação | Resultado |
|---|---|
| Suíte Jest completa do backend, no workspace integrado | **49 suítes / 571 testes passaram** |
| Smoke test local | **6 verificações passaram** |
| Sintaxe de todo JavaScript versionado | **166 arquivos backend + 56 frontend; nenhuma falha** |
| Probes locais de comportamentos problemáticos | **12 reproduções confirmadas**, com mocks de banco/DNS/transporte |
| Testes de carregamento com checkout isolado do backend | **16 testes / 16 falhas por ENOENT do frontend ausente** |
| `npm audit --omit=dev --json`, backend | **0 alertas** |
| `npm audit --json`, backend | **32 pacotes afetados: 30 altos e 2 moderados**, incluindo dependências transitivas de desenvolvimento |
| `npm audit --json`, projeto e2e | **0 alertas** |

Os 32 pacotes afetados não são 32 falhas independentes da aplicação: há propagação de alertas pela árvore do Jest. O audit de produção zerado não cobre runtime Node, código próprio, scripts CDN ou configurações da infraestrutura.

**Nenhuma alteração no código da aplicação, migration, dependência ou dado de produção foi feita nesta auditoria.** Os arquivos novos são este relatório e os instrumentos/evidências em `auditoria/2026-10-16/`. As afirmações de auditorias anteriores foram tratadas como histórico, não como prova de segurança atual.

## Cobertura e limites

O inventário completo dos arquivos versionados relevantes está em [verificacoes.json](auditoria/2026-10-16/verificacoes.json). Todos os arquivos JavaScript versionados passaram por verificação de sintaxe. Houve busca transversal e revisão dirigida de autenticação, permissões, isolamento por empresa, financeiro, produtos/PDV/estoque, BI, relatórios, integrações externas, portal, checkout, uploads, migrations, agendamento, exportações, armazenamento offline e CI.

| Camada | Verificado | Profundidade/limite |
|---|---|---|
| Autenticação e usuários | JWT, senha, exclusão, rebaixamento, logout, permissões | Revisão dirigida e reproduções locais |
| Multiempresa | Helper central e filtros em rotas financeiras, cadastros e integrações | Busca transversal e leitura dos pontos selecionados; não é teste adversarial de cada endpoint |
| Financeiro | Contas, baixas, fluxo, logs, resumo, atualizações de status | Leitura dirigida; sem executar transações em banco real |
| Catálogo e operação | Produtos, consumidores do catálogo, PDV offline, estoque, clientes, compras/vendas | Contratos de paginação e carregamento; sem benchmark real de volume |
| Integrações e dados externos | SSRF central, webhooks, marketplace, PIX, Asaas, portal, checkout | Revisão de controles; não houve chamada autenticada a provedores |
| Frontend | Exportação, armazenamento, notificações, dashboard, relatórios, SW, CSP | Sintaxe completa, revisão dirigida e execução em VM com DOM/API controlados |
| Banco | Migrations, índices declarados, pool, transações e queries | Não houve acesso ao PostgreSQL de produção, `EXPLAIN ANALYZE` ou inspeção de índices efetivamente instalados |
| Operação | Workflows, runtime declarado, dependências, smoke e suíte completa | Reprodução de checkout isolado; sem consultar configurações privadas de Render/Vercel/GitHub |

Não foi executado Playwright contra banco real, teste de carga, pentest em produção, análise de histórico Git completo ou leitura de valores de `.env`. Portanto, não se afirma leitura manual linha a linha de 100% dos arquivos nem certificação de segurança. O estado atual dos deploys e da configuração privada da nuvem continua sem confirmação.

## Achados de segurança

### SEC-01 — Gerente pode criar administrador — ALTA

**Evidência:** `backend/routes/usuarios.routes.js:65–133`. O POST aceita `tipo: 'admin'` e permite gerenciamento por `admin` ou `gerente`. A restrição de promoção existente no PUT, linha 194, não foi aplicada ao POST.

**Condição e impacto:** gerente que possua `usuarios.criar` pode criar outra conta administradora da própria empresa e assumir permissões superiores. A reprodução local executou o handler com esse perfil e confirmou INSERT com `tipo='admin'` e resposta 200. Não demonstra acesso de gerente sem a permissão de criar nem acesso entre empresas.

**Correção:** aplicar ao POST a mesma hierarquia do PUT; centralizar a decisão sobre quais perfis o autor pode conceder. Revisar também a alteração de permissões pelo próprio gerente para que a delegação não conceda poderes superiores aos do autor.

**Aceite:** gerente com `usuarios.criar` recebe 403 ao pedir admin; admin continua criando os perfis autorizados; nenhuma linha é inserida no caso bloqueado.

### SEC-02 — Exclusão ou rebaixamento não invalida o acesso já emitido — ALTA

**Evidência:** `backend/middleware/auth.js:118–123`, `backend/server.js:218–221`, `backend/routes/usuarios.routes.js:240–250,317` e `backend/utils/permissoes.js:40`. O helper retorna versão de senha zero quando o usuário não existe. A autenticação não revalida existência/perfil, e o middleware de permissões concede acesso administrativo a partir do perfil no JWT.

**Reprodução:** usuário ausente no banco continuou passando pelo wrapper de autenticação. Em outro probe, o banco informou `tipo='funcionario'`, mas o JWT de admin continuou com `tipo='admin'` e passou em `usuarios.editar` sem consulta de permissão.

**Impacto:** usuário excluído ou admin rebaixado pode manter poderes do token anterior até sua expiração, nominalmente até 12 horas. O refresh consulta o usuário atual, mas não protege o uso do token antigo antes de renovar.

**Correção:** validar um registro ativo de usuário e uma versão de sessão/autorização; incrementar essa versão ao excluir, rebaixar ou mudar permissões sensíveis. Usuário ausente precisa ser rejeitado. Cache deve ter prazo de revogação documentado.

**Aceite:** token anterior deixa de funcionar após exclusão/rebaixamento dentro do prazo definido, inclusive em rotas que hoje fazem bypass de permissões para admin.

### SEC-03 — Falha na revalidação de autenticação libera a requisição — ALTA

**Evidência:** `backend/server.js:234–237`: o catch chama `next()` se a consulta de senha/plano falhar. Reproduzido lançando erro no helper de senha e observando continuidade da requisição.

**Impacto:** erro de infraestrutura ou incompatibilidade de schema remove a checagem de revogação de senha, bloqueio e trial. Isso não permite forjar assinatura JWT; enfraquece o controle de um token já válido. Rotas que dependam do banco ainda podem falhar, mas o gate de autorização em si já liberou.

**Correção:** responder 503 quando não for possível estabelecer a autorização, ou usar estado positivo previamente validado com validade e condições estritas. Não converter erro de segurança em autorização.

**Aceite:** falha simulada no helper não chama `next`; usuário recebe indisponibilidade, sem acesso ao handler protegido.

### SEC-04 — Guard SSRF aceita faixas IPv6 privadas e não fixa o IP validado — ALTA

**Evidência:** `backend/utils/ssrfGuard.js:23–55,77–85`. As expressões cobrem `fc00:` e `fe80:` específicos, não toda a faixa ULA `fc00::/7` e link-local `fe80::/10`. IPv4 mapeado em hexadecimal também escapa dos padrões textuais. `dns.lookup` valida um resultado e o `fetch` recebe novamente o hostname, permitindo nova resolução independente.

**Reprodução:** com DNS simulado, `validarHostExterno` aceitou respostas `fc01::1`, `fe90::1` e `::ffff:7f00:1`. Nenhuma conexão privada foi feita. A exploração de DNS rebinding depende do transporte/resolução/rede real e não foi executada.

**Impacto:** usuários autorizados a configurar destinos externos podem alcançar redes que o guard deveria bloquear, dependendo da resolução e conectividade do servidor. O módulo é compartilhado por webhooks e WhatsApp, ampliando o alcance da falha.

**Correção:** validar endereços normalizados por CIDR com biblioteca adequada, incluindo IPv4-mapped; fixar o endereço aprovado no transporte sem perder TLS/SNI; revalidar redirects; aplicar restrição de saída na infraestrutura.

**Aceite:** testes cobrem todas as faixas reservadas relevantes, representações equivalentes, A/AAAA mistos e mudança DNS entre validação/conexão. Referência: [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

### SEC-05 — CSV do frontend permite fórmulas de planilha — MÉDIA

**Evidência:** `frontend/js/exportUtils.js:22–44`. O backend já neutraliza prefixos em `backend/routes/exportacao.routes.js:26–31`, mas o exportador do navegador somente faz escape de delimitadores.

**Reprodução:** uma linha com `Nome: '=1+1'` foi exportada literalmente como `=1+1` no CSV.

**Impacto:** texto cadastrado por um usuário pode ser interpretado como fórmula quando alguém abre o relatório no Excel/Calc. Execução adicional depende das fórmulas e da proteção da planilha; não se afirma execução automática de comandos do sistema.

**Correção:** neutralizar células textuais iniciadas por caracteres de fórmula/controle e aplicar escape também a cabeçalhos e metadados. Preservar números reais como números.

**Aceite:** exportações com `=`, `+`, `-`, `@`, aspas, quebras de linha e metadados malformados são abertas como texto onde apropriado.

### SEC-06 — Reset de senha do portal não revoga tokens antigos — MÉDIA

**Evidência:** `backend/routes/portal.routes.js:68–84,169,298–317`. O token do cliente dura 12h; o middleware só consulta `portal_ativo`. Reset atualiza a senha e mantém/ativa o portal, sem versão de sessão.

**Reprodução:** token emitido antes do reset continuou autorizado por `authCliente` após a execução local do reset.

**Correção e aceite:** versionar sessões do portal e incrementar no reset; token anterior deve ser negado, enquanto novo login com a senha atual funciona. Referência: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

### SEC-07 — Blacklist de logout não é sincronizada entre instâncias — MÉDIA

**Evidência:** `backend/middleware/auth.js:10,39–48,79`; `backend/routes/auth.routes.js:228–240`. O banco é carregado no início, mas cada requisição só verifica o Map do processo. A gravação do logout no banco também não é aguardada antes da resposta.

**Reprodução:** duas instâncias locais do middleware: revogar no Map A não impediu a autorização no B.

**Impacto condicionado:** aparece com múltiplas instâncias ou sobreposição de processos em deploy; não se confirmou quantas instâncias existem em produção. Falha na persistência pode ressuscitar a sessão após restart.

**Correção e aceite:** usar armazenamento compartilhado consultado com política de cache curta ou versão de sessão sincronizada; aguardar persistência; token revogado deve ser negado em todas as instâncias e após reinício.

### SEC-08 — Conexão SSE continua sem revalidar sessão — MÉDIA

**Evidência:** `backend/routes/notificacoes.routes.js:235–281`. A autorização ocorre na abertura, enquanto timers continuam enviando notificações sem checar expiração ou revogação.

**Impacto:** uma conexão já aberta pode continuar recebendo resumos mesmo depois de expiração, logout, exclusão ou bloqueio. O alcance é o conteúdo de notificações daquela empresa, não uma autorização geral para novas requisições.

**Correção e aceite:** encerrar na expiração e em revogação/bloqueio, com revalidação periódica ou sinalização; teste deve abrir stream, revogar e confirmar fechamento/cessação dos dados.

### SEC-09 — Banco SQLite com hash de usuário permanece versionado — MÉDIA

**Evidência:** `git ls-files loja.db` no backend lista o arquivo, embora `.gitignore` contenha `loja.db`. Inspeção SQLite em modo somente leitura confirmou 1 usuário com senha não vazia em formato bcrypt. Não foram exibidos login, hash, senha ou dados pessoais.

**Impacto:** todos com acesso ao repositório/histórico podem obter esse hash para análise offline. Não foi confirmado se é conta real, senha reutilizada ou apenas exemplo legado.

**Correção:** confirmar origem e reutilização; retirar o binário do versionamento corrente e substituir por fixtures sintéticas. Se houver segredo real/reutilizado, rotacionar primeiro e avaliar limpeza de histórico de forma coordenada.

**Aceite:** checkout novo não contém base com credenciais; nenhuma correção deve apagar dados locais necessários sem planejamento.

## Achados de performance e escalabilidade

### PERF-01 — Paginação corta o catálogo em 100 produtos sem avisar — ALTA

**Evidência:** `backend/routes/produtos/consulta.routes.js:148–178` aplica limite padrão 100 e retorna total/offset. `frontend/js/api.js:455–458` devolve só `dados`. Consumidores em `produtos.js:470`, `estoque.js:173`, `compras.js:323` e `pdv.js:1040` pedem o catálogo sem paginação e trabalham como se tivessem o conjunto completo.

**Reprodução:** resposta simulada com `total=501` foi reduzida a array sem metadados. A confirmação de empresa real com mais de 100 produtos requer consulta adicional, não realizada.

**Impacto:** busca local, seleção, contagens e alertas podem ignorar produtos além da primeira página. Aumentar o limite indefinidamente prejudicaria desempenho e não resolve a arquitetura.

**Correção:** contrato paginado explícito para listagens; busca no servidor e paginação/scroll para seleção; snapshot offline completo obtido em lotes com progresso e validação do total.

**Aceite:** fixture com 501 produtos permite localizar o último no PDV, compras e cadastros; estoque e totais informam o escopo correto; nenhuma tela precisa renderizar 501 linhas para buscar um item.

### PERF-02 — BI calcula tendência duas vezes — MÉDIA

**Evidência:** `backend/routes/bi.routes.js:514–524`. Um primeiro `Promise.allSettled` executa tendência anual e aguarda; o bloco seguinte repete a agregação que efetivamente vai para a resposta. O primeiro resultado não é utilizado.

**Reprodução:** probe do handler contou duas queries de tendência de 12 meses em uma chamada.

**Correção e aceite:** remover o bloco sem uso e manter a resposta; contagem deve cair de 10 para 9 queries no caminho atual. O ganho em milissegundos depende do volume e do banco e não foi medido.

### PERF-03 — Toda página de contas a receber recalcula histórico global de parciais — MÉDIA

**Evidência:** `backend/routes/contas-receber/consulta.routes.js:262–292`. A terceira consulta soma recebimentos de todo o histórico da empresa, com EXISTS e extração de ID de descrição por regex, independentemente do mês/página. O valor é utilizado no resumo do modal de nova conta em `frontend/js/contasReceber.js:5248`.

**Impacto:** navegar entre meses/páginas repete trabalho global que não muda com esses filtros. A conversão de IDs legados também aumenta CPU e dificulta índices.

**Correção:** explicitar o escopo desse indicador; carregar o resumo global quando necessário ou em endpoint independente com invalidação em baixas/estornos; completar vínculo `conta_receber_id` por migration validada e eliminar parsing de descrição onde possível.

**Aceite:** mesma soma antes/depois em fixtures de pagamentos parciais; paginação deixa de recalcular o indicador global; medir plano em base representativa antes de alterar índices.

### PERF-04 — Notificações multiplicam consultas por conexão SSE — MÉDIA

**Evidência:** `backend/routes/notificacoes.routes.js:130–153,217–230,273–275`. Cada conexão chama a geração de notificações, que executa quatro consultas, e repete a cada 60s. O caminho de notificação por empresa também recalcula para cada conexão.

**Impacto:** 30 conexões de uma empresa podem gerar aproximadamente 120 queries por minuto só no refresh periódico, fora abertura e eventos. É estimativa derivada do código, não medição de tráfego real.

**Correção e aceite:** gerar o payload uma vez por empresa e compartilhar no fanout, com janela curta e invalidação adequada; múltiplas conexões não devem multiplicar a consulta agregada.

### PERF-05 — Transações ocupam conexão e pedem outra ao mesmo pool — MÉDIA

**Evidência:** `backend/utils/financeiroOps.js:39–50` abre transação e chama `obterConfigEmpresa`, que usa `pool.query`; `backend/routes/contas-receber/baixa.routes.js:21–42,214–231` consulta acesso à empresa após adquirir lock, via helper que usa o pool. O pool tem máximo de 10 conexões em `server.js:168`.

**Impacto condicionado:** sob concorrência, conexões podem ficar presas esperando outras conexões do mesmo pool, aumentando cauda de latência e timeouts. Não foi reproduzida exaustão no PostgreSQL real.

**Correção:** resolver contexto antes da transação quando seguro, ou passar o mesmo `client` aos helpers necessários; não aumentar o pool sem analisar capacidade do banco.

**Aceite:** teste concorrente com pool pequeno não apresenta starvation; medir `waitingCount`, tempo de aquisição e duração da transação.

### PERF-06 — Buckets de rate limit crescem sem limpeza — MÉDIA

**Evidência:** `backend/utils/sharedRateLimiter.js:4–25`, `backend/middleware/rateLimiter.js:22–25`, migration `056_rate_limit_buckets.sql`. A chave inclui login informado e IP; existem INSERT/UPSERT e índice por updated_at, mas não foi encontrada rotina de expurgo.

**Impacto:** logins distintos e IPs ao longo do tempo criam linhas persistentes. Cada requisição também faz escrita, inclusive quando já bloqueada. Pode elevar armazenamento, WAL e contenção; não se mediu o tamanho atual da tabela.

**Correção e aceite:** expurgar buckets expirados em lotes com retenção documentada; limites de tamanho de chaves; proteção de borda quando disponível. Simular grande cardinalidade e confirmar estabilização sem perder limitação compartilhada.

## Operação, testes e confiabilidade

### OPS-01 — Testes recentes não funcionam no checkout isolado do backend — ALTA

**Evidência:** `backend/test/contasPagar.carregamento.test.js:23` e `backend/test/paginas.carregamento.test.js:21` leem `../../frontend/js/...`; `backend/.github/workflows/ci.yml:14–36` faz checkout apenas do repositório backend.

**Reprodução:** execução dos dois arquivos em diretório temporário sem frontend irmão: **16/16 falhas com ENOENT**. Isso não contradiz os 571 testes locais: o workspace local possui ambos os repositórios.

**Origem:** regressão nos testes que adicionei nas correções recentes de carregamento. A validação anterior cobriu o workspace integrado e não o checkout isolado do CI.

**Correção:** mover a responsabilidade de testes de frontend para o repositório/job apropriado; para testes integrados, fazer checkout explícito dos dois repositórios e configurar o caminho. Não mascarar com skip silencioso nem copiar fontes permanentemente para fixtures.

**Aceite:** backend e frontend validam em checkouts limpos independentes; job de integração executa explicitamente os testes entre repositórios.

### OPS-02 — Parser global de 1 MB impede importação com limite maior — MÉDIA

**Evidência:** `backend/server.js:107–108`; `backend/routes/conciliacao.routes.js:85–91`. O parser global roda antes de `jsonUpload` da rota. Um JSON maior que 1 MB é rejeitado antes de chegar ao parser de 50 MB e à validação de importação de 5 MB.

**Reprodução:** mesma ordem de middlewares em Express, payload local de 1,1 MB: HTTP **413**.

**Correção e aceite:** selecionar o parser por rota antes do parser geral, respeitando limite mínimo necessário, autenticação e proteção de upload; testar abaixo de 1 MB, entre 1–5 MB e acima do limite, verificando também consumo de memória.

### OPS-03 — CI ainda usa Node 20, fora de suporte — ALTA

**Evidência:** backend e frontend, `.github/workflows/ci.yml:19`, definem `node-version: '20'`. `backend/package.json` aceita `>=20`; máquina auditada usa 24.14.0. A versão real do Render não foi consultada.

**Impacto:** CI testa runtime sem suporte e diferente do ambiente local; a faixa aberta de engines não estabelece uma matriz clara de produção.

**Correção:** padronizar uma linha LTS suportada, por exemplo Node 24 após validar compatibilidade, nos workflows, configuração de deploy e documentação. Confirmar explicitamente a versão do Render.

**Aceite:** CI/deploy usam versões suportadas e definidas; suíte, integrações e build passam nessa linha. Situação de suporte verificada nas fontes oficiais: [Node.js Release Working Group](https://github.com/nodejs/Release) e [Node.js EOL](https://nodejs.org/en/about/eol).

### OPS-04 — Dependências de desenvolvimento têm alertas e bloqueiam o gate de audit — MÉDIA

**Evidência:** [npm-backend.json](auditoria/2026-10-16/npm-backend.json): 32 pacotes afetados, sendo 30 classificados high e 2 moderate. As causas incluem `brace-expansion`, `braces`, `js-yaml` e `sprintf-js`; vários alertas se propagam pelo Jest. O CI usa `npm audit --audit-level=high`, incluindo dev dependencies.

**Impacto:** risco no processamento de entradas/padrões/configurações não confiáveis em ferramentas de desenvolvimento e falha do gate atual. Não há evidência de exposição desses caminhos pela API em produção; `--omit=dev` retornou zero.

**Correção:** atualizar lockfile/toolchain e validar compatibilidade, especialmente a versão major do Jest sugerida pelo npm. Tratar dependências de produção e desenvolvimento com políticas explícitas, sem simplesmente suprimir o audit ou executar `npm audit fix --force` sem revisão.

**Aceite:** audit completo dentro da política definida e suíte passando em checkout limpo. As condições exatas de cada advisory estão no JSON preservado e nos links GHSA que ele contém.

### OBS-01 — Falha de consulta pode virar zero ou mensagem de sucesso financeiro — ALTA

**Evidência:** `frontend/js/dashboard.js:1029–1031` transforma falhas de consultas em `{}`; `frontend/js/relatoriosFinanceiros.js:94–100` usa allSettled sem propagar falhas ao recarregamento. Este pode exibir “Relatórios atualizados.” mesmo sem resultado válido. BI também usa arrays/zeros como fallback de consultas rejeitadas.

**Reprodução:** API de resumo lançando erro no módulo de relatórios ainda terminou com feedback `success`.

**Impacto:** usuário pode interpretar ausência de dados/zeros como resultado financeiro real. Preservar a tela durante atualização precisa ser acompanhado de indicação clara de falha e data dos dados mantidos.

**Correção e aceite:** diferenciar carregado, vazio, indisponível e desatualizado; manter último resultado válido com sinalização; propagar erro parcial por painel; falha de rede não pode produzir toast de sucesso nem total zero sem indicação.

### OBS-02 — Atualização de juros/atrasos depende de timer no processo — MÉDIA

**Evidência:** `backend/utils/financeiroOps.js:195–229` agenda setTimeout para a próxima meia-noite; não há recuperação explícita de execução perdida ao iniciar. `server.js` somente inicia esse agendamento após subir. A listagem atual calcula `status_exibicao`, mas outros campos como juros/valor atualizado e o resumo do portal dependem de valores/status persistidos.

**Impacto condicionado:** reinício, indisponibilidade à meia-noite ou suspensão do serviço pode atrasar a atualização até a próxima execução ou outro fluxo que a dispare. As otimizações recentes retiraram essa escrita das listagens; a rotina independente precisa garantir frescor. Não foi verificado se ocorreu execução perdida em produção.

**Correção:** registrar a última execução concluída e recuperar pendências no boot/job externo, com idempotência/lock; separar cálculo por data de manutenção de campos derivados quando apropriado.

**Aceite:** simular reinício após meia-noite, execução duplicada e falha parcial; juros e resumo do portal ficam corretos sem depender de abrir relatório específico. Não reintroduzir atualização geral bloqueante em cada mudança de mês.

## Melhorias adicionais a validar, sem classificá-las como vulnerabilidades confirmadas

1. **Índices e planos reais:** medir queries de período/busca com `EXPLAIN (ANALYZE, BUFFERS)` em clone de produção. Revisar funções sobre colunas, OR legado, buscas `%termo%`, índices redundantes por nomes diferentes e custo de agregação na contagem de clientes. O schema declarado não prova qual plano o PostgreSQL utiliza.
2. **Métricas de performance:** coletar p50/p95/p99 por rota sem registrar dados pessoais, pool waiting/active, duração de transações, tamanho de respostas e cache hit. Definir metas com baseline medido; esta auditoria não inventa ganhos percentuais.
3. **Exports grandes:** avaliar streaming e processamento assíncrono para backups e CSVs que hoje acumulam rows e JSON em memória; preservar autorização, snapshot coerente e limites.
4. **Assets frontend:** `style.css` tem cerca de 313 KB e `contasReceber.js` cerca de 231 KB sem compressão. Medir transferência comprimida, parsing e render em Android; separar estilos/funcionalidades por módulo sem invalidar a política CSP. Tamanho de fonte não equivale a tempo real de download.
5. **XSS e sessão no navegador:** JWT em sessionStorage/localStorage aumenta o impacto de eventual XSS. Avaliar cookies HttpOnly/arquitetura de sessão com as proteções CSRF correspondentes; não mover credenciais sem redesenhar autenticação cross-origin.
6. **Offline e privacidade:** IndexedDB do PDV é separado por empresa, mas catálogo/clientes persistem por dispositivo. Definir política de retenção, usuário compartilhado, limpeza seletiva e sincronização; nunca apagar vendas pendentes indiscriminadamente no logout.
7. **Operação e recuperação:** confirmar backups/PITR e executar restauração em ambiente de teste; validar retenção de logs e redigir parâmetros sensíveis de URLs. `req.originalUrl` é logado integralmente, inclusive nonce SSE e tokens de links quando presentes na rota.
8. **Defesa em profundidade:** avaliar MFA para administração/SaaS Owner, sessões visíveis/revogáveis, política de refresh absoluto, RLS/constraints compostas multiempresa e revisão de acessos a credenciais. Ausência de confirmação desses controles não é prova de vazamento.
9. **Testes funcionais:** manter cenários de PDV/venda/compra/baixa parcial/estorno em banco isolado, testes adversariais entre empresas e testes de API de carregamento com DOM real. As VMs atuais validam lógica e concorrência, não UX completa no navegador.

## Ordem proposta de correção

| Ordem | Entrega | IDs | Verificação indispensável |
|---|---|---|---|
| 1 | Fechar elevação de perfil e revogação no ERP | SEC-01, SEC-02, SEC-03 | Perfil delegado, exclusão/rebaixamento, erro de banco e isolamento por empresa |
| 2 | Restabelecer validação confiável dos repositórios | OPS-01, OPS-03, OPS-04 | Checkout limpo de cada repo, runtime suportado, audit e suíte |
| 3 | Corrigir catálogo e feedback financeiro | PERF-01, OBS-01 | Mais de 100 produtos; falhas reais de API sem zeros/sucesso falsos |
| 4 | Endurecer saídas de rede e exportação | SEC-04, SEC-05 | CIDRs/transport DNS/redirects e células/metadados CSV |
| 5 | Unificar ciclo de sessão | SEC-06, SEC-07, SEC-08 | Portal reset, múltiplas instâncias e SSE revogado |
| 6 | Reduzir queries e contenção | PERF-02 a PERF-06 | Queries contadas, planos representativos, concorrência com pool pequeno |
| 7 | Garantir importação, frescor e higiene de dados | OPS-02, OBS-02, SEC-09 | Limites por rota, recuperação do scheduler e origem do SQLite |

Cada lote deve ser pequeno, manter a compatibilidade `empresa`/`empresa_id` e ter testes positivos e negativos. Alterações em dinheiro, sessão, schema ou dependências devem ser validadas em ambiente isolado antes de publicação.

## Como reproduzir as evidências

Na raiz do workspace, com dependências já instaladas no backend:

```powershell
node auditoria/2026-10-16/reproduzir.cjs
node auditoria/2026-10-16/verificacoes.cjs
```

O primeiro script usa código real com mocks e confirma os comportamentos descritos; **não é uma suíte de aprovação de segurança**: o “confirmado” significa que o comportamento problemático foi observado. Não carrega `.env` nem usa banco/serviços externos. O segundo verifica sintaxe, inventaria commits/arquivos e roda cópias dos dois testes de carregamento em diretório temporário, reproduzindo o frontend ausente. Não apaga os repositórios ou arquivos de usuário.

Evidências: [reproduzir.cjs](auditoria/2026-10-16/reproduzir.cjs), [reproducoes.json](auditoria/2026-10-16/reproducoes.json), [verificacoes.cjs](auditoria/2026-10-16/verificacoes.cjs), [verificacoes.json](auditoria/2026-10-16/verificacoes.json), [npm-backend.json](auditoria/2026-10-16/npm-backend.json).
