const express = require('express');
const router = express.Router();
const { db, admin } = require('../firebase-admin-config');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const multer = require('multer');
const { normalizeProductImages, toPrivateR2ImageUrl } = require('../services/r2ImageUrls');

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Initialize Razorpay
let razorpay;
try {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
} catch (e) {
    console.warn('⚠️  Razorpay not configured. Payment features disabled.');
}



function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatINR(amount) {
    return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

async function sendMailjetEmail({ to, subject, htmlContent, textContent }) {
    if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_SECRET_KEY) {
        return { success: false, skipped: true, reason: 'MAILJET_API_KEY or MAILJET_SECRET_KEY is not configured' };
    }

    const senderEmail = process.env.MAILJET_FROM_EMAIL || 'no-reply@geetakalp.com';
    const senderName = 'Geeta Kalp';
    const recipients = (Array.isArray(to) ? to : [to])
        .filter(recipient => recipient && isValidEmail(recipient.email))
        .map(recipient => ({
            Email: recipient.email.trim(),
            Name: recipient.name || recipient.email.trim()
        }));

    if (!recipients.length) {
        return { success: false, skipped: true, reason: 'No valid email recipients' };
    }

    // Create Basic Auth header
    const auth = Buffer.from(`${process.env.MAILJET_API_KEY}:${process.env.MAILJET_SECRET_KEY}`).toString('base64');

    let response;
    try {
        response = await fetch('https://api.mailjet.com/v3.1/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
            },
            body: JSON.stringify({
                Messages: [
                    {
                        From: { Email: senderEmail, Name: senderName },
                        To: recipients,
                        Subject: subject,
                        HTMLPart: htmlContent,
                        TextPart: textContent
                    }
                ]
            })
        });
    } catch (error) {
        console.error('Mailjet email request failed:', error.message);
        return { success: false, error: error.message };
    }

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('Mailjet email failed:', response.status, errorText);
        return { success: false, status: response.status, error: errorText };
    }

    const result = await response.json().catch(() => ({}));
    return { success: true, result };
}

function buildOrderItemsHtml(items) {
    return (items || []).map(item => {
        const quantity = Number(item.quantity || 1);
        const price = Number(item.price || item.salePrice || 0);
        const lineTotal = price * quantity;
        return `
            <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${escapeHtml(item.name || 'Item')}</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: center;">${quantity}</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: right;">${formatINR(lineTotal)}</td>
            </tr>
        `;
    }).join('');
}

function buildCustomerOrderEmail(orderId, amount, customerName, paymentLabel, items) {
    const productRows = (items || []).map(item => {
        const quantity = Number(item.quantity || 1);
        const price = Number(item.price || item.salePrice || 0);
        const lineTotal = price * quantity;
        const imageUrl = item.image ? (item.image.startsWith('http') ? item.image : `https://${item.image}`) : '';

        return `
            <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px; display: flex; gap: 16px;">
                ${imageUrl ? `<div style="flex-shrink: 0;"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px;"></div>` : ''}
                <div style="flex-grow: 1;">
                    <h4 style="margin: 0 0 8px 0; color: #1f2937;">${escapeHtml(item.name || 'Item')}</h4>
                    <p style="margin: 4px 0; color: #6b7280; font-size: 14px;"><strong>Quantity:</strong> ${quantity}</p>
                    <p style="margin: 4px 0; color: #6b7280; font-size: 14px;"><strong>Price:</strong> ${formatINR(price)} each</p>
                    <p style="margin: 4px 0; color: #1f2937; font-weight: bold; font-size: 14px;"><strong>Subtotal:</strong> ${formatINR(lineTotal)}</p>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #333;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; color: white; text-align: center;">
                <h1 style="margin: 0; font-size: 24px;">✓ Order Confirmed!</h1>
                <p style="margin: 8px 0 0 0; opacity: 0.9;">Thank you for your purchase</p>
            </div>
            
            <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px;">
                <p style="margin-top: 0;">Hi <strong>${escapeHtml(customerName)}</strong>,</p>
                <p>We have successfully received your order and are getting it ready for shipment. Below are your order details:</p>
                
                <div style="background: white; border: 2px solid #667eea; border-radius: 8px; padding: 16px; margin: 20px 0;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div>
                            <p style="margin: 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Order ID</p>
                            <p style="margin: 4px 0 0 0; font-size: 16px; font-weight: bold; color: #1f2937;">${escapeHtml(orderId)}</p>
                        </div>
                        <div>
                            <p style="margin: 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Total Amount</p>
                            <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: bold; color: #667eea;">${formatINR(amount)}</p>
                        </div>
                        <div>
                            <p style="margin: 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Payment Method</p>
                            <p style="margin: 4px 0 0 0; font-size: 14px; color: #1f2937;">${escapeHtml(paymentLabel)}</p>
                        </div>
                        <div>
                            <p style="margin: 0; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Status</p>
                            <p style="margin: 4px 0 0 0; font-size: 14px; color: #10b981; font-weight: bold;">Processing</p>
                        </div>
                    </div>
                </div>
                
                <h3 style="color: #1f2937; margin: 24px 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #667eea;">Order Items</h3>
                ${productRows}
                
                <p style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
                    We will notify you with tracking information once your order ships. If you have any questions, feel free to contact our support team.
                </p>
                
                <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
                    <p style="margin: 0;">Best Regards,<br><strong>Geeta Kalp Team</strong></p>
                    <p style="margin: 8px 0 0 0;">For support, visit our website or contact us at support@geetakalp.com</p>
                </div>
            </div>
        </div>
    `;
}

async function sendOrderNotifications(orderId, amount, customerInfo, paymentMethod, items) {
    try {
        const adminEmail = 'admin@geetakalp.com';
        const itemsList = (items || []).map(i => `${i.name} (x${i.quantity})`).join(', ');
        const customerName = customerInfo.name || 'Customer';
        const paymentLabel = String(paymentMethod || 'online').toUpperCase();
        const address = `${customerInfo.address || ''}, ${customerInfo.city || ''}, ${customerInfo.state || ''} - ${customerInfo.pincode || ''}`;
        const itemRows = buildOrderItemsHtml(items);

        if (process.env.MAILJET_API_KEY && isValidEmail(adminEmail)) {
            await sendMailjetEmail({
                to: [{ email: adminEmail, name: 'Geeta Kalp Admin' }],
                subject: `New Order Received - ${orderId}`,
                textContent: `New order received.\n\nOrder ID: ${orderId}\nAmount: ${formatINR(amount)}\nCustomer: ${customerName} (${customerInfo.email || 'No email'})\nPhone: ${customerInfo.phone || 'N/A'}\nPayment Method: ${paymentLabel}\nItems: ${itemsList}\nAddress: ${address}`,
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #222;">
                        <h2 style="color: #4f46e5;">New Order Received</h2>
                        <p><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>
                        <p><strong>Total:</strong> ${formatINR(amount)}</p>
                        <p><strong>Payment:</strong> ${escapeHtml(paymentLabel)}</p>
                        <h3>Customer</h3>
                        <p>
                            ${escapeHtml(customerName)}<br>
                            ${escapeHtml(customerInfo.email || 'No email')}<br>
                            ${escapeHtml(customerInfo.phone || 'N/A')}<br>
                            ${escapeHtml(address)}
                        </p>
                        <h3>Items</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr>
                                    <th style="text-align: left; padding-bottom: 8px;">Item</th>
                                    <th style="text-align: center; padding-bottom: 8px;">Qty</th>
                                    <th style="text-align: right; padding-bottom: 8px;">Total</th>
                                </tr>
                            </thead>
                            <tbody>${itemRows}</tbody>
                        </table>
                    </div>
                `
            });
        }

        if (process.env.WEB3FORMS_ACCESS_KEY) {
            await fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_key: process.env.WEB3FORMS_ACCESS_KEY,
                    subject: `New Order Received - ${orderId}`,
                    from_name: 'Geeta Kalp System',
                    to: adminEmail,
                    message: `A new order has been placed!\n\nOrder ID: ${orderId}\nAmount: ${formatINR(amount)}\nCustomer: ${customerName} (${customerInfo.email})\nPhone: ${customerInfo.phone}\nPayment Method: ${paymentLabel}\n\nItems: ${itemsList}\nAddress: ${address}`
                })
            });
        }

        if (process.env.MAILJET_API_KEY && isValidEmail(customerInfo.email)) {
            const customerEmailHtml = buildCustomerOrderEmail(orderId, amount, customerName, paymentLabel, items);
            await sendMailjetEmail({
                to: [{ email: customerInfo.email, name: customerName }],
                subject: `Order Confirmation - ${orderId}`,
                textContent: `Hi ${customerName},\n\nThank you for your order.\n\nOrder ID: ${orderId}\nTotal Amount: ${formatINR(amount)}\nPayment Method: ${paymentLabel}\n\nWe will notify you once your order ships.\n\nGeeta Kalp Team`,
                htmlContent: customerEmailHtml
            });
        }
    } catch (error) {
        console.error('Notification Error:', error);
    }
}

async function validateCouponForOrder(coupon, subtotal, customerEmail) {
    if (!coupon || !coupon.code) {
        return { valid: true, couponInfo: null, discount: 0 };
    }

    const couponSnap = await db.ref('coupons').orderByChild('code').equalTo(String(coupon.code).toUpperCase()).once('value');
    if (!couponSnap.exists()) {
        return { valid: false, error: 'Invalid coupon code' };
    }

    const key = Object.keys(couponSnap.val())[0];
    const couponData = couponSnap.val()[key];

    if (couponData.active === false) {
        return { valid: false, error: 'This coupon is inactive' };
    }

    if (couponData.validTill && new Date(couponData.validTill).getTime() < Date.now()) {
        return { valid: false, error: 'This coupon has expired' };
    }

    if (couponData.usageType === 'global_single' && (couponData.usedCount || 0) >= 1) {
        return { valid: false, error: 'This coupon limit has been reached' };
    }

    const minOrderAmount = Math.max(0, Number(couponData.minOrderAmount || 0));
    if (minOrderAmount > 0 && subtotal < minOrderAmount) {
        return {
            valid: false,
            error: `This coupon requires a minimum order amount of ₹${minOrderAmount.toLocaleString('en-IN')}`
        };
    }

    if (couponData.usageType === 'per_user_single') {
        if (!customerEmail) {
            return { valid: false, error: 'Please login to use this coupon' };
        }

        const safeEmail = customerEmail.replace(/\./g, ',');
        if (couponData.usedBy && couponData.usedBy[safeEmail]) {
            return { valid: false, error: 'You have already used this coupon' };
        }
    }

    const discount = Math.round((subtotal * Number(couponData.discountPercent || 0)) / 100);
    return {
        valid: true,
        couponInfo: {
            code: couponData.code,
            discount,
            discountPercent: Number(couponData.discountPercent || 0),
            minOrderAmount: minOrderAmount || null
        },
        discount
    };
}

// ─── Middleware: Verify Admin Token ───
function normalizeProductBadge(type, text, isNewFallback = false) {
    const allowedTypes = ['none', 'new', 'trending', 'custom'];
    const badgeType = allowedTypes.includes(type) ? type : (isNewFallback ? 'new' : 'none');
    const badgeText = badgeType === 'custom'
        ? String(text || '').trim().substring(0, 18)
        : '';

    return {
        productBadgeType: badgeType === 'custom' && !badgeText ? 'none' : badgeType,
        productBadgeText: badgeText
    };
}

const verifyAdmin = async (req, res, next) => {
    const token = req.headers.authorization?.split('Bearer ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Allow our custom RTDB token session
    if (token === 'admin_session') {
        req.user = { uid: 'admin', email: 'admin@geetakalp.com' };
        return next();
    }

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        // If service account is missing, verifyIdToken fails.
        // In dev mode, allow through with a warning.
        if (error.code === 'app/no-app' || error.message?.includes('credential') || error.message?.includes('INVALID_CREDENTIAL')) {
            console.warn('⚠️  Token verification skipped (no service account). Request allowed in dev mode.');
            req.user = { uid: 'dev-admin', email: 'admin@dev' };
            return next();
        }
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// ══════════════════════════════════════════
//  CHECKOUT TOKEN HELPERS
// ══════════════════════════════════════════

// Generate a one-time checkout token (valid for 5 minutes)
async function generateCheckoutToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes from now

    await db.ref(`checkoutTokens/${token}`).set({
        createdAt: admin.database.ServerValue.TIMESTAMP,
        expiresAt: expiresAt,
        used: false
    });

    return token;
}

// Validate a checkout token
async function validateCheckoutToken(token) {
    if (!token) return { valid: false, error: 'Token required' };

    try {
        const snapshot = await db.ref(`checkoutTokens/${token}`).once('value');
        const tokenData = snapshot.val();

        if (!tokenData) {
            return { valid: false, error: 'Invalid token' };
        }

        if (tokenData.used) {
            return { valid: false, error: 'Token already used' };
        }

        if (Date.now() > tokenData.expiresAt) {
            return { valid: false, error: 'Token expired' };
        }

        return { valid: true };
    } catch (error) {
        console.error('Token validation error:', error);
        return { valid: false, error: 'Token validation failed' };
    }
}

// Consume a checkout token (mark as used)
async function consumeCheckoutToken(token) {
    try {
        await db.ref(`checkoutTokens/${token}`).update({
            used: true,
            usedAt: admin.database.ServerValue.TIMESTAMP
        });
    } catch (error) {
        console.error('Token consumption error:', error);
    }
}

// ══════════════════════════════════════════
//  PRODUCT APIS
// ══════════════════════════════════════════

// ─── Get All Products ───
router.get('/products', async (req, res) => {
    try {
        const snapshot = await db.ref('products').once('value');
        const products = [];
        snapshot.forEach(child => {
            products.push(normalizeProductImages({ id: child.key, ...child.val() }));
        });
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Get Single Product ───
router.get('/products/:id', async (req, res) => {
    try {
        const snapshot = await db.ref(`products/${req.params.id}`).once('value');
        const product = snapshot.val();
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }
        res.json({ success: true, product: normalizeProductImages({ id: req.params.id, ...product }) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Add Product (Admin) ───
router.post('/products', verifyAdmin, async (req, res) => {
    try {
        const { name, description, originalPrice, salePrice, category, images, isNew, productBadgeType, productBadgeText, active, stock, paymentMethods } = req.body;

        if (!name || !originalPrice || !salePrice) {
            return res.status(400).json({ success: false, error: 'Name, original price, and sale price are required.' });
        }

        const badgeData = normalizeProductBadge(productBadgeType, productBadgeText, isNew);
        const productData = {
            name,
            description: description || '',
            originalPrice: parseFloat(originalPrice),
            salePrice: parseFloat(salePrice),
            category: category || 'General',
            images: Array.isArray(images) ? images.map(toPrivateR2ImageUrl).filter(Boolean) : [],
            isNew: badgeData.productBadgeType === 'new',
            productBadgeType: badgeData.productBadgeType,
            productBadgeText: badgeData.productBadgeText,
            active: active !== false,
            stock: parseInt(stock) || 0,
            paymentMethods: paymentMethods || { razorpay: true, cod: true },
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP
        };

        const ref = await db.ref('products').push(productData);
        res.json({ success: true, id: ref.key, message: 'Product added successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Update Product (Admin) ───
router.put('/products/:id', verifyAdmin, async (req, res) => {
    try {
        const updates = { ...req.body };
        if (Array.isArray(updates.images)) {
            updates.images = updates.images.map(toPrivateR2ImageUrl).filter(Boolean);
        }
        const badgeData = normalizeProductBadge(updates.productBadgeType, updates.productBadgeText, updates.isNew);
        updates.productBadgeType = badgeData.productBadgeType;
        updates.productBadgeText = badgeData.productBadgeText;
        updates.isNew = badgeData.productBadgeType === 'new';
        if (updates.originalPrice) updates.originalPrice = parseFloat(updates.originalPrice);
        if (updates.salePrice) updates.salePrice = parseFloat(updates.salePrice);
        if (updates.stock) updates.stock = parseInt(updates.stock);
        if (!updates.paymentMethods) updates.paymentMethods = { razorpay: true, cod: true };
        updates.updatedAt = admin.database.ServerValue.TIMESTAMP;

        await db.ref(`products/${req.params.id}`).update(updates);
        res.json({ success: true, message: 'Product updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Delete Product (Admin) ───
router.delete('/products/:id', verifyAdmin, async (req, res) => {
    try {
        await db.ref(`products/${req.params.id}`).remove();
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Toggle New Badge (Admin) ───
router.patch('/products/:id/toggle-new', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref(`products/${req.params.id}/isNew`).once('value');
        const currentValue = snapshot.val();
        await db.ref(`products/${req.params.id}`).update({
            isNew: !currentValue,
            productBadgeType: !currentValue ? 'new' : 'none',
            productBadgeText: '',
            updatedAt: admin.database.ServerValue.TIMESTAMP
        });
        res.json({ success: true, isNew: !currentValue, message: `NEW badge ${!currentValue ? 'enabled' : 'disabled'}` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.patch('/products/:id/images', verifyAdmin, async (req, res) => {
    try {
        const images = Array.isArray(req.body.images) ? req.body.images : [];
        const normalizedImages = images.map(toPrivateR2ImageUrl).filter(Boolean);

        await db.ref(`products/${req.params.id}`).update({
            images: normalizedImages,
            updatedAt: admin.database.ServerValue.TIMESTAMP
        });

        res.json({ success: true, images: normalizedImages });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════
//  CATEGORY APIS
// ══════════════════════════════════════════

// ─── Get Categories ───
router.get('/categories', async (req, res) => {
    try {
        const snapshot = await db.ref('categories').once('value');
        const categories = snapshot.val() || {};
        res.json({ success: true, categories: Object.values(categories) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Add Category (Admin) ───
router.post('/categories', verifyAdmin, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Category name required' });
        await db.ref('categories').push({ name, createdAt: admin.database.ServerValue.TIMESTAMP });
        res.json({ success: true, message: 'Category added' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════
//  ORDER & PAYMENT APIS
// ══════════════════════════════════════════

// ─── Generate Checkout Token ───
router.post('/generate-checkout-token', async (req, res) => {
    try {
        // For future use: Add backend authentication check if needed
        // For now, relying on client-side Firebase auth check

        const token = await generateCheckoutToken();
        res.json({
            success: true,
            token: token,
            expiresIn: '5 minutes',
            message: 'Checkout token generated successfully'
        });
    } catch (error) {
        console.error('Generate token error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Validate Checkout Token ───
router.post('/validate-checkout-token', async (req, res) => {
    try {
        const { token } = req.body;
        const validation = await validateCheckoutToken(token);

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: validation.error
            });
        }

        res.json({
            success: true,
            message: 'Token is valid',
            valid: true
        });
    } catch (error) {
        console.error('Token validation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Create Razorpay Order ───
router.post('/create-order', async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(503).json({ success: false, error: 'Payment gateway not configured' });
        }

        let { amount, amountToPayNow, paymentMethod, currency, customerInfo, items, coupon, checkoutToken } = req.body;

        // Validate checkout token
        if (!checkoutToken) {
            return res.status(401).json({ success: false, error: 'Invalid checkout session. Please start checkout again.' });
        }

        const tokenValidation = await validateCheckoutToken(checkoutToken);
        if (!tokenValidation.valid) {
            return res.status(401).json({ success: false, error: tokenValidation.error });
        }

        if (!amount || !customerInfo || !items) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const subtotal = items.reduce((sum, item) => {
            return sum + (Number(item.price || 0) * Number(item.quantity || 0));
        }, 0);
        const couponValidation = await validateCouponForOrder(coupon, subtotal, customerInfo.email);
        if (!couponValidation.valid) {
            return res.status(400).json({ success: false, error: couponValidation.error });
        }
        coupon = couponValidation.couponInfo;

        const isCOD = paymentMethod === 'cod';
        const payNow = amountToPayNow !== undefined ? amountToPayNow : amount;

        // If 100% COD (nothing to pay online), skip Razorpay
        if (payNow === 0 && isCOD) {
            const orderData = {
                razorpayOrderId: null,
                amount: amount,
                amountPaidOnline: 0,
                paymentMethod: 'cod',
                currency: currency || 'INR',
                customerInfo,
                items,
                coupon: coupon || null,
                status: 'processing',
                createdAt: admin.database.ServerValue.TIMESTAMP
            };
            const orderRef = await db.ref('orders').push(orderData);

            // Consume the checkout token
            await consumeCheckoutToken(checkoutToken);

            // Burn the coupon immediately since there is no verify-payment step
            if (coupon && coupon.code && customerInfo.email) {
                const couponSnap = await db.ref('coupons').orderByChild('code').equalTo(coupon.code).once('value');
                if (couponSnap.exists()) {
                    const key = Object.keys(couponSnap.val())[0];
                    const couponData = couponSnap.val()[key];
                    const updates = { usedCount: (couponData.usedCount || 0) + 1 };
                    await db.ref(`coupons/${key}`).update(updates);
                    const safeEmail = customerInfo.email.replace(/\./g, ',');
                    await db.ref(`coupons/${key}/usedBy/${safeEmail}`).set(admin.database.ServerValue.TIMESTAMP);
                }
            }

            // Send Email Notifications
            await sendOrderNotifications(orderRef.key, amount, customerInfo, 'cod', items);

            return res.json({
                success: true,
                orderId: orderRef.key,
                requiresPayment: false
            });
        }

        // Otherwise, create Razorpay order for the 'payNow' amount
        const options = {
            amount: Math.round(payNow * 100), // amount in paise
            currency: currency || 'INR',
            receipt: `order_${Date.now()}`,
            notes: {
                customerName: customerInfo.name,
                customerEmail: customerInfo.email,
                customerPhone: customerInfo.phone,
                paymentMethod: paymentMethod || 'online'
            }
        };

        const order = await razorpay.orders.create(options);

        // Store order in Firebase
        const orderData = {
            razorpayOrderId: order.id,
            amount: amount,
            amountPaidOnline: payNow,
            paymentMethod: paymentMethod || 'online',
            currency: currency || 'INR',
            customerInfo,
            items,
            coupon: coupon || null,
            status: 'created',
            createdAt: admin.database.ServerValue.TIMESTAMP,
            checkoutToken: checkoutToken // Store token for reference
        };

        const orderRef = await db.ref('orders').push(orderData);

        res.json({
            success: true,
            requiresPayment: true,
            orderId: orderRef.key,
            razorpayOrderId: order.id,
            amount: order.amount,
            currency: order.currency
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Verify Payment ───
router.post('/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

        // Verify signature
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            const orderSnap = await db.ref(`orders/${orderId}`).once('value');
            const orderData = orderSnap.val();
            const nextStatus = orderData && orderData.paymentMethod === 'cod' ? 'processing' : 'paid';

            // Update order status in Firebase
            await db.ref(`orders/${orderId}`).update({
                status: nextStatus,
                razorpayPaymentId: razorpay_payment_id,
                razorpaySignature: razorpay_signature,
                paidAt: admin.database.ServerValue.TIMESTAMP
            });

            // Consume the checkout token on successful payment
            if (orderData && orderData.checkoutToken) {
                await consumeCheckoutToken(orderData.checkoutToken);
            }

            // Burn the coupon on successful payment
            if (orderData && orderData.coupon && orderData.coupon.code && orderData.customerInfo && orderData.customerInfo.email) {
                const couponSnap = await db.ref('coupons').orderByChild('code').equalTo(orderData.coupon.code).once('value');
                if (couponSnap.exists()) {
                    const key = Object.keys(couponSnap.val())[0];
                    const couponData = couponSnap.val()[key];
                    const updates = { usedCount: (couponData.usedCount || 0) + 1 };
                    await db.ref(`coupons/${key}`).update(updates);
                    const safeEmail = orderData.customerInfo.email.replace(/\./g, ',');
                    await db.ref(`coupons/${key}/usedBy/${safeEmail}`).set(admin.database.ServerValue.TIMESTAMP);
                }
            }

            if (orderData) {
                await sendOrderNotifications(orderId, orderData.amount, orderData.customerInfo, orderData.paymentMethod || 'online', orderData.items || []);
            }

            res.json({ success: true, message: 'Payment verified successfully' });
        } else {
            await db.ref(`orders/${orderId}`).update({ status: 'failed' });
            res.status(400).json({ success: false, error: 'Payment verification failed' });
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Get Orders (Admin) ───
router.get('/orders', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('orders').orderByChild('createdAt').once('value');
        const orders = [];
        snapshot.forEach(child => {
            orders.push({ id: child.key, ...child.val() });
        });
        orders.reverse();
        res.json({ success: true, orders });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Update Order Status (Admin) ───
router.patch('/orders/:id/status', verifyAdmin, async (req, res) => {
    try {
        const { status } = req.body;

        const updates = {
            status,
            updatedAt: admin.database.ServerValue.TIMESTAMP
        };

        // If status is changed to delivered, record the timestamp
        if (status === 'delivered') {
            updates.deliveredAt = admin.database.ServerValue.TIMESTAMP;
        }

        await db.ref(`orders/${req.params.id}`).update(updates);
        res.json({ success: true, message: 'Order status updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Delete Order (Admin) ───
router.delete('/orders/:id', verifyAdmin, async (req, res) => {
    try {
        await db.ref(`orders/${req.params.id}`).remove();
        res.json({ success: true, message: 'Order deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Dashboard Stats (Admin) ───
router.get('/stats', verifyAdmin, async (req, res) => {
    try {
        const [productsSnap, ordersSnap] = await Promise.all([
            db.ref('products').once('value'),
            db.ref('orders').once('value')
        ]);

        let totalProducts = 0;
        let activeProducts = 0;
        productsSnap.forEach(child => {
            totalProducts++;
            if (child.val().active !== false) activeProducts++;
        });

        let totalOrders = 0;
        let totalRevenue = 0;
        let pendingOrders = 0;
        ordersSnap.forEach(child => {
            totalOrders++;
            const order = child.val();
            if (order.status === 'paid' || order.status === 'delivered') {
                totalRevenue += order.amount || 0;
            }
            if (order.status === 'paid' || order.status === 'created') {
                pendingOrders++;
            }
        });

        res.json({
            success: true,
            stats: {
                totalProducts,
                activeProducts,
                totalOrders,
                totalRevenue,
                pendingOrders
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
// ══════════════════════════════════════════
//  USERS & SETTINGS APIS
// ══════════════════════════════════════════

// ─── Get All Users (Derived from Orders) ───
router.get('/new-arrivals', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('settings/newArrivalProductIds').once('value');
        const productIds = snapshot.val() || [];
        res.json({ success: true, productIds: Array.isArray(productIds) ? productIds : [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/new-arrivals', verifyAdmin, async (req, res) => {
    try {
        const productIds = Array.isArray(req.body.productIds)
            ? req.body.productIds.map(id => String(id).trim()).filter(Boolean)
            : [];
        const uniqueProductIds = [...new Set(productIds)].slice(0, 12);

        await db.ref('settings').update({
            newArrivalProductIds: uniqueProductIds,
            newArrivalUpdatedAt: admin.database.ServerValue.TIMESTAMP
        });

        res.json({ success: true, productIds: uniqueProductIds });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/users', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('orders').once('value');
        const orders = snapshot.val();

        if (!orders) {
            return res.json({ success: true, users: [] });
        }

        const usersMap = {};

        Object.keys(orders).forEach(orderId => {
            const order = orders[orderId];
            if (!order.customerInfo || !order.customerInfo.email) return;

            const email = order.customerInfo.email;
            if (!usersMap[email]) {
                usersMap[email] = {
                    id: email, // Using email as unique ID
                    name: order.customerInfo.name || 'Unknown',
                    email: email,
                    phone: order.customerInfo.phone || 'N/A',
                    address: order.customerInfo.address || 'N/A',
                    city: order.customerInfo.city || 'N/A',
                    state: order.customerInfo.state || 'N/A',
                    zipCode: order.customerInfo.zipCode || 'N/A',
                    totalOrders: 0,
                    totalSpent: 0,
                    firstOrderDate: order.createdAt,
                    lastOrderDate: order.createdAt
                };
            }

            usersMap[email].totalOrders += 1;
            usersMap[email].totalSpent += (order.amount || 0);

            if (order.createdAt < usersMap[email].firstOrderDate) {
                usersMap[email].firstOrderDate = order.createdAt;
            }
            if (order.createdAt > usersMap[email].lastOrderDate) {
                usersMap[email].lastOrderDate = order.createdAt;
            }
        });

        const usersList = Object.values(usersMap).sort((a, b) => b.lastOrderDate - a.lastOrderDate);

        res.json({ success: true, users: usersList });
    } catch (error) {
        console.error('Fetch users error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Get Settings ───
router.get('/settings', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('settings').once('value');
        let settings = snapshot.val();
        if (!settings) {
            // Default settings
            settings = {
                paymentMethods: { razorpay: true, cod: true },
                storeName: 'Geeta Kalp',
                contactEmail: 'contact@geetakalp.com'
            };
        }
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Update Settings ───
router.post('/settings', verifyAdmin, async (req, res) => {
    try {
        await db.ref('settings').update(req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Categories API ───
router.get('/categories', async (req, res) => {
    try {
        const snapshot = await db.ref('categories').once('value');
        const categoriesData = snapshot.val() || {};
        const categories = Object.keys(categoriesData).map(id => ({
            id,
            name: categoriesData[id].name
        }));
        res.json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/categories', verifyAdmin, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
        const ref = await db.ref('categories').push({ name });
        res.json({ success: true, id: ref.key });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/categories/:id', verifyAdmin, async (req, res) => {
    try {
        await db.ref(`categories/${req.params.id}`).remove();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Reviews API ───
router.post('/reviews', async (req, res) => {
    try {
        const { productId, rating, comment, customerName, customerEmail } = req.body;
        if (!productId || !rating) return res.status(400).json({ success: false, error: 'Product ID and Rating required' });

        await db.ref('reviews').push({
            productId,
            rating: Number(rating),
            comment: comment || '',
            customerName: customerName || 'Anonymous',
            customerEmail: customerEmail || '',
            approved: false, // Must be approved by admin
            createdAt: admin.database.ServerValue.TIMESTAMP
        });

        res.json({ success: true, message: 'Review submitted for approval' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/reviews/admin', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('reviews').once('value');
        const data = snapshot.val() || {};
        const reviews = Object.keys(data).map(id => ({ id, ...data[id] })).sort((a, b) => b.createdAt - a.createdAt);
        res.json({ success: true, reviews });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.patch('/reviews/:id', verifyAdmin, async (req, res) => {
    try {
        const { approved } = req.body;
        await db.ref(`reviews/${req.params.id}`).update({ approved: !!approved });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/reviews/:id', verifyAdmin, async (req, res) => {
    try {
        await db.ref(`reviews/${req.params.id}`).remove();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const sharp = require('sharp');
const { uploadToR2, fetchFromR2, deleteFromR2, fetchCredentialsFromFirebase, clearCredentialsCache } = require('../services/cloudflareR2');

// ─── Debug: Inspect Firebase R2 Keys ───
router.get('/debug/firebase-keys', verifyAdmin, async (req, res) => {
    try {
        const [accessKeySnap, secretKeySnap, accountIdSnap, bucketSnap, endpointSnap, publicUrlSnap] = await Promise.all([
            db.ref('cloudflare_access_key_id').once('value'),
            db.ref('cloudflare_secret_access_key').once('value'),
            db.ref('cloudflare_account_id').once('value'),
            db.ref('cloudflare_r2_bucket_name').once('value'),
            db.ref('cloudflare_endpoint').once('value'),
            db.ref('cloudflare_r2_public_url').once('value')
        ]);

        res.json({
            success: true,
            firebase: {
                cloudflare_access_key_id: accessKeySnap.val() ? accessKeySnap.val().substring(0, 10) + '...' : null,
                cloudflare_secret_access_key: secretKeySnap.val() ? '***configured***' : null,
                cloudflare_account_id: accountIdSnap.val(),
                cloudflare_r2_bucket_name: bucketSnap.val(),
                cloudflare_endpoint: endpointSnap.val(),
                cloudflare_r2_public_url: publicUrlSnap.val()
            },
            instructions: 'Add missing keys to Firebase Realtime Database at root level. Expected endpoint format: https://ACCOUNT_ID.r2.cloudflarestorage.com'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Debug: Test Endpoint Connectivity ───
router.get('/debug/test-endpoint', verifyAdmin, async (req, res) => {
    try {
        const endpointSnap = await db.ref('cloudflare_endpoint').once('value');
        const endpoint = endpointSnap.val();

        if (!endpoint) {
            return res.status(400).json({
                success: false,
                error: 'cloudflare_endpoint not set in Firebase'
            });
        }

        console.log(`🧪 Testing endpoint: ${endpoint}`);

        // Validate endpoint format
        const isValidFormat = /^https:\/\/[a-zA-Z0-9]+\.r2\.cloudflarestorage\.com\/?$/.test(endpoint);

        if (!isValidFormat) {
            return res.status(400).json({
                success: false,
                error: 'Invalid endpoint format',
                received: endpoint,
                expected: 'https://ACCOUNT_ID.r2.cloudflarestorage.com',
                hint: 'Make sure the endpoint is in the correct R2 format'
            });
        }

        // Try to connect
        try {
            const testUrl = endpoint.replace(/\/$/, '') + '/';
            const response = await fetch(testUrl, {
                method: 'HEAD',
                timeout: 5000
            });

            res.json({
                success: true,
                endpoint,
                status: response.status,
                message: 'Endpoint is reachable',
                format: 'Valid R2 endpoint format'
            });
        } catch (connectError) {
            res.status(400).json({
                success: false,
                endpoint,
                error: connectError.message,
                hint: 'Endpoint format looks valid, but server cannot connect. Check:\n1. Firewall rules\n2. Cloudflare account ID is correct\n3. Network connectivity',
                format: 'Valid R2 endpoint format'
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Debug: Verify R2 Credentials ───
router.get('/debug/verify-credentials', verifyAdmin, async (req, res) => {
    try {
        console.log('\n🔍 Verifying R2 credentials...\n');

        const credentials = await fetchCredentialsFromFirebase(db);

        // Check for common issues
        const issues = [];

        if (credentials.accessKeyId.includes(' ')) {
            issues.push('Access Key ID has spaces');
        }
        if (credentials.secretAccessKey.includes(' ')) {
            issues.push('Secret Access Key has spaces');
        }
        if (!credentials.accessKeyId.match(/^[a-z0-9]+$/i)) {
            issues.push('Access Key ID contains invalid characters');
        }

        res.json({
            success: true,
            credentials: {
                accessKeyId: `${credentials.accessKeyId.substring(0, 5)}...${credentials.accessKeyId.substring(credentials.accessKeyId.length - 5)}`,
                accessKeyIdLength: credentials.accessKeyId.length,
                secretAccessKeyLength: credentials.secretAccessKey.length,
                bucketName: credentials.bucketName,
                endpoint: credentials.endpoint,
                accountId: credentials.accountId
            },
            issues: issues.length > 0 ? issues : ['None detected'],
            nextStep: issues.length > 0 ? 'Fix the issues above in Firebase' : 'Credentials look valid. Try uploading an image.'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Debug: Test Endpoint Connectivity ───
router.get('/debug/r2-config', verifyAdmin, async (req, res) => {
    try {
        const credentials = await fetchCredentialsFromFirebase(db);
        res.json({
            success: true,
            config: {
                accessKeyId: credentials.accessKeyId ? credentials.accessKeyId.substring(0, 10) + '...' : '❌ Missing',
                secretAccessKey: credentials.secretAccessKey ? '✅ Configured' : '❌ Missing',
                accountId: credentials.accountId || '❌ Missing',
                bucketName: credentials.bucketName || '❌ Missing',
                endpoint: credentials.endpoint || '❌ Missing',
                publicUrl: credentials.publicUrl || 'Optional; private bucket uses /api/fetch-image/:key'
            },
            message: '✅ All R2 credentials are configured correctly'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message,
            message: '❌ R2 configuration incomplete'
        });
    }
});

// ─── Debug: Clear Credentials Cache ───
router.post('/debug/clear-cache', verifyAdmin, async (req, res) => {
    try {
        clearCredentialsCache();
        res.json({ success: true, message: 'Credentials cache cleared' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Image Upload to Cloudflare R2 ───
router.post('/upload', verifyAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        // Validate file type
        if (!req.file.mimetype.startsWith('image/')) {
            return res.status(400).json({ success: false, error: 'Only image files are allowed' });
        }

        // Compress image using sharp to WebP format
        const compressedBuffer = await sharp(req.file.buffer)
            .webp({ quality: 80, lossless: false })
            .toBuffer();

        // Upload to Cloudflare R2 (pass db reference)
        const uploadResult = await uploadToR2(
            compressedBuffer,
            req.file.originalname,
            'image/webp',
            db
        );

        if (!uploadResult.success) {
            console.error('R2 Upload failed:', uploadResult.error);
            return res.status(500).json({
                success: false,
                error: `Upload failed: ${uploadResult.error}`
            });
        }

        res.json({
            success: true,
            url: uploadResult.url,
            key: uploadResult.key,
            message: 'Image uploaded successfully'
        });
    } catch (error) {
        console.error('❌ Upload Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Fetch Image from Cloudflare R2 ───
router.get('/fetch-image/:key(*)', async (req, res) => {
    try {
        const key = req.params.key;

        if (!key) {
            return res.status(400).json({ success: false, error: 'Image key is required' });
        }

        const fetchResult = await fetchFromR2(key, db);

        if (!fetchResult.success) {
            console.error('R2 Fetch failed:', fetchResult.error);
            return res.status(404).json({
                success: false,
                error: `Image not found: ${fetchResult.error}`
            });
        }

        // Set appropriate headers
        res.setHeader('Content-Type', fetchResult.contentType || 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // Cache for 1 year
        if (fetchResult.contentLength) {
            res.setHeader('Content-Length', fetchResult.contentLength);
        }

        // Stream the image
        fetchResult.body.pipe(res);
    } catch (error) {
        console.error('❌ Fetch Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Delete Image from Cloudflare R2 ───
router.delete('/delete-image/:key(*)', verifyAdmin, async (req, res) => {
    try {
        const key = req.params.key;

        if (!key) {
            return res.status(400).json({ success: false, error: 'Image key is required' });
        }

        const deleteResult = await deleteFromR2(key, db);

        if (!deleteResult.success) {
            console.error('R2 Delete failed:', deleteResult.error);
            return res.status(500).json({
                success: false,
                error: `Delete failed: ${deleteResult.error}`
            });
        }

        res.json({
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (error) {
        console.error('❌ Delete Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Coupons API ───
router.get('/public-coupons', async (req, res) => {
    try {
        const snapshot = await db.ref('coupons').once('value');
        const data = snapshot.val() || {};
        const publicCoupons = [];

        for (const key in data) {
            const c = data[key];
            if (c.active !== false && c.type !== 'private') {
                if (c.usageType === 'global_single' && (c.usedCount || 0) >= 1) continue;
                if (c.validTill && new Date(c.validTill).getTime() < Date.now()) continue;
                publicCoupons.push({
                    code: c.code,
                    discountPercent: c.discountPercent,
                    minOrderAmount: Math.max(0, Number(c.minOrderAmount || 0)) || null
                });
            }
        }
        res.json({ success: true, coupons: publicCoupons });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/coupons', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('coupons').once('value');
        const couponsData = snapshot.val() || {};
        const coupons = [];
        const now = Date.now();

        for (const id in couponsData) {
            const c = couponsData[id];

            // Auto-deactivate if expired
            if (c.active && c.validTill && new Date(c.validTill).getTime() < now) {
                c.active = false;
                db.ref(`coupons/${id}`).update({ active: false }).catch(err => console.error("Auto-expire failed:", err));
            }
            // Auto-deactivate if global_single limit reached
            if (c.active && c.usageType === 'global_single' && (c.usedCount || 0) >= 1) {
                c.active = false;
                db.ref(`coupons/${id}`).update({ active: false }).catch(err => console.error("Auto-expire global_single failed:", err));
            }

            coupons.push({ id, ...c });
        }
        res.json({ success: true, coupons });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/coupons', verifyAdmin, async (req, res) => {
    try {
        const { code, discountPercent, minOrderAmount, active, type, usageType, validTill } = req.body;
        if (!code || !discountPercent) return res.status(400).json({ success: false, error: 'Code and discount required' });

        // Ensure code doesn't exist
        const existSnap = await db.ref('coupons').orderByChild('code').equalTo(code.toUpperCase()).once('value');
        if (existSnap.exists()) {
            return res.status(400).json({ success: false, error: 'Coupon code already exists' });
        }

        const ref = await db.ref('coupons').push({
            code: code.toUpperCase(),
            discountPercent: Number(discountPercent),
            minOrderAmount: Math.max(0, Number(minOrderAmount || 0)) || null,
            active: active !== false,
            type: type || 'public',
            usageType: usageType || 'unlimited',
            usedCount: 0,
            validTill: validTill || null,
            createdAt: admin.database.ServerValue.TIMESTAMP
        });
        res.json({ success: true, id: ref.key });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/coupons/:id', verifyAdmin, async (req, res) => {
    try {
        const { discountPercent, minOrderAmount, active, type, usageType, validTill } = req.body;

        const updates = {
            discountPercent: Number(discountPercent),
            minOrderAmount: Math.max(0, Number(minOrderAmount || 0)) || null,
            active: active !== false,
            type: type || 'public',
            usageType: usageType || 'unlimited',
            validTill: validTill || null
        };

        await db.ref(`coupons/${req.params.id}`).update(updates);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.patch('/coupons/:id', verifyAdmin, async (req, res) => {
    try {
        await db.ref(`coupons/${req.params.id}`).update(req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/coupons/:id', verifyAdmin, async (req, res) => {
    try {
        await db.ref(`coupons/${req.params.id}`).remove();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════
//  WISHLIST APIS
// ══════════════════════════════════════════

// ─── Get Wishlist ───
router.get('/wishlist/:uid', async (req, res) => {
    try {
        const snapshot = await db.ref(`customers/${req.params.uid}/wishlist`).once('value');
        const wishlist = snapshot.val() || {};
        const productIds = Object.keys(wishlist);
        res.json({ success: true, productIds });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Get Wishlist Details ───
router.get('/wishlist-details/:uid', async (req, res) => {
    try {
        const snapshot = await db.ref(`customers/${req.params.uid}/wishlist`).once('value');
        const wishlist = snapshot.val() || {};
        const productIds = Object.keys(wishlist);

        if (productIds.length === 0) {
            return res.json({ success: true, products: [] });
        }

        const productPromises = productIds.map(async (id) => {
            const productSnap = await db.ref(`products/${id}`).once('value');
            if (productSnap.exists()) {
                const prod = productSnap.val();
                if (prod.active !== false) {
                    return normalizeProductImages({ id, ...prod });
                }
            }
            return null;
        });

        const products = (await Promise.all(productPromises)).filter(p => p !== null);
        res.json({ success: true, products });
    } catch (error) {
        console.error('Error fetching wishlist details:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Add to Wishlist ───
router.post('/wishlist', async (req, res) => {
    try {
        const { uid, productId } = req.body;
        if (!uid || !productId) {
            return res.status(400).json({ success: false, error: 'UID and Product ID required' });
        }
        await db.ref(`customers/${uid}/wishlist/${productId}`).set(admin.database.ServerValue.TIMESTAMP);
        res.json({ success: true, message: 'Added to wishlist' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Remove from Wishlist ───
router.delete('/wishlist/:uid/:productId', async (req, res) => {
    try {
        await db.ref(`customers/${req.params.uid}/wishlist/${req.params.productId}`).remove();
        res.json({ success: true, message: 'Removed from wishlist' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════
//  NEWSLETTER APIS
// ══════════════════════════════════════════

// ─── Subscribe to Newsletter ───
router.post('/newsletter/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ success: false, error: 'Valid email required' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const safeEmail = normalizedEmail.replace(/\./g, ',');

        // Check for existing subscription
        const existSnap = await db.ref(`newsletter_subscribers/${safeEmail}`).once('value');
        if (existSnap.exists()) {
            return res.status(400).json({ success: false, error: 'Already subscribed!' });
        }

        await db.ref(`newsletter_subscribers/${safeEmail}`).set({
            email: normalizedEmail,
            subscribedAt: admin.database.ServerValue.TIMESTAMP
        });

        res.json({ success: true, message: 'Successfully subscribed!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Get Newsletter Subscribers (Admin) ───
router.get('/newsletter/subscribers', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.ref('newsletter_subscribers').once('value');
        const data = snapshot.val() || {};
        const subscribers = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
        }));
        subscribers.sort((a, b) => (b.subscribedAt || 0) - (a.subscribedAt || 0));
        res.json({ success: true, subscribers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Delete Newsletter Subscriber (Admin) ───
router.delete('/newsletter/subscribers/:id', verifyAdmin, async (req, res) => {
    try {
        await db.ref(`newsletter_subscribers/${req.params.id}`).remove();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


module.exports = router;

