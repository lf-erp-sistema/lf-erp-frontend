# Melhorias da página inicial e do PDV — revisão local

As melhorias de Início, Dashboard e PDV foram enviadas à branch `main` do frontend no commit `996b6d4`. A formatação de `frontend/css/style.css` foi versionada separadamente no commit `50e13fd`. Os arquivos deste diretório são materiais de revisão local e documentação, versionados na branch `master` do repositório raiz.

## Abrir a revisão com o login habitual

Na raiz do projeto, execute:

```powershell
node auditoria/2026-11-07/servidor-revisao.cjs
```

Abra **http://127.0.0.1:4174** e entre com seu login habitual. Mantenha o terminal aberto; Ctrl+C encerra o servidor.

Esse endereço serve o frontend local e encaminha login e consultas à API real usando HTTPS. Usa os dados reais da empresa, mas bloqueia pedidos de gravação de negócio antes de encaminhá-los. Login, renovação e encerramento da sessão continuam permitidos. O servidor atende apenas na interface local, não registra credenciais e não instala o service worker nesse endereço.

O Live Server em `127.0.0.1:5500/frontend/index.html` acessa diretamente a API remota. A verificação de 07/11 confirmou que `/health` respondeu 200 sem autorizar a origem `http://127.0.0.1:5500`; por isso o navegador bloqueia a conexão por CORS. O servidor de revisão resolve o acesso local sem alterar a configuração ou publicar mudanças no backend.

Verificações do servidor de revisão: página, bootstrap e CSS responderam 200; API `/health` respondeu 200 pelo encaminhamento; tentativa de POST de venda e acesso a `.env` foram bloqueados com 403. Nenhum login foi tentado pelo agente.

## Capturas com dados simulados

- [Página inicial — computador](inicio-1440.png)
- [Página inicial — celular](inicio-360.png)
- [PDV — computador](pdv-1440.png)
- [PDV — celular](pdv-360.png)
- [PDV — tema escuro](pdv-escuro.png)

As capturas foram geradas com o frontend real e respostas de API simuladas no navegador. Nenhuma consulta foi enviada à API de produção. A rede do navegador de teste bloqueou as fontes e os ícones externos; eles não aparecem nas capturas. Os scripts externos de gráficos e monitoramento também foram isolados na simulação.

## O que mudou

- A tela Início é independente do Dashboard e tem um item próprio no menu lateral. Os seis acessos rápidos ficam no Início; indicadores e gráficos ficam no Dashboard. Um novo login abre o Início, enquanto a restauração da sessão mantém a última tela escolhida.
- Os acessos rápidos destacam Nova venda e respeitam a visibilidade por permissão já existente no menu.
- O botão Buscar no sistema abre a busca existente do Ctrl+K.
- O PDV mostra o estado da sessão de caixa consultado na API existente. Falhas ou ausência de conexão aparecem como estado não verificado.
- Orçamento saiu do menu Mais para um botão direto. Retomar abre as vendas em espera; Em espera continua pausando a venda atual.
- A busca ganhou um rótulo, o total ganhou destaque e os principais atalhos aparecem no rodapé do computador.
- O layout estreito permite quebrar os botões e rolar a área central. O painel inicial de produtos recebeu a classe de ativação exigida pelo CSS móvel existente.
- Os atalhos continuam ativos ao alternar para Cliente e pagamento, permitindo voltar à busca com F2.
- Os novos estilos estão em `frontend/css/operacao.css`, preservando as alterações anteriores em `frontend/css/style.css`.

## Validação

- `node --test frontend/test/*.test.cjs`: 25 testes aprovados, incluindo quatro testes novos para caixa aberto/fechado, falhas, offline e respostas antigas após troca de empresa ou de tela.
- Verificação de sintaxe de `app.js` e `pdv.js` aprovada.
- Conferência com Chromium e API simulada: navegação do acesso Nova venda; abertura e filtro da busca global; busca e adição de produto; total de R$ 24,90; abertura da lista de vendas em espera; retorno da aba de cliente à busca com F2; atualização de caixa aberto para fechado; visibilidade dos acessos por permissão.
- Larguras de 360, 768, 1024 e 1440 pixels sem rolagem horizontal na página; captura adicional do tema escuro.
- Separação de Início e Dashboard conferida no navegador: a tela inicial não consulta o dashboard; navegar para Dashboard mostra os indicadores e oculta os acessos rápidos; voltar a Início restaura os acessos.
- Nenhuma exceção JavaScript da aplicação ou violação de CSP nos cenários simulados. Os avisos de recursos externos bloqueados e do SSE simulado pertencem ao ambiente de revisão.

A suíte E2E integrada com banco de dados não foi executada. Esta revisão não altera backend, estoque, pagamentos ou registros reais, e não exercita a conclusão de uma venda na API.
