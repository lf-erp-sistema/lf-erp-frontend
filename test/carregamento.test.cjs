'use strict';
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function load(file, api = {}, hooks = 'state, recarregar', overrides = '') {
  const elements = new Map();
  const listeners = new Map();
  const document = {
    getElementById: id => elements.get(id) || null, querySelectorAll: () => [],
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  };
  const context = vm.createContext({ api, document, window: {},
    console: { error() {} }, debounce: fn => fn, buildFriendlyError: e => e.message,
    escapeHtml: v => String(v ?? ''),
    renderSpy: mock.fn(), skeletonSpy: mock.fn(), messageSpy: mock.fn(), feedbackSpy: mock.fn(),
    localStorage: { getItem: () => null }, URL, ...api.__globals,
  });
  const source = fs.readFileSync(path.join(__dirname, `../js/${file}.js`), 'utf8')
    .replace(/^\uFEFF/, '').replace(/^import .*;\r?\n/gm, '')
    .replace(/^export default .*;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(source + '\n' + overrides + `\nglobalThis.hooks = { ${hooks} };`, context);
  return { ...context, elements, listeners };
}
const response = id => ({ contas: [{ id }], resumo: { total: id }, paginacao: { total: 1, total_paginas: 1 } });

for (const tipo of ['Pagar', 'Receber']) {
  function moduleFor(request) {
    return load(`contas${tipo}`, { getEmpresaId: () => 7, [`getContas${tipo}`]: request },
      'state, recarregar, bindEventos',
      'render = renderSpy; renderSkeleton = skeletonSpy; showMessage = messageSpy;');
  }
  test(`${tipo}: preserva tabela e consulta página/período sem toast de carregamento`, async () => {
    const req = deferred(); let params;
    const m = moduleFor(p => { params = p; return req.promise; });
    m.hooks.state.contas = [{ id: 1 }];
    m.hooks.state.periodo = { dataInicial: '2026-09-01', dataFinal: '2026-09-30' };
    const pending = m.hooks.recarregar();
    assert.equal(m.hooks.state.contas[0].id, 1);
    assert.equal(m.skeletonSpy.mock.callCount(), 0);
    assert.equal(m.messageSpy.mock.callCount(), 0);
    assert.equal(params.page, 1); assert.equal(params.limit, 50);
    assert.equal(params.data_inicial, '2026-09-01');
    req.resolve(response(2)); await pending;
    assert.equal(m.hooks.state.contas[0].id, 2);
    assert.equal(m.renderSpy.mock.callCount(), 1);
    assert.equal(m.hooks.state.loading, false);
  });
  test(`${tipo}: somente a resposta do último filtro altera os dados`, async () => {
    const old = deferred(), current = deferred(); let calls = 0;
    const m = moduleFor(() => calls++ ? current.promise : old.promise);
    const first = m.hooks.recarregar(), second = m.hooks.recarregar();
    current.resolve(response(20)); await second;
    old.resolve(response(10)); await first;
    assert.equal(m.hooks.state.contas[0].id, 20);
    assert.equal(m.renderSpy.mock.callCount(), 1);
  });
  test(`${tipo}: erro antigo não encerra a consulta atual`, async () => {
    const old = deferred(), current = deferred(); let calls = 0;
    const m = moduleFor(() => calls++ ? current.promise : old.promise);
    const first = m.hooks.recarregar(), second = m.hooks.recarregar();
    old.reject(new Error('antigo')); await first;
    assert.equal(m.hooks.state.loading, true);
    assert.equal(m.messageSpy.mock.callCount(), 0);
    current.resolve(response(20)); await second;
    assert.equal(m.hooks.state.loading, false);
  });
  test(`${tipo}: falha preserva dados e informa erro`, async () => {
    const m = moduleFor(async () => { throw new Error('Sem conexão'); });
    m.hooks.state.contas = [{ id: 1 }]; await m.hooks.recarregar();
    assert.equal(m.hooks.state.contas[0].id, 1);
    assert.equal(m.messageSpy.mock.calls[0].arguments[1], 'error');
    assert.equal(m.hooks.state.loading, false);
  });
  test(`${tipo}: redesenhos não acumulam eventos globais`, () => {
    const m = moduleFor(async () => response(1));
    m.hooks.bindEventos(); m.hooks.bindEventos();
    assert.equal(m.listeners.get('click').size, 1);
  });
}

test('fluxo: preserva dados e ignora mês antigo', async () => {
  const old = deferred(), current = deferred(); let calls = 0;
  const api = { getEmpresaId: () => 7, getEmpresaNome: () => 'Loja',
    getFluxoCaixa: () => calls++ ? current.promise : old.promise, request: async () => ({}) };
  const m = load('fluxoCaixa', api, 'state, recarregar', 'render = renderSpy; renderCashflowFuturo = () => {}; renderSkeleton = skeletonSpy; showMessage = messageSpy;');
  m.hooks.state.movimentos = [{ id: 1 }];
  const first = m.hooks.recarregar(), second = m.hooks.recarregar();
  assert.equal(m.hooks.state.movimentos[0].id, 1);
  current.resolve({ movimentos: [{ id: 20 }] }); await second;
  old.resolve({ movimentos: [{ id: 10 }] }); await first;
  assert.equal(m.hooks.state.movimentos[0].id, 20);
  assert.equal(m.skeletonSpy.mock.callCount(), 0);
  assert.equal(m.messageSpy.mock.callCount(), 0);
});
test('fluxo: período não recarrega projeção independente', async () => {
  const request = mock.fn();
  const m = load('fluxoCaixa', { getEmpresaId: () => 7, getFluxoCaixa: async () => ({}), request },
    'recarregar', 'render = renderSpy; renderCashflowFuturo = () => {};');
  await m.hooks.recarregar({ atualizarProjecao: false });
  assert.equal(request.mock.callCount(), 0);
});
test('projeção: último horizonte vence respostas fora de ordem', async () => {
  const old = deferred(), current = deferred(); let calls = 0;
  const m = load('fluxoCaixa', { getEmpresaId: () => 7, getEmpresaNome: () => 'Loja',
    request: () => calls++ ? current.promise : old.promise }, 'state, carregarCashflowFuturo');
  const first = m.hooks.carregarCashflowFuturo(30), second = m.hooks.carregarCashflowFuturo(90);
  current.resolve({ dias: 90 }); await second; old.resolve({ dias: 30 }); await first;
  assert.equal(m.hooks.state.cashflowFuturo.dias, 90);
});
test('relatórios: período antigo não marca a aba nova como concluída', async () => {
  const old = deferred(), current = deferred(); let calls = 0;
  const m = load('relatoriosFinanceiros', { getEmpresaId: () => 7,
    getRelatorioFinanceiroResumo: () => calls++ ? current.promise : old.promise },
    'state, recarregarModulo', 'render = renderSpy; renderLoading = skeletonSpy; renderFeedback = feedbackSpy;');
  const first = m.hooks.recarregarModulo(), second = m.hooks.recarregarModulo();
  old.resolve({ total: 9 }); await first;
  assert.equal(m.hooks.state.abasCarregadas.has('resumo'), false);
  current.resolve({ total: 10 }); await second;
  assert.equal(m.hooks.state.resumo.total, 10);
  assert.equal(m.skeletonSpy.mock.callCount(), 0);
});
test('relatórios: falha não mostra sucesso e preserva último resultado válido', async () => {
  const m = load('relatoriosFinanceiros', { getEmpresaId: () => 7,
    getRelatorioFinanceiroResumo: async () => { throw new Error('Sem conexão'); } },
    'state, recarregarModulo', 'render = renderSpy; renderFeedback = feedbackSpy;');
  m.hooks.state.resumo = { total: 100 };
  await m.hooks.recarregarModulo('Relatórios atualizados.');
  assert.equal(m.hooks.state.resumo.total, 100);
  assert.equal(m.renderSpy.mock.callCount(), 0);
  assert.equal(m.feedbackSpy.mock.calls.at(-1).arguments[1], 'error');
});
test('auditoria: último filtro é aplicado mesmo com consulta em andamento', async () => {
  const old = deferred(), current = deferred(); let calls = 0;
  const m = load('auditoriaFinanceira', { request: () => calls++ ? current.promise : old.promise },
    'state, carregarLogs', 'renderUI = () => "lista"; bind = () => {};');
  m.elements.set('auditoriaFinanceiraContainer', { innerHTML: 'anterior', setAttribute() {} });
  const first = m.hooks.carregarLogs(), second = m.hooks.carregarLogs();
  current.resolve({ logs: [{ id: 20 }] }); await second;
  old.resolve({ logs: [{ id: 10 }] }); await first;
  assert.equal(m.hooks.state.logs[0].id, 20);
});
test('dashboard: preserva atualização, reinicia em outra empresa e informa falha', async () => {
  let empresa = 7, fail = false;
  const m = load('dashboard', { getEmpresaId: () => empresa, getAuthToken: () => 'sessao', getUserTipo: () => 'funcionario',
    getDashboard: async () => { if (fail) throw new Error('Sem conexão'); return {}; } }, 'loadDashboard',
    `renderDashboardSkeleton = skeletonSpy; renderErrorState = () => {};
    getDashboardConfig = () => ({ 'chart-vendas': false, 'chart-forma-pagamento': false });
    bindDashboardConfig = () => {}; renderKpis = renderSpy; renderTopProdutos = () => {};
    renderAlertas = () => {}; renderTabelaPrecos = () => {}; destroyCharts = () => {};
    _setChartSkeletons = () => {}; applyDashboardConfig = () => {}; showMessage = messageSpy;`);
  await m.hooks.loadDashboard(); await m.hooks.loadDashboard();
  assert.equal(m.skeletonSpy.mock.callCount(), 1);
  empresa = 8; await m.hooks.loadDashboard();
  assert.equal(m.skeletonSpy.mock.callCount(), 2);
  const renders = m.renderSpy.mock.callCount(); fail = true; await m.hooks.loadDashboard();
  assert.equal(m.renderSpy.mock.callCount(), renders);
  assert.equal(m.messageSpy.mock.calls.at(-1).arguments[1], 'error');
});
test('catálogo: obtém 501 itens em lotes e página explícita conserva metadados', async () => {
  const m = load('api', {}, 'getProdutos, getProdutosPagina', `ensureEmpresa = () => 'Loja';
    request = async (url, {query}) => ({dados: Array.from({length: Math.min(query.limit, 501-query.offset)}, (_,i) => ({id: query.offset+i+1})), total:501, limite:query.limit, offset:query.offset});`);
  const all = await m.hooks.getProdutos();
  assert.equal(all.length, 501); assert.equal(all.at(-1).id, 501);
  const page = await m.hooks.getProdutosPagina({ limit: 50, offset: 500 });
  assert.equal(page.total, 501); assert.equal(page.dados[0].id, 501);
});
test('CSV: neutraliza fórmulas, aspas e controles sem alterar números reais', () => {
  const m = load('exportUtils', {}, 'csvCell');
  for (const input of ['=1+1', '+CMD', '-1+2', '@SUM(A1)', '\t=1', '\r=1', '\n=1', '  =1']) {
    assert.ok(m.hooks.csvCell(input).startsWith('"\''));
  }
  assert.equal(m.hooks.csvCell(-12), '"-12"');
  assert.equal(m.hooks.csvCell('-12,00'), '"-12,00"');
  assert.equal(m.hooks.csvCell('a"b'), '"a""b"');
});

test('logout remove credencial local e informa se a revogação no servidor falhou', async () => {
  const removed = [];
  const m = load('auth', { request: async () => { throw new Error('offline'); }, __globals: {
    localStorage: { getItem: () => null, removeItem: key => removed.push(key) },
    sessionStorage: { removeItem: key => removed.push(key) },
  } }, 'logout');
  const pending = m.hooks.logout();
  assert.equal(removed.length, 2);
  assert.equal(await pending, false);
});

test('BI informa falha parcial sem substituir KPIs por zeros e aceita tendência normalizada', async () => {
  const m = load('bi', { get: async route => {
    if (route.includes('comparativo')) throw new Error('offline');
    if (route.includes('tendencia')) return [{ mes: '2026-10', receita: 100 }];
    return { sucesso: true };
  }, __globals: { showToast() {} } }, 'carregarBI', `
    getFiltros = () => ({ inicio: '', fim: '', meses: 12 }); showToast = messageSpy;
    renderKpis = renderSpy; renderTendencia = skeletonSpy; renderMixPagamentos = () => {};
    renderMargemCategorias = () => {}; renderFunil = () => {}; renderTopProdutos = () => {}; renderTopClientes = () => {};`);
  await m.hooks.carregarBI();
  assert.equal(m.renderSpy.mock.callCount(), 0);
  assert.equal(m.skeletonSpy.mock.callCount(), 1);
  assert.equal(m.messageSpy.mock.calls[0].arguments[1], 'error');
});
