// ZENVIRO BD — minimal service worker
// Purpose: satisfy Chrome's PWA installability requirement (a registered
// service worker with a fetch handler) and provide basic offline resilience
// for the app shell. Does not attempt to cache dynamic Firebase/API data.

const CACHE_NAME = 'zenvirobd-shell-v1';
const APP_SHELL = ['/', '/logo.png', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for navigation/HTML so users always get the latest app
// version when online; fall back to the cached shell only when offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => cached))
  );
});
