'use strict';

const { test, expect, ENV, loginViaToken } = require('../fixtures/base');
const { getSharedEmpresa } = require('../fixtures/sharedEmpresa');

// Valida o gate de autorização de POST /alertas/disparar-preventivo:
// cron (x-cron-secret) sempre funciona sem JWT; chamada manual exige JWT +
// permissão financeiro/editar. Não existe botão na UI para disparar isso
// manualmente (é documentado como integração externa via cron-job.org em
// alertas.js) — então "pela interface" aqui é testado como uma chamada feita
// de dentro do contexto autenticado do navegador (fetch real da página),
// além da chamada direta via API. Tokens de gerente/funcionario já vêm
// prontos do seed compartilhado — nenhuma chamada extra a /login aqui.
test.describe('Alertas preventivos — autorização', () => {
  let empresa;

  test.beforeAll(() => {
    empresa = getSharedEmpresa();
  });

  test('cron válido executa sem JWT', async ({ request }) => {
    const resp = await request.post(`${ENV.BACKEND_URL}/alertas/disparar-preventivo`, {
      headers: { 'x-cron-secret': ENV.CRON_SECRET },
      data: { empresa_id: empresa.empresaId },
    });
    expect(resp.status()).toBe(200);
  });

  test('sem cron e sem JWT recebe 401/403', async ({ request }) => {
    const resp = await request.post(`${ENV.BACKEND_URL}/alertas/disparar-preventivo`, { data: {} });
    expect([401, 403]).toContain(resp.status());
  });

  test('usuário autenticado SEM permissão financeira recebe 403 (chamada direta)', async ({ request }) => {
    const resp = await request.post(`${ENV.BACKEND_URL}/alertas/disparar-preventivo`, {
      headers: { Authorization: `Bearer ${empresa.funcionario.token}` },
      data: {},
    });
    expect(resp.status()).toBe(403);
  });

  test('usuário autenticado SEM permissão financeira recebe 403 (via sessão no navegador)', async ({ page }) => {
    await loginViaToken(page, { ...empresa.funcionario, empresaId: empresa.empresaId, empresaNome: empresa.empresaNome });

    const resultado = await page.evaluate(async (backendUrl) => {
      const raw = sessionStorage.getItem('lf_erp_auth') || localStorage.getItem('lf_erp_auth');
      const token = JSON.parse(raw).authToken;
      const resp = await fetch(`${backendUrl}/alertas/disparar-preventivo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      return { status: resp.status };
    }, ENV.BACKEND_URL);

    expect(resultado.status).toBe(403);
  });

  test('usuário com financeiro/editar (gerente) consegue disparar', async ({ request }) => {
    const resp = await request.post(`${ENV.BACKEND_URL}/alertas/disparar-preventivo`, {
      headers: { Authorization: `Bearer ${empresa.gerente.token}` },
      data: {},
    });
    expect(resp.status()).toBe(200);
  });
});
