const { db } = require('../firebase-admin-config');

// Middleware to validate checkout token from query parameter
const validateCheckoutTokenMiddleware = async (req, res, next) => {
    try {
        const token = req.query.token;

        // Allow access without token if coming from cart page (first visit)
        if (!token) {
            return next();
        }

        // Validate token
        const snapshot = await db.ref(`checkoutTokens/${token}`).once('value');
        const tokenData = snapshot.val();

        if (!tokenData) {
            return res.redirect('/cart?error=invalid-token');
        }

        if (tokenData.used) {
            return res.redirect('/cart?error=token-already-used');
        }

        if (Date.now() > tokenData.expiresAt) {
            return res.redirect('/cart?error=token-expired');
        }

        // Token is valid, store it in response locals
        res.locals.checkoutToken = token;
        next();
    } catch (error) {
        console.error('Checkout token validation error:', error);
        res.redirect('/cart?error=validation-failed');
    }
};

// Middleware to strictly require a valid checkout token
// This allows USED tokens for order-success page after successful order placement
const requireCheckoutTokenMiddleware = async (req, res, next) => {
    try {
        const token = req.query.token;

        if (!token) {
            return res.redirect('/cart?error=no-checkout-session');
        }

        // Validate token
        const snapshot = await db.ref(`checkoutTokens/${token}`).once('value');
        const tokenData = snapshot.val();

        if (!tokenData) {
            return res.redirect('/cart?error=invalid-token');
        }

        // Allow used tokens on order-success page (means order was just placed)
        if (!tokenData.used && Date.now() > tokenData.expiresAt) {
            return res.redirect('/cart?error=token-expired');
        }

        // Token exists and is not expired, store it in response locals
        res.locals.checkoutToken = token;
        next();
    } catch (error) {
        console.error('Checkout token validation error:', error);
        res.redirect('/cart?error=validation-failed');
    }
};

module.exports = {
    validateCheckoutTokenMiddleware,
    requireCheckoutTokenMiddleware
};
