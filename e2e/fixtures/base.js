'use strict';

const base = require('@playwright/test');
const ENV = require('../env');

// Fixture compartilhada: aponta o frontend pro backend local de teste
// (via window.LF_ERP_API_URL, lido por frontend/js/api.js antes de qualquer
// fetch) e coleta erros de console + violações reais de CSP do navegador
// para as specs afirmarem sobre eles.
const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((apiUrl) => {
      window.LF_ERP_API_URL = apiUrl;
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push(`${e.violatedDirective} :: ${e.blockedURI}`);
      });
    }, ENV.BACKEND_URL);

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(String(err && err.message || err)));
    page.consoleErrors = consoleErrors;

    await use(page);
  },
});

async function getCspViolations(page) {
  return page.evaluate(() => window.__cspViolations || []);
}

// Entra autenticado injetando a sessão direto no storage (mesmo formato que
// frontend/js/auth.js#saveAuth produz), em vez de preencher o formulário de
// login — evita contar contra o rate limiter real de /login pra testes que
// só precisam de uma sessão válida, não estão testando o login em si.
async function loginViaToken(page, { token, id, usuario, tipo, empresaId, empresaNome }) {
  await page.goto('/index.html');
  await page.evaluate(
    ({ token, id, usuario, tipo, empresaId, empresaNome }) => {
      sessionStorage.setItem(
        'lf_erp_auth',
        JSON.stringify({
          authToken: token,
          empresaId,
          empresa: { id: empresaId, nome: empresaNome },
          user: { id, usuario, tipo, empresa_id: empresaId, empresa: empresaNome, is_saas_owner: false },
        })
      );
    },
    { token, id, usuario, tipo, empresaId, empresaNome }
  );
  await page.reload();
  await base.expect(page.locator('#mainScreen')).toBeVisible({ timeout: 15000 });
}

// Itens de menu lateral ficam dentro de grupos recolhíveis (.nav-group,
// precisa da classe .open pra revelar o .nav-group__menu) — clicar direto
// no .nav-subitem sem abrir o grupo primeiro falha com "element not visible".
async function clickNavItem(page, { grupo, dataView, atView }) {
  await page.click(`.nav-group[data-group="${grupo}"] .nav-group__toggle`);
  const seletor = atView
    ? `.nav-subitem[data-view="${dataView}"][data-at-view="${atView}"]`
    : `.nav-subitem[data-view="${dataView}"]:not([data-at-view])`;
  await page.click(seletor);
}

module.exports = { test, expect: base.expect, getCspViolations, loginViaToken, clickNavItem, ENV };
