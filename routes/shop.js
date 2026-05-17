const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin-config');
const { normalizeProductImages } = require('../services/r2ImageUrls');
const { validateCheckoutTokenMiddleware, requireCheckoutTokenMiddleware } = require('../middleware/checkoutAuth');

// ─── Homepage ───
router.get('/', async (req, res) => {
    try {
        const [snapshot, newArrivalsSnap] = await Promise.all([
            db.ref('products').orderByChild('createdAt').once('value'),
            db.ref('settings/newArrivalProductIds').once('value')
        ]);
        const products = [];
        snapshot.forEach(child => {
            products.push(normalizeProductImages({ id: child.key, ...child.val() }));
        });
        products.reverse();

        // Get featured / new products
        const selectedNewArrivalIds = newArrivalsSnap.val() || [];
        const selectedIdSet = new Set(Array.isArray(selectedNewArrivalIds) ? selectedNewArrivalIds : []);
        const selectedProducts = products.filter(p => selectedIdSet.has(p.id) && p.active !== false);
        const newProducts = selectedProducts.length > 0
            ? selectedProducts.sort((a, b) => selectedNewArrivalIds.indexOf(a.id) - selectedNewArrivalIds.indexOf(b.id))
            : products.filter(p => p.isNew && p.active !== false);
        const featuredProducts = products.slice(0, 8);

        res.render('index', {
            title: 'Geeta Kalp — Premium Collection',
            metaDescription: 'Discover premium products at Geeta Kalp. Shop the latest collection with exclusive deals, dynamic pricing, and fast delivery.',
            products: featuredProducts,
            newProducts: newProducts,
            canonicalUrl: `${req.protocol}://${req.get('host')}/`
        });
    } catch (error) {
        console.error('Homepage error:', error);
        res.render('index', {
            title: 'Geeta Kalp — Premium Collection',
            metaDescription: 'Discover premium products at Geeta Kalp.',
            products: [],
            newProducts: [],
            canonicalUrl: `${req.protocol}://${req.get('host')}/`
        });
    }
});

// ─── Shop Page (All Products) ───
router.get('/shop', async (req, res) => {
    try {
        const { category, sort, search } = req.query;
        let ref = db.ref('products');
        const snapshot = await ref.once('value');
        let products = [];
        snapshot.forEach(child => {
            const product = { id: child.key, ...child.val() };
            if (product.active !== false) {
                products.push(normalizeProductImages(product));
            }
        });

        // Filter by category
        if (category && category !== 'all') {
            products = products.filter(p => p.category === category);
        }

        // Search filter
        if (search) {
            const query = search.toLowerCase();
            products = products.filter(p =>
                p.name.toLowerCase().includes(query) ||
                (p.description && p.description.toLowerCase().includes(query))
            );
        }

        // Sort
        if (sort === 'price-low') {
            products.sort((a, b) => a.salePrice - b.salePrice);
        } else if (sort === 'price-high') {
            products.sort((a, b) => b.salePrice - a.salePrice);
        } else if (sort === 'newest') {
            products.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } else if (sort === 'discount') {
            products.sort((a, b) => {
                const discA = ((a.originalPrice - a.salePrice) / a.originalPrice) * 100;
                const discB = ((b.originalPrice - b.salePrice) / b.originalPrice) * 100;
                return discB - discA;
            });
        }

        // Get unique categories
        const catSnap = await db.ref('categories').once('value');
        const categories = catSnap.val() || {};

        res.render('shop', {
            title: category ? `${category} | Geeta Kalp` : 'Shop All Products | Geeta Kalp',
            metaDescription: 'Browse our complete collection of premium products. Find the best deals with dynamic pricing at Geeta Kalp.',
            products,
            categories: Object.values(categories),
            currentCategory: category || 'all',
            currentSort: sort || 'newest',
            searchQuery: search || '',
            canonicalUrl: `${req.protocol}://${req.get('host')}/shop`
        });
    } catch (error) {
        console.error('Shop error:', error);
        res.render('shop', {
            title: 'Shop | Geeta Kalp',
            metaDescription: 'Browse our products.',
            products: [],
            categories: [],
            currentCategory: 'all',
            currentSort: 'newest',
            searchQuery: '',
            canonicalUrl: `${req.protocol}://${req.get('host')}/shop`
        });
    }
});

// ─── Single Product Page ───
router.get('/product/:id', async (req, res) => {
    try {
        const snapshot = await db.ref(`products/${req.params.id}`).once('value');
        const product = snapshot.val();

        if (!product) {
            return res.status(404).render('404', {
                title: 'Product Not Found | Geeta Kalp',
                metaDescription: 'The product you are looking for could not be found.'
            });
        }

        Object.assign(product, normalizeProductImages({ id: req.params.id, ...product }));

        // Calculate discount percentage
        product.discountPercent = Math.round(
            ((product.originalPrice - product.salePrice) / product.originalPrice) * 100
        );

        // Get related products (same category)
        const relatedSnap = await db.ref('products')
            .orderByChild('category')
            .equalTo(product.category)
            .limitToFirst(5)
            .once('value');
        
        const relatedProducts = [];
        relatedSnap.forEach(child => {
            if (child.key !== req.params.id) {
                relatedProducts.push(normalizeProductImages({ id: child.key, ...child.val() }));
            }
        });

        // Get approved reviews
        const reviewsSnap = await db.ref('reviews').orderByChild('productId').equalTo(req.params.id).once('value');
        const reviews = [];
        reviewsSnap.forEach(child => {
            const rev = child.val();
            if(rev.approved) {
                reviews.push({ id: child.key, ...rev });
            }
        });
        reviews.sort((a,b) => b.createdAt - a.createdAt);

        res.render('product', {
            title: `${product.name} | Geeta Kalp`,
            metaDescription: product.description ? product.description.substring(0, 160) : `Buy ${product.name} at the best price on Geeta Kalp.`,
            product,
            relatedProducts: relatedProducts.slice(0, 4),
            reviews,
            canonicalUrl: `${req.protocol}://${req.get('host')}/product/${req.params.id}`
        });
    } catch (error) {
        console.error('Product page error:', error);
        res.status(500).render('error', {
            title: 'Error | Geeta Kalp',
            metaDescription: 'An error occurred.',
            error: 'Failed to load product'
        });
    }
});

// ─── Cart Page ───
router.get('/cart', (req, res) => {
    res.render('cart', {
        title: 'Shopping Cart | Geeta Kalp',
        metaDescription: 'Review your shopping cart and proceed to checkout at Geeta Kalp.',
        canonicalUrl: `${req.protocol}://${req.get('host')}/cart`
    });
});

// ─── Checkout Page ───
router.get('/checkout', requireCheckoutTokenMiddleware, async (req, res) => {
    try {
        const settingsSnap = await db.ref('settings').once('value');
        const settings = settingsSnap.val() || {};
        const paymentMethods = settings.paymentMethods || { razorpay: true, cod: true, codAdvancePercent: 0 };
        
        res.render('checkout', {
            title: 'Checkout | Geeta Kalp',
            metaDescription: 'Complete your purchase securely at Geeta Kalp.',
            canonicalUrl: `${req.protocol}://${req.get('host')}/checkout`,
            paymentSettings: paymentMethods,
            checkoutToken: res.locals.checkoutToken || null
        });
    } catch (error) {
        console.error('Error loading checkout:', error);
        res.redirect('/cart');
    }
});

// ─── Order Success ───
router.get('/order-success', requireCheckoutTokenMiddleware, (req, res) => {
    res.render('order-success', {
        title: 'Order Confirmed | Geeta Kalp',
        metaDescription: 'Your order has been successfully placed at Geeta Kalp.',
        orderId: req.query.orderId || '',
        canonicalUrl: `${req.protocol}://${req.get('host')}/order-success`,
        checkoutToken: res.locals.checkoutToken || null
    });
});

// ─── Profile Page ───
router.get('/profile', (req, res) => {
    res.render('profile', {
        title: 'My Profile | Geeta Kalp',
        metaDescription: 'View your order history and manage your addresses at Geeta Kalp.',
        canonicalUrl: `${req.protocol}://${req.get('host')}/profile`
    });
});

// ─── Order Details Page ───
router.get('/order/:id', (req, res) => {
    res.render('order-details', {
        title: 'Order Details | Geeta Kalp',
        metaDescription: 'View your order details at Geeta Kalp.',
        orderId: req.params.id,
        canonicalUrl: `${req.protocol}://${req.get('host')}/order/${req.params.id}`
    });
});

module.exports = router;
