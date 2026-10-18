/* Sidekick service worker: the app works offline; calls to habitica.com are never cached. */
const CACHE = 'sidekick-__VERSION__';
const FILES = __FILES__;
// Stable sprites and the bundled item and skill icons (thousands of small files) are cached on first use, not at install; the ?v= in their URL
// changes when the images do, and this cache outlives app updates.
const SPRITES = 'sidekick-sprites';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => (k.startsWith('sidekick-') || k.startsWith('habitica-oracle-') || k.startsWith('crit-oracle-')) && k !== CACHE && k !== SPRITES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', event => { if (event.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return; // API and sprites go straight to the network
  if (event.request.mode === 'navigate') {
    // network first for the page itself, so updates arrive; cached copy when offline
    event.respondWith(fetch(event.request).then(res => {
      // only a real copy of the app replaces the offline one (not a 404 or a captive-portal page)
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); }
      return res;
    }).catch(() => caches.match('./')));
    return;
  }
  if (url.pathname.includes('/stable/') || url.pathname.includes('/shop/')) {
    event.respondWith(caches.open(SPRITES).then(c => c.match(event.request).then(hit => hit || fetch(event.request).then(res => {
      if (res.ok) c.put(event.request, res.clone());
      return res;
    }))));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
});
