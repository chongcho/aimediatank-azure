// Bump this when changing caching behavior to force refresh.
const CACHE_NAME = 'aimediatank-v10';
const OFFLINE_URL = '/offline';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/logo.png',
  '/logo-192.png',
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('PWA: Caching essential assets');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API requests and external URLs
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return;
  }

  const isNavigation = event.request.mode === 'navigate';
  const isNextAsset = url.pathname.startsWith('/_next/');

  event.respondWith(
    (async () => {
      // For navigations, bypass HTTP cache to avoid stale HTML keeping old bundles.
      if (isNavigation) {
        try {
          const response = await fetch(event.request, { cache: 'no-store' });
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        } catch (e) {
          const cachedResponse = await caches.match(event.request);
          return cachedResponse || (await caches.match(OFFLINE_URL));
        }
      }

      // Next.js assets are content-hashed; cache-first is safe and reduces network chatter.
      if (isNextAsset) {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        const response = await fetch(event.request);
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      }

      // Default: network-first, cache fallback.
      try {
        const response = await fetch(event.request);
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      } catch (e) {
        const cachedResponse = await caches.match(event.request);
        return cachedResponse || new Response('Offline', { status: 503 });
      }
    })()
  );
});

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/logo.png',
      badge: '/logo.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/',
      },
    };
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});

// Handle messages from client for badge updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data && event.data.type === 'SET_BADGE') {
    const count = event.data.count;
    if ('setAppBadge' in self.navigator) {
      self.navigator.setAppBadge(count).catch((error) => {
        console.log('Service Worker: Error setting badge:', error);
      });
    }
  } else if (event.data && event.data.type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in self.navigator) {
      self.navigator.clearAppBadge().catch((error) => {
        console.log('Service Worker: Error clearing badge:', error);
      });
    }
  }
});

