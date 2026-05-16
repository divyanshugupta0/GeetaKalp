const express = require('express');
const router = express.Router();
const { db, admin } = require('../firebase-admin-config');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const multer = require('multer');

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

// ─── Helper: Send Order Notifications ───
async function sendOrderNotifications(orderId, amount, customerInfo, paymentMethod, items) {
    try {
        const adminEmail = process.env.WEB3FORMS_ACCESS_KEY ? 'admin@geetakalp.com' : null;
        
        // 1. Notify Admin via Web3Forms
        if (process.env.WEB3FORMS_ACCESS_KEY) {
            const itemsList = items.map(i => `${i.name} (x${i.quantity})`).join(', ');
            await fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_key: process.env.WEB3FORMS_ACCESS_KEY,
                    subject: `New Order Received - ${orderId}`,
                    from_name: 'Geeta Kalp System',
                    to: adminEmail,
                    message: `A new order has been placed!\n\nOrder ID: ${orderId}\nAmount: ₹${amount}\nCustomer: ${customerInfo.name} (${customerInfo.email})\nPhone: ${customerInfo.phone}\nPayment Method: ${paymentMethod.toUpperCase()}\n\nItems: ${itemsList}\nAddress: ${customerInfo.address}, ${customerInfo.city}, ${customerInfo.state} - ${customerInfo.pincode}`
                })
            });
        }

        // 2. Notify Customer via Brevo API
        if (process.env.BREVO_API_KEY && customerInfo.email) {
            await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'api-key': process.env.BREVO_API_KEY
                },
                body: JSON.stringify({
                    sender: { name: 'Geeta Kalp', email: 'no-reply@geetakalp.com' },
                    to: [{ email: customerInfo.email, name: customerInfo.name }],
                    subject: 'Order Confirmation - Geeta Kalp',
                    htmlContent: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                            <h1 style="color: #6366f1;">Thank you for your order!</h1>
                            <p>Hi <strong>${customerInfo.name}</strong>,</p>
                            <p>We have successfully received your order and are getting it ready for shipment.</p>
                            <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderId}</p>
                                <p style="margin: 5px 0;"><strong>Total Amount:</strong> ₹${amount.toLocaleString('en-IN')}</p>
                                <p style="margin: 5px 0;"><strong>Payment Method:</strong> ${paymentMethod.toUpperCase()}</p>
                            </div>
                            <p>We will notify you once your order ships.</p>
                            <p>Best Regards,<br>Geeta Kalp Team</p>
                        </div>
                    `
                })
            });
        }
    } catch (error) {
        console.error('Notification Error:', error);
    }
}

// ─── Middleware: Verify Admin Token ───
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
//  PRODUCT APIS
// ══════════════════════════════════════════

// ─── Get All Products ───
router.get('/products', async (req, res) => {
    try {
        const snapshot = await db.ref('products').once('value');
        const products = [];
        snapshot.forEach(child => {
            products.push({ id: child.key, ...child.val() });
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
        res.json({ success: true, product: { id: req.params.id, ...product } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Add Product (Admin) ───
router.post('/products', verifyAdmin, async (req, res) => {
    try {
        const { name, description, originalPrice, salePrice, category, images, isNew, active, stock, paymentMethods } = req.body;

        if (!name || !originalPrice || !salePrice) {
            return res.status(400).json({ success: false, error: 'Name, original price, and sale price are required.' });
        }

        const productData = {
            name,
            description: description || '',
            originalPrice: parseFloat(originalPrice),
            salePrice: parseFloat(salePrice),
            category: category || 'General',
            images: images || [],
            isNew: isNew || false,
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
            updatedAt: admin.database.ServerValue.TIMESTAMP
        });
        res.json({ success: true, isNew: !currentValue, message: `NEW badge ${!currentValue ? 'enabled' : 'disabled'}` });
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

// ─── Create Razorpay Order ───
router.post('/create-order', async (req, res) => {
    try {
        if (!razorpay) {
            return res.status(503).json({ success: false, error: 'Payment gateway not configured' });
        }

        const { amount, amountToPayNow, paymentMethod, currency, customerInfo, items, coupon } = req.body;

        if (!amount || !customerInfo || !items) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

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
                status: 'paid', // Or 'confirmed_cod'
                paidAt: admin.database.ServerValue.TIMESTAMP,
                createdAt: admin.database.ServerValue.TIMESTAMP
            };
            const orderRef = await db.ref('orders').push(orderData);
            
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
            createdAt: admin.database.ServerValue.TIMESTAMP
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
            // Update order status in Firebase
            await db.ref(`orders/${orderId}`).update({
                status: 'paid',
                razorpayPaymentId: razorpay_payment_id,
                razorpaySignature: razorpay_signature,
                paidAt: admin.database.ServerValue.TIMESTAMP
            });

            // Burn the coupon on successful payment
            const orderSnap = await db.ref(`orders/${orderId}`).once('value');
            const orderData = orderSnap.val();
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
        const reviews = Object.keys(data).map(id => ({ id, ...data[id] })).sort((a,b) => b.createdAt - a.createdAt);
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

// ─── Image Upload via Cloudflare R2 Worker ───
router.post('/upload', verifyAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        // Fetch credentials from Firebase root
        const [endpointSnap, tokenSnap] = await Promise.all([
            db.ref('cloudflare_endpoint').once('value'),
            db.ref('cloudflare_token_value').once('value')
        ]);

        const endpoint = endpointSnap.val();
        const token = tokenSnap.val();

        if (!endpoint || !token) {
            return res.status(500).json({ success: false, error: 'Cloudflare credentials not configured in database' });
        }

        // Compress image using sharp losslessly (webp format)
        const compressedBuffer = await sharp(req.file.buffer)
            .webp({ lossless: true })
            .toBuffer();

        // Generate a unique filename with webp extension
        const filename = `images/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.webp`;

        // Upload to Cloudflare Worker
        const uploadUrl = `${endpoint.replace(/\/$/, '')}/?key=${encodeURIComponent(filename)}`;
        
        const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'image/webp'
            },
            body: compressedBuffer
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Worker upload failed: ${response.status} ${errText}`);
        }

        // URL to access the public image
        const publicUrl = uploadUrl;

        res.json({ success: true, url: publicUrl });
    } catch (error) {
        console.error('Upload Error:', error);
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
                publicCoupons.push({ code: c.code, discountPercent: c.discountPercent });
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
        const { code, discountPercent, active, type, usageType, validTill } = req.body;
        if (!code || !discountPercent) return res.status(400).json({ success: false, error: 'Code and discount required' });
        
        // Ensure code doesn't exist
        const existSnap = await db.ref('coupons').orderByChild('code').equalTo(code.toUpperCase()).once('value');
        if (existSnap.exists()) {
            return res.status(400).json({ success: false, error: 'Coupon code already exists' });
        }

        const ref = await db.ref('coupons').push({ 
            code: code.toUpperCase(), 
            discountPercent: Number(discountPercent), 
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
        const { discountPercent, active, type, usageType, validTill } = req.body;
        
        const updates = {
            discountPercent: Number(discountPercent),
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

module.exports = router;
