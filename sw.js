const CACHE_NAME = 'knowlink-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/gun/gun.js',
    'https://cdn.jsdelivr.net/npm/gun/sea.js',
    'https://cdn.jsdelivr.net/npm/gun/lib/unset.js'
];

// 安裝 Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// 攔截請求並提供離線支援
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // 如果在快取中找到回應，則返回快取的回應
                if (response) {
                    return response;
                }
                // 否則發送網路請求
                return fetch(event.request)
                    .then((response) => {
                        // 檢查是否接收到有效的回應
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        // 將回應複製一份並存入快取
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        return response;
                    });
            })
    );
});