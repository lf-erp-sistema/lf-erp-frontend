// Revisão local do frontend com a API real, bloqueando gravações de negócio.
// Executar na raiz do projeto: node auditoria/2026-11-07/servidor-revisao.cjs
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../frontend');
const HOST = '127.0.0.1';
const PORT = 4174;
const AUTH_POSTS = new Set(['/login', '/auth/refresh', '/auth/logout']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

function json(res, status, mensagem) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ erro: mensagem, error: mensagem, message: mensagem }));
}

function proxy(req, res, url) {
  const origem = req.headers.origin;
  if ((origem && ![`http://${HOST}:${PORT}`, `http://localhost:${PORT}`].includes(origem))
    || req.headers['sec-fetch-site'] === 'cross-site') {
    return json(res, 403, 'A revisão aceita apenas o navegador local.');
  }
  const apiPath = url.pathname.slice('/api'.length);
  if (req.method !== 'GET' && !(req.method === 'POST' && AUTH_POSTS.has(apiPath))) {
    req.resume();
    return json(res, 403, 'Modo de revisão: gravações bloqueadas. Nenhum dado foi alterado.');
  }
  const headers = { accept: req.headers.accept || 'application/json' };
  // Encaminha apenas os cabeçalhos exigidos pela API. Não registra credenciais.
  for (const name of ['authorization', 'content-type', 'content-length']) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }
  const upstream = https.request({
    hostname: 'lf-erp-backend.onrender.com', port: 443,
    path: apiPath + url.search, method: req.method, headers
  }, response => {
    const outHeaders = { 'Cache-Control': 'no-store' };
    for (const name of ['content-type', 'retry-after', 'www-authenticate']) {
      if (response.headers[name]) outHeaders[name] = response.headers[name];
    }
    res.writeHead(response.statusCode, outHeaders);
    response.pipe(res);
    response.on('error', () => res.destroy());
  });
  upstream.setTimeout(90000, () => upstream.destroy(new Error('Tempo de conexão excedido')));
  upstream.on('error', () => {
    if (!res.headersSent) json(res, 502, 'Não foi possível acessar a API. Tente novamente em instantes.');
    else res.destroy();
  });
  res.on('close', () => upstream.destroy());
  req.on('error', () => upstream.destroy());
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname.startsWith('/api/')) return proxy(req, res, url);
  if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, 'Método não permitido.');
  if (url.pathname === '/__review/bootstrap.js') {
    res.writeHead(200, { 'Content-Type': MIME['.js'] });
    return res.end(`
      window.LF_ERP_API_URL = location.origin + '/api';
      // Evita que a revisão instale um cache com dados reais neste endereço.
      if ('serviceWorker' in navigator) navigator.serviceWorker.register = async () => ({});
      document.addEventListener('DOMContentLoaded', () => {
        document.title = 'Revisão local | LF ERP';
        const aviso = document.createElement('div');
        aviso.textContent = 'Revisão local · dados reais · gravações bloqueadas';
        aviso.setAttribute('role', 'note');
        aviso.style.cssText = 'position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:9999;max-width:90vw;padding:5px 12px;border-radius:8px;background:#fef3c7;color:#78350f;border:1px solid #f59e0b;font:600 12px/1.4 system-ui;text-align:center;pointer-events:none';
        document.body.append(aviso);
      });
    `);
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return json(res, 400, 'Endereço inválido.'); }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || pathname.split(/[\\/]/).some(part => part.startsWith('.'))
    || !MIME[path.extname(file)] || pathname === '/sw.js') {
    return json(res, 403, 'Arquivo indisponível na revisão.');
  }
  fs.readFile(file, (error, data) => {
    if (error) return json(res, 404, 'Arquivo não encontrado.');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] });
    if (path.extname(file) === '.html') {
      data = data.toString('utf8').replace('<head>', '<head><script src="/__review/bootstrap.js"></script>');
    }
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `A porta ${PORT} já está em uso.` : 'Falha ao iniciar a revisão local.');
  process.exitCode = 1;
});
server.listen(PORT, HOST, () => {
  console.log(`Revisão local: http://${HOST}:${PORT}`);
  console.log('Use seu login habitual. Dados reais; gravações de negócio bloqueadas.');
});
