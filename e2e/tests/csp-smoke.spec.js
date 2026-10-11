'use strict';

const { test, expect, getCspViolations, loginViaToken } = require('../fixtures/base');
const { getSharedEmpresa } = require('../fixtures/sharedEmpresa');

// Varredura ampla: navega por um conjunto representativo de telas e garante
// que nenhuma gera violação real de CSP nem erro de console — item 3 do
// roteiro de QA ("nenhum script inline bloqueado, nenhum botão essencial
// deixa de funcionar por CSP").
const VIEWS = [
  'dashboard', 'produtos', 'clientes', 'fornecedores', 'compras', 'vendas',
  'estoque', 'contas-pagar', 'contas-receber', 'fluxo-caixa', 'relatorios',
  'assistencia', 'crm', 'fidelidade', 'marketplace', 'nfe',
];

test.describe('CSP — varredura de telas', () => {
  let empresa;

  test.beforeAll(() => {
    empresa = getSharedEmpresa();
  });

  test('nenhuma tela navegada gera violação de CSP ou erro de console', async ({ page }) => {
    await loginViaToken(page, { ...empresa.admin, empresaId: empresa.empresaId, empresaNome: empresa.empresaNome });

    const falhasPorTela = [];

    for (const view of VIEWS) {
      let botao = page.locator(`.nav-subitem[data-view="${view}"]`).first();
      if (await botao.count() === 0) botao = page.locator(`[data-view="${view}"]`).first();
      if (await botao.count() === 0) continue;

      // Subitens pertencem a grupos recolhíveis: abra o grupo pai antes de
      // disparar o clique, evitando falsos negativos por elemento oculto.
      await botao.evaluate((el) => {
        const grupo = el.closest('.nav-group');
        if (grupo && !grupo.classList.contains('open')) {
          grupo.querySelector('.nav-group__toggle')?.click();
        }
        el.click();
      });
      await page.waitForTimeout(400);

      const cspViolations = await getCspViolations(page);
      if (cspViolations.length > 0 || page.consoleErrors.length > 0) {
        falhasPorTela.push({ view, cspViolations: [...cspViolations], consoleErrors: [...page.consoleErrors] });
      }
      // Limpa pra próxima tela não acumular ruído de telas anteriores
      await page.evaluate(() => { window.__cspViolations = []; });
      page.consoleErrors.length = 0;
    }

    expect(falhasPorTela, JSON.stringify(falhasPorTela, null, 2)).toEqual([]);
  });

  test('CSP também é respeitada nas telas públicas (checkout, admin, pdv-cliente, portal)', async ({ page, request }) => {
    const PAGINAS_PUBLICAS = ['/checkout.html#token-invalido', '/admin.html', '/pdv-cliente.html', '/portal.html'];
    for (const url of PAGINAS_PUBLICAS) {
      await page.goto(url);
      await page.waitForTimeout(300);
      expect(await getCspViolations(page), `violação de CSP em ${url}`).toEqual([]);
      await page.evaluate(() => { window.__cspViolations = []; });
    }
  });
});
