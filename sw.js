const CACHE_NAME = 'passwordengine-cache-v7';
const ASSETS = [
  './',
  './index.html',
  './index.css',
  './auth.js',
  './notifications.js',
  './announcements.js',
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

/* ==========================================================================
   Push Notification Event Handlers
   ========================================================================== */

// Push Event — Receive push messages from FCM or server
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);

  let title = 'PasswordEngine';
  let options = {
    body: 'You have a new notification.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [100, 50, 100],
    tag: 'push-notification',
    data: {
      url: self.registration.scope,
      timestamp: Date.now(),
    },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  // Parse the push payload if available
  if (event.data) {
    try {
      const payload = event.data.json();
      if (payload.notification) {
        title = payload.notification.title || title;
        options.body = payload.notification.body || options.body;
        options.tag = payload.notification.tag || options.tag;
      } else if (payload.title) {
        title = payload.title;
        options.body = payload.body || options.body;
        options.tag = payload.tag || options.tag;
      }
    } catch (e) {
      // If not JSON, use as plain text body
      const text = event.data.text();
      if (text) {
        options.body = text;
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification Click — Open or focus the app when user taps a notification
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click:', event.notification.tag);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Determine URL to open
  const urlToOpen = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : self.registration.scope;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If the app is already open in a tab, focus it
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Notification Close — Track dismissals (optional analytics hook)
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification dismissed:', event.notification.tag);
});

