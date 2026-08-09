// Service worker.
//
// Design rule: staleness must be IMPOSSIBLE, and correctness must never
// depend on a human remembering to bump a version number. So:
//
//   • navigations + → network-first with a short timeout. Online, you always
//     same-origin     get the current code on the very first load; offline (or
//     app code        on a slow link) it falls straight back to the cache.
//   • wikimedia     → cache-first (those URLs are immutable).
//
// The app is ~120KB of text served with ETags, so revalidation is mostly
// 304s and costs little. Cache is the offline safety net, never the source
// of truth. CACHE below is just a housekeeping label — forgetting to bump
// it can no longer strand anyone on old code.

const CACHE = 'plantdaddy-v5';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/store.js',
  'js/schedule.js',
  'js/ics.js',
  'js/photos.js',
  'js/backup.js',
  'js/care-guides.js',
  'js/diagnose.js',
  'js/species-images.js',
  'js/ui-thumb.js',
  'js/ui.js',
  'js/update.js',
  'js/views/dashboard.js',
  'js/views/collection.js',
  'js/views/plant-detail.js',
  'js/views/plant-form.js',
  'js/views/journal.js',
  'js/views/settings.js',
  'data/seed.json',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

const IMAGE_HOSTS = ['upload.wikimedia.org'];
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' bypasses the browser HTTP cache, so a precache can
    // never re-import the very files we are trying to replace.
    await cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

/**
 * Network-first: always try fresh, fall back to the cache when the network is
 * slow or gone. `cache: 'no-cache'` forces revalidation so the browser's own
 * HTTP cache can never hand back a stale copy behind our back.
 */
async function networkFirst(request, { navigate = false } = {}) {
  const cache = await caches.open(CACHE);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS);
  try {
    const res = await fetch(request, { cache: 'no-cache', signal: controller.signal });
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (navigate) {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    return Response.error();
  } finally {
    clearTimeout(timer);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // API calls are live-only: never cached, never answered from cache.
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, { navigate: true }));
    return;
  }
  if (url.origin === location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (IMAGE_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});
