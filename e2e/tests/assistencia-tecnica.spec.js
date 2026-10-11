'use strict';

const { test, expect, getCspViolations, loginViaToken, clickNavItem } = require('../fixtures/base');
const { getSharedEmpresa } = require('../fixtures/sharedEmpresa');
const { criarOrdensServicoParaTeste } = require('../fixtures/seed');

test.describe('Assistência Técnica — paginação e impressão', () => {
  let empresa;
  const TOTAL_OS = 35; // > porPagina (30) do módulo — força 2 páginas

  test.beforeAll(async () => {
    empresa = getSharedEmpresa();
    await criarOrdensServicoParaTeste({
      empresaId: empresa.empresaId,
      empresaNome: empresa.empresaNome,
      total: TOTAL_OS,
    });
  });

  test('lista pagina corretamente (30 por página)', async ({ page }) => {
    await loginViaToken(page, { ...empresa.admin, empresaId: empresa.empresaId, empresaNome: empresa.empresaNome });
    await clickNavItem(page, { grupo: 'assistencia-tecnica', dataView: 'assistencia' });

    const paginacao = page.locator('#atPagination');
    await expect(paginacao).toContainText(`Exibindo 1–30 de ${TOTAL_OS}`, { timeout: 10000 });

    const proxima = page.locator('[data-action="pagina-proxima"]');
    await expect(proxima).toBeVisible();
    await proxima.click();

    await expect(paginacao).toContainText(`Exibindo 31–${TOTAL_OS} de ${TOTAL_OS}`, { timeout: 10000 });
    await expect(page.locator('[data-action="pagina-proxima"]')).toHaveCount(0);

    const anterior = page.locator('[data-action="pagina-anterior"]');
    await expect(anterior).toBeVisible();
    await anterior.click();
    await expect(paginacao).toContainText(`Exibindo 1–30 de ${TOTAL_OS}`, { timeout: 10000 });
  });

  test('impressão de OS abre janela correta sem erro de CSP', async ({ page }) => {
    await loginViaToken(page, { ...empresa.admin, empresaId: empresa.empresaId, empresaNome: empresa.empresaNome });
    await clickNavItem(page, { grupo: 'assistencia-tecnica', dataView: 'assistencia' });
    await expect(page.locator('#atTbody tr').first()).toBeVisible({ timeout: 10000 });

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('[data-action="imprimir"]').first().click(),
    ]);

    const popupErrors = [];
    popup.on('console', (msg) => { if (msg.type() === 'error') popupErrors.push(msg.text()); });
    popup.on('pageerror', (err) => popupErrors.push(String(err)));

    await popup.waitForLoadState('domcontentloaded');
    await expect(popup).toHaveTitle(/OS /i);
    expect(popupErrors).toEqual([]);

    // Nenhuma violação de CSP registrada na página principal durante o fluxo
    expect(await getCspViolations(page)).toEqual([]);

    await popup.close();
  });
});
