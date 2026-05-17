(function () {
    if (!('serviceWorker' in navigator) || !('caches' in window)) return;
    if (window.__geetaKalpImageCacheRegistered) return;

    window.__geetaKalpImageCacheRegistered = true;
    const LOCAL_STORAGE_KEY = 'geetakalp_cached_image_urls';

    function absoluteUrl(url) {
        try {
            return new URL(url, window.location.href).href;
        } catch (error) {
            return '';
        }
    }

    function collectImageUrls(root) {
        const scope = root || document;
        const urls = new Set();

        scope.querySelectorAll('img[src]').forEach((img) => {
            const src = absoluteUrl(img.currentSrc || img.src);
            if (src) urls.add(src);
        });

        scope.querySelectorAll('*').forEach((element) => {
            const backgroundImage = window.getComputedStyle(element).backgroundImage;
            if (!backgroundImage || backgroundImage === 'none') return;

            const matches = backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g);
            for (const match of matches) {
                const src = absoluteUrl(match[1]);
                if (src) urls.add(src);
            }
        });

        return Array.from(urls);
    }

    function rememberImageUrls(urls) {
        if (!('localStorage' in window) || !Array.isArray(urls) || urls.length === 0) return;

        try {
            const previous = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
            const merged = Array.from(new Set([...previous, ...urls])).slice(-500);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
            localStorage.setItem('geetakalp_cached_image_count', String(merged.length));
            localStorage.setItem('geetakalp_image_cache_updated_at', new Date().toISOString());
        } catch (error) {
            // Cache Storage holds the actual image files; this manifest is best-effort only.
        }
    }

    function postToImageCache(message) {
        if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage(message);
            return;
        }

        navigator.serviceWorker.ready.then((registration) => {
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage(message);
                return;
            }

            if (registration.active) {
                registration.active.postMessage(message);
            }
        }).catch(() => {});

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage(message);
            }
        }, { once: true });
    }

    function cacheCurrentPageImages(root) {
        const urls = collectImageUrls(root);
        if (urls.length > 0) {
            const uniqueUrls = Array.from(new Set(urls));
            rememberImageUrls(uniqueUrls);
            postToImageCache({ type: 'CACHE_IMAGE_URLS', urls: uniqueUrls });
        }
    }

    function watchNewImages() {
        const observer = new MutationObserver((mutations) => {
            const changedNodes = [];
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        changedNodes.push(node);
                    }
                });
            });

            if (changedNodes.length === 0) return;
            window.requestIdleCallback
                ? window.requestIdleCallback(() => changedNodes.forEach(cacheCurrentPageImages))
                : window.setTimeout(() => changedNodes.forEach(cacheCurrentPageImages), 250);
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    async function cacheCatalogProductImages() {
        try {
            const res = await fetch('/api/products', { credentials: 'same-origin' });
            const data = await res.json();
            if (!data.success || !Array.isArray(data.products)) return;

            const urls = data.products
                .flatMap((product) => Array.isArray(product.images) ? product.images : [])
                .map(absoluteUrl)
                .filter(Boolean);

            if (urls.length > 0) {
                const uniqueUrls = Array.from(new Set(urls));
                rememberImageUrls(uniqueUrls);
                postToImageCache({ type: 'CACHE_IMAGE_URLS', urls: uniqueUrls });
            }
        } catch (error) {
            console.warn('Product image cache warmup failed:', error);
        }
    }

    navigator.serviceWorker.register('/image-cache-sw.js', { scope: '/' })
        .then(() => navigator.serviceWorker.ready)
        .then(() => {
            cacheCurrentPageImages(document);
            cacheCatalogProductImages();
            watchNewImages();
        })
        .catch((error) => {
            console.warn('Image cache service worker registration failed:', error);
        });

    window.geetaKalpImageCache = {
        cacheCurrentPageImages,
        cacheCatalogProductImages,
        getCachedImageManifest() {
            try {
                return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
            } catch (error) {
                return [];
            }
        },
        deleteImageUrl(url) {
            const src = absoluteUrl(url);
            if (src) postToImageCache({ type: 'DELETE_IMAGE_URL', url: src });
        }
    };
})();
