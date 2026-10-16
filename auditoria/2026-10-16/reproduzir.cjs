'use strict';
// Somente probes locais: banco, DNS e transporte substituídos por mocks.
// Não carrega .env, não conecta ao PostgreSQL e não chama serviços externos.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { createRequire } = require('module');
const root = path.resolve(__dirname, '../..');
const backend = path.join(root, 'backend');
const reqBackend = createRequire(path.join(backend, 'package.json'));
process.env.JWT_SECRET = 'auditoria-local-sem-acesso-a-producao-2026';
process.env.NODE_ENV = 'test';
const resultados = [];
async function probe(id, fn) {
  await fn();
  resultados.push({ id, resultado: 'comportamento confirmado localmente' });
}
function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}
function loadFrontend(name, context, hooks) {
  const source = fs.readFileSync(path.join(root, 'frontend/js', name + '.js'), 'utf8')
    .replace(/^\uFEFF/, '').replace(/^import .*;\r?\n/gm, '').replace(/^export default .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  vm.runInNewContext(source + '\n' + hooks, context);
  return context;
}

(async () => {
  await probe('SEC-01-gerente-cria-admin', async () => {
    let tipoInserido;
    const tx = { release() {}, async query(sql, params) {
      if (sql.includes('INSERT INTO usuarios')) { tipoInserido = params[5]; return { rows: [{ id: 999 }], rowCount: 1 }; }
      return { rows: [] };
    } };
    const router = reqBackend('./routes/usuarios.routes')({
      auth() {}, writeRateLimiter() {}, requirePermissao: () => () => {},
      pool: { query: async () => ({ rows: [], rowCount: 0 }), connect: async () => tx },
      validarAcessoEmpresa: async () => ({ id: 1, nome: 'Empresa ficticia' }),
      validarLimitePlano: async () => ({ permitido: true }),
      validarForcaSenha: () => ({ valido: true }), registrarAuditoria: async () => {},
    });
    const handler = router.stack.find(l => l.route?.path === '/usuarios' && l.route.methods.post).route.stack.at(-1).handle;
    const res = response();
    await handler({ user: { id: 7, tipo: 'gerente' }, body: {
      nome: 'Auditoria', usuario: 'auditoria-ficticia', senha: 'Exemplo123', tipo: 'admin', empresa: 'Empresa ficticia',
    } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(tipoInserido, 'admin');
  });
  const authModule = reqBackend('./middleware/auth');
  const authSource = fs.readFileSync(path.join(backend, 'server.js'), 'utf8');
  const wrapper = authSource.slice(authSource.indexOf('async function auth(req, res, next)'), authSource.indexOf('\nconst {\n  obterConfigEmpresa'));
  // O arquivo usa CRLF no Windows; delimitação alternativa independente de newline.
  const wrapperSource = wrapper.includes('createFinanceiroOps')
    ? authSource.slice(authSource.indexOf('async function auth(req, res, next)'), authSource.indexOf('const {\r\n  obterConfigEmpresa'))
    : wrapper;
  async function checkAuth(obterSenhaAlteradaEm, userId) {
    const ctx = { authJwt: authModule.auth, obterSenhaAlteradaEm,
      obterPlanoEmpresa: async () => ({ bloqueada: false }), hoje: () => '2026-10-16',
      console: { error() {} } };
    vm.runInNewContext(wrapperSource + '\nglobalThis.handler = auth;', ctx);
    const jwt = reqBackend('jsonwebtoken');
    const token = jwt.sign({ id: userId, tipo: 'admin', empresa_id: 1, empresa: 'Empresa ficticia', senha_v: 0 }, process.env.JWT_SECRET);
    let next = false;
    const res = response();
    const request = { headers: { authorization: 'Bearer ' + token }, method: 'GET', path: '/produtos/Empresa' };
    await ctx.handler(request, res, () => { next = true; });
    // authJwt chama callback async sem devolver a promise; esgota microtasks.
    await new Promise(resolve => setImmediate(resolve));
    return { next, request, res };
  }
  await probe('SEC-02-usuario-excluido-token-aceito', async () => {
    const helpers = authModule.createAuthHelpers({ query: async () => ({ rows: [], rowCount: 0 }) });
    const result = await checkAuth(helpers.obterSenhaAlteradaEm, 900001);
    assert.equal(result.next, true);
  });
  await probe('SEC-03-falha-banco-auth-libera', async () => {
    const result = await checkAuth(async () => { throw new Error('falha simulada'); }, 900002);
    assert.equal(result.next, true);
  });
  await probe('SEC-02b-admin-rebaixado-mantem-claim-admin', async () => {
    const helpers = authModule.createAuthHelpers({ query: async () => ({ rows: [{ tipo: 'funcionario', senha_alterada_em: null }], rowCount: 1 }) });
    const result = await checkAuth(helpers.obterSenhaAlteradaEm, 900003);
    assert.equal(result.next, true);
    assert.equal(result.request.user.tipo, 'admin');
    let acesso = false;
    await reqBackend('./utils/permissoes').requirePermissao({ query: async () => { throw new Error('não deveria consultar'); } }, 'usuarios', 'editar')
      (result.request, result.res, () => { acesso = true; });
    assert.equal(acesso, true);
  });
  await probe('SEC-04-ipv6-privado-aceito-pelo-guard', async () => {
    const dns = require('dns').promises;
    const original = dns.lookup;
    const guard = reqBackend('./utils/ssrfGuard');
    try {
      for (const address of ['fc01::1', 'fe90::1', '::ffff:7f00:1']) {
        dns.lookup = async () => [{ address, family: 6 }];
        assert.equal(await guard.validarHostExterno('dominio-ficticio.invalid'), true);
      }
    } finally { dns.lookup = original; }
  });
  await probe('SEC-05-csv-formula-sem-neutralizacao', async () => {
    let captured;
    const ctx = { Blob: class { constructor(parts) { captured = parts.join(''); } },
      URL: { createObjectURL: () => 'blob:auditoria', revokeObjectURL() {} },
      document: { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } } };
    loadFrontend('exportUtils', ctx, 'globalThis.exportar = exportCSV;');
    ctx.exportar([{ Nome: '=1+1' }], 'teste');
    assert.equal(captured.split('\r\n').at(-1), '=1+1');
  });
  await probe('SEC-06-reset-portal-nao-revoga-token', async () => {
    const jwt = reqBackend('jsonwebtoken');
    const token = jwt.sign({ id: 9, tipo: 'cliente', empresa_id: 1 }, process.env.JWT_SECRET + '_portal_v1', { expiresIn: '12h' });
    const router = reqBackend('./routes/portal.routes')({ auth() {}, writeRateLimiter() {},
      pool: { query: async sql => ({ rowCount: 1, rows: sql.includes('UPDATE clientes')
        ? [{ id: 9, nome: 'Cliente ficticio', portal_ativo: true }] : [{ portal_ativo: true }] }) } });
    const reset = router.stack.find(l => l.route?.path === '/admin/clientes/:id/senha').route.stack.at(-1).handle;
    const res = response();
    await reset({ params: { id: 9 }, user: { empresa_id: 1 }, body: { senha: 'NovaSenha123' } }, res);
    assert.equal(res.statusCode, 200);
    const authCliente = router.stack.find(l => l.route?.path === '/resumo').route.stack[0].handle;
    let next = false;
    await authCliente({ headers: { authorization: 'Bearer ' + token } }, response(), () => { next = true; });
    assert.equal(next, true);
  });
  await probe('SEC-07-blacklist-nao-propaga-entre-instancias', async () => {
    const source = fs.readFileSync(path.join(backend, 'middleware/auth.js'), 'utf8');
    function instance() {
      const ctx = { require: reqBackend, process, Buffer, module: { exports: {} }, setInterval: () => ({ unref() {} }) };
      vm.runInNewContext(source, ctx);
      return ctx.module.exports;
    }
    const a = instance(), b = instance();
    const token = reqBackend('jsonwebtoken').sign({ id: 7, tipo: 'admin', empresa_id: 1 }, process.env.JWT_SECRET);
    a.tokenBlacklist.set(a._tokenHash(token), Date.now());
    let next = false;
    b.auth({ headers: { authorization: 'Bearer ' + token } }, response(), () => { next = true; });
    assert.equal(next, true);
  });
  await probe('PERF-01-adapter-descarta-total-produtos', async () => {
    const ctx = { localStorage: { getItem: () => null }, window: {} };
    loadFrontend('api', ctx, `ensureEmpresa = () => 'Empresa'; request = async () => ({ dados: [{ id: 1 }], total: 501, limite: 100, offset: 0 }); globalThis.buscar = getProdutos;`);
    const result = await ctx.buscar();
    assert.equal(Array.isArray(result), true);
    assert.equal(result.total, undefined);
  });
  await probe('OBS-01-relatorio-falha-marcada-como-sucesso', async () => {
    const feedbacks = [];
    const ctx = { api: { getEmpresaId: () => 1, getRelatorioFinanceiroResumo: async () => { throw new Error('falha simulada'); } },
      document: { getElementById: () => null }, console: { error() {} } };
    loadFrontend('relatoriosFinanceiros', ctx, 'globalThis.recarregar = recarregarModulo; render = () => {}; renderFeedback = (m,t) => globalThis.feedbacks.push([m,t]);');
    ctx.feedbacks = feedbacks;
    await ctx.recarregar('Relatorios atualizados.');
    assert.ok(feedbacks.some(([m, t]) => t === 'success'));
  });
  await probe('PERF-02-bi-executa-tendencia-duas-vezes', async () => {
    const sqls = [];
    const router = reqBackend('./routes/bi.routes')({ auth() {}, requirePermissao: () => () => {},
      pool: { query: async sql => { sqls.push(sql); return { rows: [{ total: 0 }] }; } },
      validarAcessoEmpresa: async () => ({ id: 1, nome: 'Empresa ficticia' }), hoje: () => '2026-10-16' });
    const handler = router.stack.find(l => l.route?.path === '/resumo-executivo').route.stack.at(-1).handle;
    const res = response();
    await handler({ protocol: 'http', get: () => 'localhost', query: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(sqls.filter(s => s.includes("'12 months'::interval")).length, 2);
  });
  await probe('OPS-02-json-upload-bloqueado-em-1mb', async () => {
    const express = reqBackend('express');
    const supertest = reqBackend('supertest');
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.post('/importar', express.json({ limit: '50mb' }), (req, res) => res.json({ ok: true }));
    app.use((err, req, res, next) => res.status(err.status || 500).json({ erro: err.type }));
    const res = await supertest(app).post('/importar').send({ conteudo: 'a'.repeat(1100000) });
    assert.equal(res.status, 413);
  });
  fs.writeFileSync(path.join(__dirname, 'reproducoes.json'), JSON.stringify(resultados, null, 2) + '\n');
  console.log(JSON.stringify(resultados, null, 2));
})().catch(err => { console.error(err.stack); process.exitCode = 1; });
