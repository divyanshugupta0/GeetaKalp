const FETCH_IMAGE_PREFIX = '/api/fetch-image/';

function keyToFetchImageUrl(key) {
    if (!key || typeof key !== 'string') return '';
    return `${FETCH_IMAGE_PREFIX}${key.split('/').map(encodeURIComponent).join('/')}`;
}

function extractR2ImageKey(value) {
    if (!value || typeof value !== 'string') return '';

    const image = value.trim();
    if (!image) return '';

    if (image.startsWith(FETCH_IMAGE_PREFIX)) {
        return decodeURIComponent(image.substring(FETCH_IMAGE_PREFIX.length));
    }

    if (image.startsWith('images/')) {
        return image;
    }

    try {
        const parsedUrl = new URL(image);
        const keyFromFetchRoute = parsedUrl.pathname.match(/\/api\/fetch-image\/(.+)$/);
        if (keyFromFetchRoute) {
            return decodeURIComponent(keyFromFetchRoute[1]);
        }

        const keyFromImagesPath = parsedUrl.pathname.match(/\/(images\/.+)$/);
        if (keyFromImagesPath) {
            return decodeURIComponent(keyFromImagesPath[1]);
        }

        const keyFromQuery = parsedUrl.searchParams.get('key');
        if (keyFromQuery && keyFromQuery.startsWith('images/')) {
            return keyFromQuery;
        }
    } catch (error) {
        // Not a URL; leave it unchanged below.
    }

    return '';
}

function toPrivateR2ImageUrl(value) {
    const key = extractR2ImageKey(value);
    return key ? keyToFetchImageUrl(key) : value;
}

function normalizeProductImages(product) {
    if (!product || !Array.isArray(product.images)) return product;

    return {
        ...product,
        images: product.images.map(toPrivateR2ImageUrl).filter(Boolean)
    };
}

module.exports = {
    keyToFetchImageUrl,
    toPrivateR2ImageUrl,
    normalizeProductImages
};
