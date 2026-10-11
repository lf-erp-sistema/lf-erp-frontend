'use strict';

const { test, expect, loginViaToken, clickNavItem } = require('../fixtures/base');
const { getSharedEmpresa } = require('../fixtures/sharedEmpresa');

const LARGURAS = [360, 768, 1024, 1440];

function entrar(page, empresa) {
  return loginViaToken(page, { ...empresa.admin, empresaId: empresa.empresaId, empresaNome: empresa.empresaNome });
}

// Luminância relativa (WCAG) — usada só pra detectar "mesma cor do fundo",
// não é uma auditoria completa de contraste AA/AAA.
function contraste(page) {
  return page.evaluate(() => {
    function luminancia(rgb) {
      const m = rgb.match(/\d+/g)?.map(Number) || [0, 0, 0];
      const [r, g, b] = m.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    function ratio(fg, bg) {
      const l1 = luminancia(fg) + 0.05;
      const l2 = luminancia(bg) + 0.05;
      return l1 > l2 ? l1 / l2 : l2 / l1;
    }
    function fundoEfetivo(el) {
      let node = el;
      while (node) {
        const style = getComputedStyle(node);
        const bg = style.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
        // Gradientes ficam em backgroundImage enquanto backgroundColor permanece
        // transparente. A primeira cor aproxima o fundo realmente pintado.
        const gradiente = style.backgroundImage.match(/rgba?\(([^)]+)\)/);
        if (gradiente) return `rgb(${gradiente[1].split(',').slice(0, 3).join(',')})`;
        node = node.parentElement;
      }
      return 'rgb(255,255,255)';
    }
    const seletores = ['body', '.sidebar', '#topbarUserName', '.nav-subitem', '.btn-primary'];
    return seletores.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, ok: true, motivo: 'elemento ausente (ignorado)' };
      const cor = getComputedStyle(el).color;
      const bg = fundoEfetivo(el);
      return { sel, ratio: ratio(cor, bg), cor, bg };
    });
  });
}

test.describe('Responsividade', () => {
  let empresa;

  test.beforeAll(() => {
    empresa = getSharedEmpresa();
  });

  test('nenhuma largura testada gera scroll horizontal na página', async ({ page }) => {
    await entrar(page, empresa);

    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: 800 });
      await page.waitForTimeout(150); // dá tempo pro CSS de media query assentar

      const overflow = await page.evaluate(() => {
        const docEl = document.documentElement;
        return docEl.scrollWidth - docEl.clientWidth;
      });
      expect(overflow, `largura ${largura}px gerou overflow horizontal de ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test('menu mobile: hambúrguer abre/fecha o sidebar em 360px; some em desktop', async ({ page }) => {
    await entrar(page, empresa);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('#mobileSidebarBtn')).toBeHidden();

    await page.setViewportSize({ width: 360, height: 800 });
    await expect(page.locator('#mobileSidebarBtn')).toBeVisible();

    await page.click('#mobileSidebarBtn');
    await expect(page.locator('#sidebar')).toHaveClass(/mobile-open/);
    await expect(page.locator('#sidebarOverlay')).toBeVisible();

    await page.click('#sidebarOverlay');
    await expect(page.locator('#sidebar')).not.toHaveClass(/mobile-open/);
  });

  test('tabela com rolagem horizontal contida (não vaza pra página) em 360px', async ({ page }) => {
    await entrar(page, empresa);
    await page.setViewportSize({ width: 360, height: 800 });
    await clickNavItem(page, { grupo: 'cadastros', dataView: 'produtos' });

    const wrapper = page.locator('[data-view="produtos"] .table-wrapper').first();
    await expect(wrapper).toBeVisible({ timeout: 10000 });

    const overflowX = await wrapper.evaluate((el) => getComputedStyle(el).overflowX);
    expect(['auto', 'scroll']).toContain(overflowX);

    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(pageOverflow).toBeLessThanOrEqual(1);
  });
});

test.describe('Tema claro/escuro', () => {
  let empresa;

  test.beforeAll(() => {
    empresa = getSharedEmpresa();
  });

  for (const tema of ['light', 'dark']) {
    test(`tema ${tema}: nenhum elemento-chave fica com texto invisível (contraste ~igual ao fundo)`, async ({ page }) => {
      await entrar(page, empresa);

      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
      await page.waitForTimeout(100);

      const resultados = await contraste(page);
      for (const r of resultados) {
        if (r.ok) continue;
        expect(r.ratio, `${r.sel} no tema ${tema}: cor=${r.cor} fundo=${r.bg}`).toBeGreaterThan(1.8);
      }
    });
  }
});
