require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
let serviceAccount = null;

try {
    serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || './serviceAccountKey.json');
} catch (e) {
    // Service account file not found
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    console.log('✅ Firebase Admin SDK initialized with service account');
} else {
    // Initialize without credentials — works with Realtime Database in test mode
    // Admin auth verification (verifyIdToken) won't work without a service account
    admin.initializeApp({
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    console.warn('⚠️  No service account key found. Running in limited mode.');
    console.warn('   → Database will work if rules are set to test/public mode.');
    console.warn('   → Admin auth verification (token checks) will NOT work.');
    console.warn('   → Download key from: Firebase Console → Project Settings → Service Accounts\n');
}

const db = admin.database();

module.exports = { admin, db };
