// Service worker: de hele app staat in de cache en werkt dus offline.
// Verhoog VERSION bij een release om oude caches op te ruimen.
const VERSION = 'v11';
const CACHE = `punt-tracker-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/app.js',
  './js/core.js',
  './js/fx.js',
  './js/cloud.js',
  './js/config.js',
  './js/auth-callback.js',
  './auth.html',
  './fonts/space-grotesk.woff2',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('punt-tracker-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Eerst uit de cache (direct, ook offline), op de achtergrond verversen.
// Een nieuwe versie is daardoor zichtbaar bij de eerstvolgende keer openen.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Alleen de app zelf valt terug op index.html; auth.html is een eigen pagina.
    const path = new URL(request.url).pathname;
    const key = request.mode === 'navigate' && !path.endsWith('/auth.html') ? './index.html' : request;
    const cached = await cache.match(key, { ignoreSearch: true });
    const refresh = fetch(request)
      .then((response) => {
        if (response.ok) cache.put(key, response.clone());
        return response;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(refresh);
      return cached;
    }
    return (await refresh) || Response.error();
  })());
});
