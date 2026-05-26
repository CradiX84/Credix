const CACHE_NAME = 'credix-offline-v1';

// App install hote hi in files ko offline save kar lega
self.addEventListener('install', (event) => {
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

// Jab internet na ho, toh saved files load karega
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});