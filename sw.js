const CACHE_NAME = 'credix-offline-v5';

const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './logo.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName); // Purana kachra saaf karega
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 🔥 SMART NETWORK FIRST LOGIC
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Agar internet ON hai toh hamesha NAYA code layega aur save karega
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            })
            .catch(() => {
                // Agar internet OFF hai toh purana save kiya hua chalayega
                return caches.match(event.request);
            })
    );
});