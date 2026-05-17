const express = require('express');
const router = express.Router();
const { db } = require('../firebase-admin-config');

// ─── Admin Login Page ───
router.get('/login', (req, res) => {
    res.render('admin/login', {
        title: 'Admin Login | Geeta Kalp',
        metaDescription: 'Admin login portal for Geeta Kalp.'
    });
});

// ─── Admin Dashboard ───
router.get('/', (req, res) => {
    res.render('admin/dashboard', {
        title: 'Admin Dashboard | Geeta Kalp',
        metaDescription: 'Geeta Kalp admin dashboard.'
    });
});

// ─── Products Management Page ───
router.get('/products', (req, res) => {
    res.render('admin/products', {
        title: 'Manage Products | Geeta Kalp',
        metaDescription: 'Add and manage products on Geeta Kalp.'
    });
});

router.get('/new-arrivals', (req, res) => {
    res.render('admin/new-arrivals', {
        title: 'Manage New Arrivals | Geeta Kalp',
        metaDescription: 'Choose products for the homepage New Arrivals section.'
    });
});

// ─── Orders Management Page ───
router.get('/orders', (req, res) => {
    res.render('admin/orders', {
        title: 'Manage Orders | Geeta Kalp',
        metaDescription: 'View and manage active orders on Geeta Kalp.'
    });
});

// ─── Order History Page ───
router.get('/order-history', (req, res) => {
    res.render('admin/order-history', {
        title: 'Order History | Geeta Kalp',
        metaDescription: 'View delivered and cancelled orders.'
    });
});
// ─── Users Management Page ───
router.get('/users', (req, res) => {
    res.render('admin/users', {
        title: 'Manage Users | Geeta Kalp',
        metaDescription: 'View and manage users on Geeta Kalp.'
    });
});

// ─── Coupons Page ───
router.get('/coupons', (req, res) => {
    res.render('admin/coupons', {
        title: 'Manage Coupons | Geeta Kalp',
        metaDescription: 'Manage discount codes and coupons.'
    });
});

// ─── Settings Page ───
router.get('/settings', (req, res) => {
    res.render('admin/settings', {
        title: 'Admin Settings | Geeta Kalp',
        metaDescription: 'Manage store settings and payment methods.'
    });
});

// ─── Reviews ───
router.get('/reviews', (req, res) => {
    res.render('admin/reviews', { title: 'Manage Reviews | Admin' });
});

router.get('/review-history', (req, res) => {
    res.render('admin/review-history', { title: 'Review History | Admin' });
});

module.exports = router;
