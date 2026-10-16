# Evidências de auditoria e correção

Estes arquivos registram etapas diferentes; resultados anteriores à correção não representam o código atual.

| Arquivos | Etapa |
|---|---|
| `npm-backend.json`, `reproducoes.json`, `verificacoes.json` | Auditoria anterior às correções: backend `4ae5889`, frontend `6422d46`. |
| `reproduzir.cjs`, `verificacoes.cjs` | Instrumentos da auditoria original; os probes esperavam reproduzir falhas do checkout antigo. |
| `npm-correcao.json` | Resultado intermediário de dependências, antes da última correção do Jest/YAML; não é o resultado final. |
| `validacao-correcao.json` | Resultado final: 599 testes backend, 21 frontend, sintaxe de 170/57 arquivos. |
| `validar-correcao.cjs`, `validar-ci.cjs` | Instrumentos locais usados na validação; dependem dos checkouts backend/frontend e, no segundo script, do Git Bash no Windows. |

A instalação limpa final retornou zero alertas de dependências. Os detalhes e limites estão em [CORRECOES_AUDITORIA_2026-10-16.md](../../CORRECOES_AUDITORIA_2026-10-16.md).

`ambiente-validacao.json` é gerado localmente pelo comando `node auditoria/2026-10-16/validar-correcao.cjs prepare`, contém somente o caminho temporário de trabalho e é ignorado pelo Git.
