'use strict';

const { test, expect } = require('../fixtures/base');

test.describe('Admin — guarda de SaaS Owner', () => {
  test('sem sessão alguma é redirecionado para index.html', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page).toHaveURL(/index\.html$/, { timeout: 10000 });
  });

  test('usuário autenticado que NÃO é SaaS Owner é redirecionado', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
      sessionStorage.setItem(
        'lf_erp_auth',
        JSON.stringify({
          authToken: 'token-fake-nao-usado-pelo-guard',
          empresaId: 1,
          empresa: { id: 1, nome: 'Empresa Qualquer' },
          user: { id: 1, usuario: 'qualquer', is_saas_owner: false },
        })
      );
    });
    await page.goto('/admin.html');
    await expect(page).toHaveURL(/index\.html$/, { timeout: 10000 });
  });
});
