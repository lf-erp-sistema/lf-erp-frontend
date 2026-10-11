'use strict';

// Servidor estático mínimo para o frontend durante os testes E2E.
// Replica EXATAMENTE os headers de frontend/vercel.json (inclusive CSP) —
// sem isso, testar "nenhum erro de CSP no console" seria um teste vazio,
// já que um `http-server` genérico não envia esses headers.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'frontend');
const PORT = Number(process.env.E2E_FRONTEND_PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json'
};

// Mantido em sincronia manual com frontend/vercel.json — se o CSP de produção
// mudar, atualize aqui também (ver teste tests/csp.spec.js).
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy':
    "default-src 'self'; " +
    "script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://browser.sentry-cdn.com; " +
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
    "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self' https://lf-erp-backend.onrender.com wss://lf-erp-backend.onrender.com http://localhost:* ws://localhost:* https://fonts.googleapis.com https://fonts.gstatic.com https://o4511749774442496.ingest.us.sentry.io https://browser.sentry-cdn.com https://cdn.jsdelivr.net; " +
    "worker-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none';"
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT, reqPath));
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found: ' + reqPath);
    }
    res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
    res.writeHead(200);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[e2e-static] frontend servido em http://localhost:${PORT} (com headers de vercel.json)`);
});
