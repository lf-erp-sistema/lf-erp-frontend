# Testes E2E — LF ERP

Testes end-to-end com [Playwright](https://playwright.dev), rodando **sempre contra
um backend e um frontend locais**, nunca contra produção.

## Por que existe um banco de teste separado

O backend conecta direto no Postgres (Neon). Para não arriscar tocar dados reais
da Lucileide Variedades (empresa piloto em produção), estes testes exigem um
**branch/projeto Neon isolado, só para testes**, com seu próprio `DATABASE_URL`.
Nunca aponte `E2E_DATABASE_URL` para o banco de produção.

## Setup (uma vez)

1. Crie um branch de teste no Neon (ou um projeto separado) e copie a connection string.
2. `cd e2e && npm install`
3. `npx playwright install chromium` (baixa o Chromium usado pelos testes)
4. Copie `.env.test.example` para `.env.test` e preencha:
   ```
   E2E_DATABASE_URL=<connection string do branch de TESTE>
   E2E_JWT_SECRET=<gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   ```
   `.env.test` já está no `.gitignore` — nunca comite esse arquivo.

Não é preciso rodar migrations manualmente: o próprio `backend/server.js` chama
`initDb()` + `runMigrations()` no boot, então a primeira vez que o backend subir
contra o branch novo ele cria todo o schema automaticamente.

## Rodando os testes

```
cd e2e
npm test              # roda tudo, headless
npm run test:headed   # com navegador visível (debug)
npm run test:ui       # modo interativo do Playwright
npm run report         # abre o relatório HTML da última execução
```

O Playwright sobe automaticamente dois processos antes dos testes (e os encerra
depois), configurados em `playwright.config.js`:
- `static-server.js` — serve `../frontend` com os mesmos headers de segurança/CSP
  de `frontend/vercel.json` (sem isso, testar "nenhum erro de CSP" seria um teste vazio).
- `../backend/server.js` — com `DATABASE_URL`, `JWT_SECRET` e `CRON_SECRET` de teste,
  `ALLOWED_ORIGINS` apontando pro frontend local, e `NODE_ENV=test`.

Cada execução cria uma empresa + usuários via API pública (`/registro` e
`/usuarios` — ver `fixtures/seed.js`), com nomes únicos. Alguns cenários de
volume, como paginação de OS, inserem somente fixtures diretamente no banco
isolado para não desativar nem contornar os rate limits reais da API. Isso
significa que rodar a suíte várias vezes vai acumular dados no branch Neon de
teste — é esperado; se quiser, limpe periodicamente apagando e recriando o
branch (ação do Neon, fora destes testes).

## Rodando um arquivo específico

```
npx playwright test tests/auth.spec.js
npx playwright test -g "sessão expirada"
```

## O que cada arquivo cobre

| Arquivo | Cobre |
|---|---|
| `auth.spec.js` | Login válido, inválido, sessão expirada/revogada em uso |
| `permissoes-alertas.spec.js` | Gate de autorização do disparo preventivo de alertas (cron, sem token, sem permissão, com permissão) |
| `assistencia-tecnica.spec.js` | Paginação da lista de OS e impressão (CSP) |
| `admin-redirect.spec.js` | Guarda de SaaS Owner em `admin.html` |
| `checkout.spec.js` | Checkout público — sem config, com PIX, link inexistente |
| `responsividade-tema.spec.js` | Larguras 360/768/1024/1440px, menu mobile, tabela com scroll contido, contraste básico claro/escuro |
| `csp-smoke.spec.js` | Varredura de várias telas (autenticadas e públicas) sem violação de CSP nem erro de console |

## Limitações conhecidas

- **Boleto/Asaas não é exercitado**: a seção de boleto do checkout só aparece
  com uma integração Asaas configurada (chave de API real de um gateway de
  pagamento), o que não é seguro nem apropriado para um ambiente de teste local.
  Só o fluxo PIX (chave Pix fictícia) é testado.
- **`window.print()` não é de fato acionado** no teste de impressão de OS — em
  Chromium headless isso pode se comportar de forma inconsistente. O teste abre
  a janela de impressão e confirma que carrega sem erro de console/CSP, sem
  clicar no botão "Imprimir" de fato.
- **Sem paralelismo** (`workers: 1`): todos os testes compartilham o mesmo
  banco Neon de teste; rodar em paralelo arriscaria interferência de dados
  entre specs que leem/escrevem o mesmo tipo de registro.
- Todos os testes usam um único navegador (Chromium desktop) — não cobrem
  Firefox/Safari nem dispositivos móveis reais, só emulação de viewport.
