const IMAGE_CACHE_NAME = 'geeta-kalp-image-cache-v2';
const IMAGE_EXTENSIONS = /\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?$/i;

function isImageRequest(request) {
    if (request.method !== 'GET') return false;
    if (request.destination === 'image') return true;

    try {
        const url = new URL(request.url);
        return url.pathname.startsWith('/api/fetch-image/') || IMAGE_EXTENSIONS.test(url.pathname);
    } catch (error) {
        return false;
    }
}

async function cacheImageRequest(request) {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    const networkResponse = await fetch(request);
    if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
        cache.put(request, networkResponse.clone());
    }
    return networkResponse;
}

function buildWarmupRequest(url) {
    const parsedUrl = new URL(url, self.location.href);

    if (parsedUrl.origin === self.location.origin) {
        return new Request(parsedUrl.href, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'force-cache'
        });
    }

    return new Request(parsedUrl.href, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'force-cache'
    });
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter((cacheName) => cacheName.startsWith('geeta-kalp-image-cache-') && cacheName !== IMAGE_CACHE_NAME)
                .map((cacheName) => caches.delete(cacheName))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    if (!isImageRequest(event.request)) return;
    event.respondWith(cacheImageRequest(event.request));
});

self.addEventListener('message', (event) => {
    const data = event.data || {};

    if (data.type === 'CACHE_IMAGE_URLS' && Array.isArray(data.urls)) {
        event.waitUntil((async () => {
            const cache = await caches.open(IMAGE_CACHE_NAME);
            await Promise.all(data.urls.map(async (url) => {
                try {
                    const request = buildWarmupRequest(url);
                    const cachedResponse = await cache.match(request);
                    if (!cachedResponse) {
                        const response = await fetch(request);
                        if (response && (response.ok || response.type === 'opaque')) {
                            await cache.put(request, response.clone());
                        }
                    }
                } catch (error) {
                    // Ignore URLs the browser is not allowed to cache.
                }
            }));
        })());
    }

    if (data.type === 'DELETE_IMAGE_URL' && data.url) {
        event.waitUntil((async () => {
            const cache = await caches.open(IMAGE_CACHE_NAME);
            await cache.delete(data.url);
            await cache.delete(new Request(data.url, { mode: 'no-cors' }));
        })());
    }
});
