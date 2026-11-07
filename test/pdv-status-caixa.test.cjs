const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup(request, online = true) {
  const elements = new Map([
    ['pdvCaixaStatus', { dataset: {}, textContent: '' }],
    ['pdvCaixaOperador', { textContent: '' }]
  ]);
  let empresaId = 1;
  const source = fs.readFileSync(path.join(__dirname, '../js/pdv.js'), 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export default .*;?\r?\n/gm, '')
    .replace(/^export /gm, '');
  const context = vm.createContext({
    api: { getEmpresaId: () => empresaId, getCaixaSessaoAtiva: request },
    navigator: { onLine: online },
    document: { getElementById: id => elements.get(id) }
  });
  vm.runInContext(source + '\nglobalThis.pdv = PDVModule;', context);
  return { pdv: context.pdv, elements, trocarEmpresa: () => empresaId++ };
}

test('indicador usa a sessão da resposta: caixa aberto, fechado e falha de rede', async () => {
  for (const [response, expected, detail] of [
    [{ sessao: { usuario_nome: '<Operador>' } }, 'open', 'Aberto por <Operador>'],
    [{ sessao: null, movimentos: [] }, 'closed', 'Abra o caixa no módulo Caixa'],
    [new Error('Sem rede'), 'unknown', 'Use Atualizar dados para tentar novamente']
  ]) {
    const m = setup(async () => { if (response instanceof Error) throw response; return response; });
    await m.pdv.carregarStatusCaixa();
    assert.equal(m.elements.get('pdvCaixaStatus').dataset.status, expected);
    assert.equal(m.elements.get('pdvCaixaOperador').textContent, detail);
  }
});

test('offline não consulta API nem apresenta o caixa como aberto ou fechado', async () => {
  const m = setup(() => { throw new Error('Não deve consultar'); }, false);
  await m.pdv.carregarStatusCaixa();
  assert.equal(m.elements.get('pdvCaixaStatus').dataset.status, 'unknown');
  assert.equal(m.elements.get('pdvCaixaOperador').textContent, 'Sem conexão para consultar');
});

test('respostas antigas não substituem a consulta mais recente', async () => {
  let resolveOld;
  let calls = 0;
  const m = setup(() => ++calls === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ sessao: null }));
  const first = m.pdv.carregarStatusCaixa();
  await m.pdv.carregarStatusCaixa();
  resolveOld({ sessao: { usuario_nome: 'Antigo' } });
  await first;
  assert.equal(m.elements.get('pdvCaixaStatus').dataset.status, 'closed');
});

test('consulta de outra empresa ou de tela substituída não altera o indicador', async () => {
  for (const change of ['empresa', 'tela']) {
    let resolve;
    const m = setup(() => new Promise(done => { resolve = done; }));
    const first = m.pdv.carregarStatusCaixa();
    if (change === 'empresa') m.trocarEmpresa();
    else m.elements.set('pdvCaixaStatus', { dataset: {}, textContent: 'Nova tela' });
    resolve({ sessao: { usuario_nome: 'Antigo' } });
    await first;
    assert.notEqual(m.elements.get('pdvCaixaStatus').dataset.status, 'open');
    assert.notEqual(m.elements.get('pdvCaixaOperador').textContent, 'Aberto por Antigo');
  }
});
