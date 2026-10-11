'use strict';

const { test, expect, ENV } = require('../fixtures/base');
const { getSharedEmpresa } = require('../fixtures/sharedEmpresa');

test.describe('Autenticação', () => {
  let empresa;

  test.beforeAll(() => {
    empresa = getSharedEmpresa();
  });

  test('login válido entra no sistema', async ({ page }) => {
    await page.goto('/index.html');
    await page.fill('#loginUsuario', empresa.admin.usuario);
    await page.fill('#loginSenha', empresa.admin.senha);
    await page.click('#loginSubmitBtn');

    await expect(page.locator('#mainScreen')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#loginScreen')).toBeHidden();
  });

  test('login inválido mostra erro e permanece na tela de login', async ({ page }) => {
    await page.goto('/index.html');
    await page.fill('#loginUsuario', empresa.admin.usuario);
    await page.fill('#loginSenha', 'SenhaErrada999!');
    await page.click('#loginSubmitBtn');

    await expect(page.locator('#loginMessage')).toContainText(/inválid/i, { timeout: 10000 });
    await expect(page.locator('#loginScreen')).toBeVisible();
    await expect(page.locator('#mainScreen')).toBeHidden();
  });

  test('sessão expirada/revogada em uso força logout e volta pro login', async ({ page, request }) => {
    // Login real pela UI
    await page.goto('/index.html');
    await page.fill('#loginUsuario', empresa.gerente.usuario);
    await page.fill('#loginSenha', empresa.gerente.senha);
    await page.click('#loginSubmitBtn');
    await expect(page.locator('#mainScreen')).toBeVisible({ timeout: 15000 });

    // Captura o token real salvo pela sessão e o invalida no backend (fora da
    // página) chamando /logout diretamente — simula o token expirar/ser
    // revogado enquanto o usuário já está autenticado e navegando.
    const authRaw = await page.evaluate(
      () => sessionStorage.getItem('lf_erp_auth') || localStorage.getItem('lf_erp_auth')
    );
    const token = JSON.parse(authRaw).authToken;

    const revokeResp = await request.post(`${ENV.BACKEND_URL}/logout`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revokeResp.ok()).toBeTruthy();

    // Dispara uma ação autenticada real na página com o token agora revogado
    // A resposta revogada desmonta a tela atual durante o handler de clique.
    // Dispara os dois eventos no DOM sem aguardar a estabilidade do item removido.
    await page.evaluate(() => {
      document.querySelector('.nav-group[data-group="cadastros"] .nav-group__toggle')?.click();
      document.querySelector('.nav-subitem[data-view="produtos"]:not([data-at-view])')?.click();
    });

    // Comportamento esperado: a sessão é encerrada e a tela de login volta a
    // aparecer (como já acontece corretamente para respostas 401 — ver
    // frontend/js/api.js). O backend responde 403 com código TOKEN_REVOGADO
    // neste caso; o app precisa tratar isso como sessão expirada também.
    await expect(page.locator('#loginScreen')).toBeVisible({ timeout: 10000 });
  });
});
