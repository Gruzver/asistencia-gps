/* ============================================================
   Service worker.

   El guia tiene que poder abrir la aplicacion en el Colca, donde
   no hay señal. Sin esto, la pantalla ni siquiera carga: el
   navegador no tiene de donde traer el HTML.

   Estrategias:
   · HTML  → red primero, cache de respaldo. Asi un despliegue
     nuevo llega enseguida, pero sin señal se abre igual.
   · Resto → cache primero con refresco en segundo plano. Lo que
     no cambia no debe costar una peticion en zona con mala red.

   REQUISITO OPERATIVO: la aplicacion tiene que haberse abierto
   al menos una vez CON cobertura. Un guia que llega al cañon sin
   haberla abierto nunca no tiene nada que cachear.
   ============================================================ */

const VERSION = 'agps-v11';
const CACHE = VERSION;

const PROPIOS = [
  './',
  './index.html',
  './guia.html',
  './admin.html',
  './marcar.html',
  './qr.html',
  './historial.html',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './assets/style.css',
  './assets/geo.js',
  './assets/almacen.js',
  './assets/datos.js',
  './assets/auth.js',
  './assets/escaner.js',
  './assets/guia.js',
  './assets/marcar.js',
  './assets/admin.js',
  './assets/qr.js',
  './assets/historial.js',
];

// Librerias externas. Se cachean igual: sin ellas la pantalla del
// guia no dibuja el mapa ni lee codigos.
const EXTERNOS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Los propios son obligatorios; los externos, si alguno falla
    // no debe tumbar la instalacion entera.
    await cache.addAll(PROPIOS);
    await Promise.all(EXTERNOS.map((u) =>
      cache.add(new Request(u, { mode: 'cors' })).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const esHTML = (req) =>
  req.mode === 'navigate' ||
  (req.headers.get('accept') || '').includes('text/html');

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca cachear las llamadas a la base: los datos frescos no se
  // sirven de cache, y offline los resuelve la capa local.
  if (/supabase\.(co|in)$/.test(url.hostname) || url.pathname.includes('/rest/v1/')) {
    return;
  }

  if (esHTML(req)) {
    ev.respondWith((async () => {
      try {
        const red = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, red.clone());
        return red;
      } catch (e) {
        const c = await caches.match(req, { ignoreSearch: true });
        return c || caches.match('./guia.html');
      }
    })());
    return;
  }

  ev.respondWith((async () => {
    const c = await caches.match(req, { ignoreSearch: true });
    if (c) {
      // Refresco silencioso para la proxima visita
      fetch(req).then((red) => {
        if (red && red.ok) caches.open(CACHE).then((k) => k.put(req, red));
      }).catch(() => {});
      return c;
    }
    try {
      const red = await fetch(req);
      if (red && red.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, red.clone());
      }
      return red;
    } catch (e) {
      return new Response('', { status: 504, statusText: 'Sin conexión' });
    }
  })());
});
