require('dotenv').config();
const express = require('express');
const path = require('path');
const { db } = require('./firebase-admin-config');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/skelkit', express.static(path.join(__dirname, 'node_modules/skelkit/dist')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Pass Firebase config & Razorpay key to all views
app.use((req, res, next) => {
    res.locals.firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        databaseURL: process.env.FIREBASE_DATABASE_URL,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
    };
    res.locals.razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    res.locals.currentYear = new Date().getFullYear();
    next();
});

// ─── Routes ───
const shopRoutes = require('./routes/shop');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

app.use('/', shopRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// ─── 404 Handler ───
app.use((req, res) => {
    res.status(404).render('404', {
        title: 'Page Not Found | Geeta Kalp',
        metaDescription: 'The page you are looking for could not be found.'
    });
});

// ─── Error Handler ───
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).render('error', {
        title: 'Server Error | Geeta Kalp',
        metaDescription: 'An unexpected error occurred.',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// ─── Start Server ───
app.listen(PORT, () => {
    console.log(`\n🚀 Geeta Kalp server running at http://localhost:${PORT}`);
    console.log(`📦 Admin Portal: http://localhost:${PORT}/admin`);
    console.log(`🛍️  Shop: http://localhost:${PORT}/shop\n`);
});
