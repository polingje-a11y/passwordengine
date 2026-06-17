const CACHE_NAME = 'passwordengine-cache-v2';
const ASSETS = [
  './',
  './index.html',
  './index.css',
  './auth.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Pages that should never be served from cache (auth flows need fresh responses)
const NETWORK_ONLY = [
  './callback.html'
];

// Install Event - cache core resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(ASSETS).catch(err => {
        console.warn('Caching warning during install. Some assets might be missing:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache key:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - network-falling-back-to-cache strategy
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and local scope schemas
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    // Check if this is a network-only request (e.g., OAuth callback)
    NETWORK_ONLY.some(path => event.request.url.includes(path.replace('./', '')))
      ? fetch(event.request)
      : fetch(event.request)
          .then((response) => {
            // If valid response, clone and update cache
            if (response && response.status === 200) {
              const resClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, resClone);
              });
            }
            return response;
          })
          .catch(() => {
            // Fallback to cache if network request fails
            return caches.match(event.request).then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // If root request fails and cache is empty, fallback to index.html
              if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
              }
            });
          })
  );
});
