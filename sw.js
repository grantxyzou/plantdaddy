// Service worker: precache the app shell so PlantDaddy opens with no network.
// Bump VERSION on every deploy to roll the cache.

const VERSION = 'plantdaddy-v3';

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
  'js/species-images.js',
  'js/ui-thumb.js',
  'js/ui.js',
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

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for the shell; network-first (with cache fallback) for anything
// else. Species reference images from Wikimedia are cached on first view so
// "what healthy looks like" keeps working offline.
const IMAGE_HOSTS = ['upload.wikimedia.org'];

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const cacheable = url.origin === location.origin || IMAGE_HOSTS.includes(url.hostname);
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached =>
      cached ||
      fetch(request).then(res => {
        if (cacheable && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy));
        }
        return res;
      }).catch(() => url.origin === location.origin ? caches.match('index.html') : Response.error())
    )
  );
});
