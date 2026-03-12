// Service Worker for LUXFEE PWA - GitHub Pages Optimized
const CACHE_NAME = 'luxfee-cache-v1';
const DYNAMIC_CACHE = 'luxfee-dynamic-v1';

// Assets to cache on install
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800&family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11'
];

// Install event - cache core assets
self.addEventListener('install', event => {
  console.log('✅ Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Caching app resources');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ All resources cached successfully');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('✅ Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME && cache !== DYNAMIC_CACHE) {
            console.log('✅ Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Network with cache fallback
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Network failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    
    return new Response('Offline', { status: 503 });
  }
}

// Cache first strategy
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

// Fetch event handler
self.addEventListener('fetch', event => {
  const requestUrl = event.request.url;
  
  // Don't cache Firebase API requests
  if (requestUrl.includes('firebase') || requestUrl.includes('googleapis')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // For navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }
  
  // For static assets
  if (requestUrl.includes('.css') || 
      requestUrl.includes('.js') || 
      requestUrl.includes('fonts') ||
      requestUrl.includes('cdn')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  
  // For other requests
  event.respondWith(networkFirst(event.request));
});

// Handle offline analytics
self.addEventListener('sync', event => {
  if (event.tag === 'payment-sync') {
    console.log('🔄 Syncing offline payments');
    event.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  try {
    const cache = await caches.open('offline-data');
    const requests = await cache.keys();
    
    for (const request of requests) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.delete(request);
          
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: 'DATA_SYNCED',
              url: request.url
            });
          });
        }
      } catch (error) {
        console.log('❌ Sync failed:', error);
      }
    }
  } catch (error) {
    console.log('❌ Error syncing:', error);
  }
}

// Push notifications
self.addEventListener('push', event => {
  const data = event.data.json();
  
  const options = {
    body: data.body || 'New notification from LUXFEE',
    icon: 'https://via.placeholder.com/192x192/667eea/ffffff?text=LF',
    badge: 'https://via.placeholder.com/96x96/667eea/ffffff?text=LF',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      url: data.url || '/'
    },
    actions: [
      {
        action: 'open',
        title: 'Open App'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'LUXFEE', options)
  );
});

// Notification click
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  }
});

// Message from client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Handle offline status
self.addEventListener('fetch', event => {
  if (event.request.method === 'POST') {
    // For POST requests, try network first, then store for later sync
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.open('offline-data').then(cache => {
          return cache.put(event.request, new Response('queued')).then(() => {
            return new Response(JSON.stringify({ queued: true }), {
              headers: { 'Content-Type': 'application/json' }
            });
          });
        });
      })
    );
  }
});
