// Bump this when changing caching behavior to force refresh.
const CACHE_NAME = 'aimediatank-v15';
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

      // Next.js assets are content-hashed, but cache-first kept *stale* chunks after deploys
      // (CacheStorage survives SW unregister in many browsers). Network-first + update cache
      // so new bundles load; offline still falls back to cached chunk.
      if (isNextAsset) {
        const cachedResponse = await caches.match(event.request);
        try {
          const response = await fetch(event.request, { cache: 'no-store' });
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        } catch (e) {
          if (cachedResponse) return cachedResponse;
          throw e;
        }
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

function notifyOpenClients(payload) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      client.postMessage(payload);
    }
  });
}

// Web Push — voice calls use high urgency + ring-like vibration
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }

  const isVoiceCall = data.type === 'voice_call';

  const options = {
    body: data.body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: isVoiceCall ? 'voice-call-' + (data.callId || 'incoming') : 'aimediatank-notification',
    renotify: true,
    requireInteraction: isVoiceCall,
    vibrate: isVoiceCall
      ? [400, 200, 400, 200, 400, 800, 400, 200, 400, 2000]
      : [100, 50, 100],
    silent: false,
    data: {
      url: data.url || '/',
      type: data.type || 'generic',
      callId: data.callId || null,
      caller: data.caller || null,
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'AiMediaTank', options),
      isVoiceCall
        ? notifyOpenClients({
            type: 'VOICE_CALL_INCOMING',
            callId: data.callId,
            caller: data.caller,
          })
        : Promise.resolve(),
    ])
  );
});

// Handle notification click — focus app and surface incoming call
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || '/?openChat=1';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if (data.type === 'voice_call' && data.callId) {
            client.postMessage({
              type: 'VOICE_CALL_INCOMING',
              callId: data.callId,
              caller: data.caller,
            });
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
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
