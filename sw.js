// V60 Recipe Calculator - Service Worker
// Cache schema version only; do not bump for every deployed asset change.
const CACHE_NAME = 'v60-brew-guide-v1.19.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/favicon.ico',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];
// The app shell must be cached for the app to work offline at all; everything
// else may fail individually without blocking installation.
const APP_SHELL_CACHE_KEY = './index.html';
const MANDATORY_ASSETS_TO_CACHE = [
  APP_SHELL_CACHE_KEY
];
const OPTIONAL_ASSETS_TO_CACHE = ASSETS_TO_CACHE.filter(
  (asset) => MANDATORY_ASSETS_TO_CACHE.indexOf(asset) === -1
);

// Google Fonts to cache
const FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Install: cache core assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new service worker, version:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const mandatoryAssets = Promise.all(
        MANDATORY_ASSETS_TO_CACHE.map((asset) => {
          return cache.add(asset).catch((error) => {
            console.log('[SW] Failed to cache mandatory asset:', asset, error);
            throw error;
          });
        })
      );

      const optionalAssets = Promise.all(
        OPTIONAL_ASSETS_TO_CACHE.map((asset) => {
          return cache.add(asset).catch((error) => {
            console.log('[SW] Failed to cache optional asset:', asset, error);
          });
        })
      );

      return Promise.all([mandatoryAssets, optionalAssets]);
    })
  );
  // Don't activate immediately - wait for message from client
  // This prevents race conditions on iOS
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new service worker, version:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Take control of all pages after caches are cleaned
      console.log('[SW] Taking control of all clients');
      return self.clients.claim();
    })
  );
});

function isSameOriginRequest(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isSuccessfulResponse(response) {
  return response && response.ok && response.status === 200;
}

function isHtmlRequest(request) {
  const accept = request.headers.get('accept') || '';
  return (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    accept.indexOf('text/html') !== -1
  );
}

function isManifestRequest(request) {
  const url = new URL(request.url);
  return (
    isSameOriginRequest(request) &&
    url.pathname.endsWith('/manifest.json')
  );
}

function isServerErrorResponse(response) {
  return response && response.status >= 500 && response.status < 600;
}

function cacheResponse(request, response, cacheKey) {
  const target = cacheKey || request;
  const targetUrl = typeof target === 'string' ? target : target.url;

  return Promise.resolve().then(() => {
    if (!isSuccessfulResponse(response)) {
      return undefined;
    }

    const clone = response.clone();
    return caches.open(CACHE_NAME).then((cache) => {
      return cache.put(target, clone);
    });
  }).catch((error) => {
    console.log('[SW] Failed to cache response:', targetUrl, error);
  });
}

function cachedIndexFallback() {
  return caches.match(APP_SHELL_CACHE_KEY);
}

function networkFirst(request, options) {
  const strategy = options || {};
  const cacheKey = strategy.cacheKey || request;
  const fallbackKey = strategy.fallbackKey === undefined ? request : strategy.fallbackKey;

  return fetch(request).then((response) => {
    if (strategy.fallbackOnServerError && isServerErrorResponse(response)) {
      throw new Error('Server error response');
    }

    return cacheResponse(request, response, cacheKey).then(() => response);
  }).catch(() => {
    if (!fallbackKey) return undefined;
    if (fallbackKey === APP_SHELL_CACHE_KEY) return cachedIndexFallback();
    return caches.match(fallbackKey);
  }).then((response) => {
    if (response) return response;
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  });
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      return cacheResponse(request, response).then(() => response);
    });
  });
}

function fetchAndCache(request) {
  return fetch(request).then((response) => {
    return cacheResponse(request, response).then(() => response);
  });
}

function staleWhileRevalidate(request, event) {
  return caches.match(request).then((cached) => {
    if (cached) {
      const revalidation = fetchAndCache(request).catch((error) => {
        console.log('[SW] Failed to revalidate cache:', request.url, error);
      });
      event.waitUntil(revalidation);
      return cached;
    }

    return fetchAndCache(request);
  });
}

// Fetch: keep HTML and update metadata fresh, cache static assets for offline use
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const sameOrigin = isSameOriginRequest(request);

  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // For Google Fonts: cache-first with network fallback
  if (
    request.url.startsWith('https://fonts.googleapis.com') ||
    request.url.startsWith('https://fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          return cacheResponse(request, response).then(() => response);
        });
      })
    );
    return;
  }

  if (!sameOrigin) {
    event.respondWith(fetch(request));
    return;
  }

  // For navigation/HTML: network-first, offline fallback to cached app shell
  if (isHtmlRequest(request)) {
    event.respondWith(networkFirst(request, {
      cacheKey: APP_SHELL_CACHE_KEY,
      fallbackKey: APP_SHELL_CACHE_KEY,
      fallbackOnServerError: true
    }));
    return;
  }

  // For app metadata: network-first with cached fallback
  if (isManifestRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // For same-origin static assets: stale-while-revalidate for self-healing updates
  event.respondWith(staleWhileRevalidate(request, event));
});

// Handle notification click - open the app
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  event.notification.close();

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Handle notification close (optional, for analytics)
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
});
