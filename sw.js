const CACHE_NAME = 'credix-offline-v2';

// Install: Core files save karega
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Naye update ko turant lagu karega
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                './',
                './index.html',
                './style.css',
                './script.js',
                './manifest.json',
                './logo.png'
            ]);
        })
    );
});

// Activate: Purane cache ko hata kar naya chalayega
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim()); 
});

// Fetch: Jo bhi nayi file milegi (jaise Firebase/Dexie) usko automatically offline ke liye save kar lega
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse; // Agar file save hai toh offline se de do
            
            return fetch(event.request).then((networkResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone()); // Nayi link ko hamesha ke liye save kar lo
                    return networkResponse;
                });
            }).catch(() => {
                console.log("Offline mode active");
            });
        })
    );
});