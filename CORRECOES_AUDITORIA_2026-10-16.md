# Correções da auditoria — 16/10/2026

Implementação referente a [AUDITORIA_PERFORMANCE_SEGURANCA_2026-10-16.md](AUDITORIA_PERFORMANCE_SEGURANCA_2026-10-16.md). O relatório original permanece como registro dos achados anteriores às correções.

Commits enviados à `main`: backend **3f004f7**, frontend **33ffcdd**. Push e checks do GitHub Actions confirmados nos dois repositórios. O deployment **Production** do frontend foi confirmado como **success** para `33ffcdd`, criado em 16/10/2026 às 19:34:37 UTC ([Vercel](https://vercel.com/lfelipegfg-sources-projects/lf-erp-frontend/5CVRJr1dNwCHFX9Cb8U8vyPz8Ztu)). A URL pública do frontend respondeu HTTP 200. O backend respondeu HTTP 200 em `/health`, com banco online, mas a versão implantada e as migrations em produção ainda não foram confirmadas: não há deployment registrado no GitHub e falta acesso autenticado ao Render.

## Mudanças implementadas

| ID | Resultado |
|---|---|
| SEC-01 | Gerente não pode criar administrador nem delegar permissões. Delegações e revogação de sessões são gravadas na mesma transação. |
| SEC-02 | Cada requisição autenticada revalida existência, perfil, empresa e versão de senha do usuário no banco. Tokens anteriores a exclusão/rebaixamento/alteração de permissões são rejeitados. |
| SEC-03 | Falha de revalidação retorna 503 e não chama o handler protegido. |
| SEC-04 | Classificação IPv4/IPv6 por biblioteca de IP; IPv4-mapped normalizado; transporte recebe somente IPs validados, sem segunda consulta DNS. Redirects entre origens são bloqueados. Timeout e limite de corpo externo foram adicionados. |
| SEC-05 | CSV neutraliza fórmulas e controles em células/cabeçalhos/metadados, escapa aspas e preserva números reais e decimais formatados. |
| SEC-06 | Portal compara versão de senha no token com o banco; reset revoga tokens anteriores e o login emite a nova versão. |
| SEC-07 | Blacklist do banco é consultada em cada autenticação; logout aguarda persistência e a interface distingue encerramento local de revogação confirmada no servidor. |
| SEC-08 | SSE fecha na expiração e revalida sessão periodicamente. Exige permissão de notificações e perfil financeiro; falha de revalidação fecha a conexão. |
| SEC-09 | `loja.db` removido do versionamento corrente com `git rm --cached`; arquivo local preservado. **Histórico e eventual reutilização da credencial exigem revisão operacional**, descrita abaixo. |
| PERF-01 | Contrato paginado disponível em `getProdutosPagina`; consumidores legados obtêm catálogo completo em lotes de 500, com ordenação determinística, em vez de perder os produtos além dos primeiros 100. |
| PERF-02 | Resumo executivo deixa de executar a primeira agregação de tendência sem uso: 9 queries em vez de 10. |
| PERF-03 | A interface envia `incluir_recebidos_parciais=false`; consulta mensal executa duas queries, sem soma do histórico global. O comportamento anterior da API é preservado para clientes que não enviam a opção. |
| PERF-04 | Payload SSE compartilhado por empresa, com coalescência de requisições e cache de 30 segundos, em vez de quatro consultas por conexão. |
| PERF-05 | Configuração financeira consulta o mesmo client transacional; baixas/estornos resolvem empresa sem requisitar outra conexão do pool enquanto mantêm locks. |
| PERF-06 | Buckets antigos são expurgados em lotes de 1.000 a cada 15 minutos; retenção de 48h. Chaves grandes viram hash de tamanho fixo. |
| OPS-01 | Testes do navegador movidos do backend para `frontend/test`, usando o test runner do Node; cada CI executa apenas suas fontes, sem depender de diretório irmão. |
| OPS-02 | Importação de conciliação usa parser próprio depois de autenticação/limitação; rotas comuns mantêm 1 MB. Conteúdo importado é limitado a 5 MB em bytes; envelope JSON tem limite para acomodar escapes. |
| OPS-03 | CI, `.node-version` e engines do backend passam a Node 24. Configuração privada do provedor não foi consultada. |
| OPS-04 | Jest atualizado; override de YAML restrito ao carregador de configuração do Istanbul, usando sua API `.load` compatível. Instalação limpa retornou zero vulnerabilidades. |
| OBS-01 | Dashboard, relatórios e BI não convertem falhas financeiras em zeros ou sucesso. Resultados anteriores são preservados com aviso de erro; exportação/impressão aguardam resultado válido do período. Corrigida também leitura da tendência do BI já normalizada pela API. |
| OBS-02 | Manutenção diária registrada no banco, com lock entre processos, recuperação no boot e verificação a cada 5 minutos. Só registra conclusão após todas as empresas serem processadas; falha/conflito permite nova tentativa. |

**Precisão sobre PERF-03:** a ocorrência de `total_recebido_parcial` na interface pertence ao histórico do cliente, que tem consulta própria. A tela mensal não precisa daquele campo global; a solução evita a consulta sem remover o indicador do histórico.

## Validação concluída

- Instalação com `npm ci --ignore-scripts` em cópia temporária isolada: **zero alertas de dependências**, incluindo desenvolvimento.
- Backend isolado, sem frontend irmão: **50 suítes / 599 testes passaram**.
- Frontend isolado, sem backend irmão ou dependências npm: **21 testes passaram**.
- Sintaxe: **170 arquivos backend e 57 frontend** verificados sem falha, incluindo testes.
- Smoke test: **6 verificações passaram**.
- SQLite local continua presente e foi excluído apenas do índice Git.
- Não foram executados comandos SQL no banco de produção nem chamadas autenticadas a integrações externas.

Evidência executável: [validar-correcao.cjs](auditoria/2026-10-16/validar-correcao.cjs). Resultado: [validacao-correcao.json](auditoria/2026-10-16/validacao-correcao.json).

Os scripts `reproduzir.cjs` e `verificacoes.cjs` do relatório anterior descrevem o estado vulnerável e o checkout anterior. Para verificar o código corrigido, usar as suítes dos repositórios e `validar-correcao.cjs`, não os probes que esperavam reproduzir as falhas antigas.

## Publicação e limites operacionais

1. O backend requer **Node 24**. Os arquivos do repositório declaram essa versão; se houver `NODE_VERSION` definido manualmente no Render, esse override deve acompanhar a versão. A configuração privada do provedor permanece sem confirmação.
2. Migrations aditivas **061** (`portal_senha_alterada_em`) e **062** (`manutencao_execucoes`) serão aplicadas pelo runner existente no startup. A aplicação precisa concluir esse startup para disponibilizar as rotas novas. Elas não foram aplicadas remotamente durante esta validação.
3. Reset de senha do portal e alteração de permissões exigem novo login das sessões anteriores. O bloqueio via plano ainda obedece o cache existente de até 60 segundos; streams revalidam a cada 25 segundos, além de fechar na expiração.
4. Destinos externos que redirecionam para outra origem devem ser configurados com a URL final autorizada. A mudança impede enviar payload/credenciais a outra origem por redirect.
5. Remover `loja.db` do commit corrente não remove o hash dos commits antigos. Não houve force-push, reescrita de histórico ou rotação de credencial real, cuja reutilização não foi confirmada. Esse ponto fica **mitigado no código/versionamento corrente**, com revisão operacional pendente.
6. O catálogo completo necessário ao PDV/offline foi recuperado em lotes, sem elevar ilimitadamente o limite do servidor. Redesenho das telas para busca totalmente remota e benchmarks de milhares de produtos permanecem melhorias futuras, não uma medição já realizada.
7. Testes foram feitos com API/DB controlados e instalação limpa; não substituem teste de carga, Playwright com PostgreSQL isolado ou confirmação de deploy do backend no Render.

## Repositórios e publicação dos relatórios

Os relatórios e evidências são versionados na branch `master` do repositório `lf-erp-frontend`. A aplicação frontend usa a branch `main` desse mesmo remoto; o backend usa `main` do repositório `lf-erp-backend`. Publicar estes documentos na `master` não substitui nem publica a aplicação em produção.

Checks confirmados: [backend](https://github.com/lf-erp-sistema/lf-erp-backend/actions/runs/38955895773), [frontend](https://github.com/lf-erp-sistema/lf-erp-frontend/actions/runs/38955920394). O token local da CLI Vercel foi recusado, mas o deploy automático do frontend foi confirmado pela integração GitHub. A integração Render foi solicitada para verificar o commit ativo e concluir o deploy do backend, se necessário.
