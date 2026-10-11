'use strict';

const { test, expect, ENV, getCspViolations } = require('../fixtures/base');
const { getSharedEmpresa } = require('../fixtures/sharedEmpresa');

async function criarLinkCheckout(request, token, overrides = {}) {
  const resp = await request.post(`${ENV.BACKEND_URL}/checkout`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { descricao: 'Pedido E2E', valor: '150,00', ...overrides },
  });
  if (!resp.ok()) throw new Error(`Falha ao criar checkout: ${resp.status()} ${await resp.text()}`);
  const body = await resp.json();
  return body.link;
}

test.describe('Checkout público', () => {
  let empresa;
  let adminToken;

  test.beforeAll(() => {
    empresa = getSharedEmpresa();
    adminToken = empresa.admin.token;
  });

  test('sem PIX nem boleto configurados mostra aviso — não trava a página', async ({ page, request }) => {
    const link = await criarLinkCheckout(request, adminToken);

    await page.goto(`/checkout.html#${link.token}`);
    await expect(page.locator('.checkout-desc')).toContainText('Pedido E2E');
    await expect(page.locator('.checkout-valor')).toContainText('150,00');
    await expect(page.locator('.error-box')).toContainText(/nenhuma forma de pagamento/i, { timeout: 10000 });

    expect(await getCspViolations(page)).toEqual([]);
  });

  test('com PIX configurado exibe QR/chave e botão copiar funciona', async ({ page, request, context }) => {
    const cfgResp = await request.put(`${ENV.BACKEND_URL}/pagamentos/pix/config`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { pix_chave: 'e2e-teste@lferp.com.br', pix_sandbox: true },
    });
    expect(cfgResp.ok()).toBeTruthy();

    const link = await criarLinkCheckout(request, adminToken, { descricao: 'Pedido PIX E2E' });
    expect(link.pix_copia_cola).toBeTruthy();

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`/checkout.html#${link.token}`);

    await expect(page.locator('#pixKeyBox')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#pixKeyBox')).toContainText(link.pix_copia_cola.slice(0, 20));

    await page.click('[data-action="copiar-pix"]');
    await expect(page.locator('.btn-pix')).toContainText(/copiado/i);

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(link.pix_copia_cola);

    expect(await getCspViolations(page)).toEqual([]);
    expect(page.consoleErrors).toEqual([]);
  });

  test('link inexistente mostra erro amigável', async ({ page }) => {
    await page.goto('/checkout.html#token-que-nao-existe');
    await expect(page.locator('.error-box')).toBeVisible({ timeout: 10000 });
  });
});
