const CACHE_NAME = 'lf-erp-v2';

const SHELL = [
  '/index.html',
  '/admin.html',
  '/css/style.css',
  '/css/operacao.css',
  '/manifest.json',
];

// Instala e pré-cacheia o shell mínimo
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// Remove caches de versões antigas
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('lf-erp-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Estratégia network-first com fallback para cache
// Requisições cross-origin (API no Render, CDNs) passam direto sem interceptação
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Não interceptar recursos externos (API Render, Google Fonts, CDN Font Awesome)
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Cacheia respostas bem-sucedidas do próprio domínio
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        // Fallback para cache; se não tiver, retorna index.html para navegação
        caches.match(e.request).then(
          (cached) =>
            cached ||
            (e.request.headers.get('Accept')?.includes('text/html')
              ? caches.match('/index.html')
              : Response.error())
        )
      )
  );
});
