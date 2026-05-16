const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { keyToFetchImageUrl } = require('./r2ImageUrls');

// Store credentials cache to avoid repeated Firebase calls
let credentialsCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch Cloudflare R2 credentials from Firebase
 * @param {object} db - Firebase database reference
 * @returns {Promise<{accessKeyId: string, secretAccessKey: string, accountId: string, bucketName: string, endpoint: string, publicUrl: string | null}>}
 */
async function fetchCredentialsFromFirebase(db) {
    // Return cached credentials if valid
    if (credentialsCache && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
        return credentialsCache;
    }

    try {
        console.log('🔍 Fetching Cloudflare R2 credentials from Firebase...');
        
        const [accessKeySnap, secretKeySnap, accountIdSnap, bucketSnap, endpointSnap, publicUrlSnap] = await Promise.all([
            db.ref('cloudflare_access_key_id').once('value'),
            db.ref('cloudflare_secret_access_key').once('value'),
            db.ref('cloudflare_account_id').once('value'),
            db.ref('cloudflare_r2_bucket_name').once('value'),
            db.ref('cloudflare_endpoint').once('value'),
            db.ref('cloudflare_r2_public_url').once('value')
        ]);

        const accessKeyId = accessKeySnap.val();
        const secretAccessKey = secretKeySnap.val();
        let accountId = accountIdSnap.val();
        const bucketName = bucketSnap.val();
        let endpoint = endpointSnap.val();
        let publicUrl = publicUrlSnap.val();

        console.log('📋 Firebase values found:');
        console.log(`   ${accessKeyId ? '✅' : '❌'} cloudflare_access_key_id: ${accessKeyId ? accessKeyId.substring(0, 15) + '...' : 'MISSING'}`);
        console.log(`   ${secretAccessKey ? '✅' : '❌'} cloudflare_secret_access_key: ${secretAccessKey ? '***' : 'MISSING'}`);
        console.log(`   ${accountId ? '✅' : '❌'} cloudflare_account_id: ${accountId ? accountId : 'MISSING'}`);
        console.log(`   ${bucketName ? '✅' : '❌'} cloudflare_r2_bucket_name: ${bucketName ? bucketName : 'MISSING'}`);
        console.log(`   ${endpoint ? '✅' : '❌'} cloudflare_endpoint: ${endpoint ? endpoint : 'MISSING'}`);
        console.log(`   ${publicUrl ? '✅' : 'ℹ️'} cloudflare_r2_public_url: ${publicUrl ? publicUrl : 'not set (private bucket mode)'}`);

        // Try to extract account ID from endpoint if not explicitly set
        if (!accountId && endpoint) {
            console.log(`\n🔍 Extracting account ID from endpoint: ${endpoint}`);
            
            // Pattern 1: Full R2 URL - https://abc123.r2.cloudflarestorage.com
            let match = endpoint.match(/https:\/\/([a-zA-Z0-9]+)\.r2\.cloudflarestorage\.com/);
            if (match) {
                accountId = match[1];
                console.log(`✅ Matched R2 URL pattern: extracted "${accountId}"`);
            }
            
            // Pattern 2: Custom domain - https://rc...something
            if (!accountId && endpoint.includes('://')) {
                match = endpoint.match(/https:\/\/([a-zA-Z0-9_-]+)(\.|\/)/);
                if (match) {
                    accountId = match[1];
                    console.log(`✅ Matched custom domain pattern: extracted "${accountId}"`);
                }
            }
            
            // Pattern 3: Just the ID
            if (!accountId && /^[a-zA-Z0-9]+$/.test(endpoint)) {
                accountId = endpoint;
                console.log(`✅ Endpoint is just the account ID: "${accountId}"`);
            }
            
            if (!accountId) {
                console.log(`❌ Could not extract account ID from endpoint`);
            }
        }

        // If endpoint is not provided but account ID is, construct it
        if (accountId && !endpoint) {
            endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
            console.log(`✅ Constructed endpoint from account ID: ${endpoint}`);
        }

        // Validate all required credentials are present
        const hasAllKeys = accessKeyId && secretAccessKey && accountId && bucketName && endpoint;
        
        if (!hasAllKeys) {
            const missing = [];
            if (!accessKeyId) missing.push('cloudflare_access_key_id');
            if (!secretAccessKey) missing.push('cloudflare_secret_access_key');
            if (!accountId) missing.push('cloudflare_account_id (set explicitly or extract from endpoint)');
            if (!bucketName) missing.push('cloudflare_r2_bucket_name');
            if (!endpoint) missing.push('cloudflare_endpoint');
            
            const errorMsg = `Missing required Firebase keys:\n  ${missing.join('\n  ')}\n\nCurrent values:\n  accountId: ${accountId || 'null'}\n  endpoint: ${endpoint || 'null'}\n  bucketName: ${bucketName || 'null'}`;
            console.error(`\n❌ CONFIGURATION ERROR:\n${errorMsg}\n`);
            throw new Error(errorMsg);
        }

        const credentials = {
            accessKeyId,
            secretAccessKey,
            accountId,
            bucketName,
            endpoint,
            publicUrl: publicUrl || null
        };

        // Cache credentials
        credentialsCache = credentials;
        cacheTimestamp = Date.now();

        console.log('\n✅ All R2 credentials validated and cached\n');
        
        return credentials;
    } catch (error) {
        console.error('❌ Credentials fetch error:', error.message);
        throw error;
    }
}

/**
 * Initialize S3 client for Cloudflare R2
 * @param {object} credentials - Cloudflare R2 credentials
 * @returns {S3Client}
 */
function initializeR2Client(credentials) {
    console.log('\n🔧 Initializing S3 client with:');
    console.log(`   Endpoint: ${credentials.endpoint}`);
    console.log(`   Bucket: ${credentials.bucketName}`);
    console.log(`   Access Key ID: ${credentials.accessKeyId.substring(0, 5)}...${credentials.accessKeyId.substring(credentials.accessKeyId.length - 5)}`);
    console.log(`   Secret Key Length: ${credentials.secretAccessKey.length} chars`);
    
    // Validate credentials
    if (!credentials.accessKeyId || credentials.accessKeyId.trim() === '') {
        throw new Error('Access Key ID is empty');
    }
    if (!credentials.secretAccessKey || credentials.secretAccessKey.trim() === '') {
        throw new Error('Secret Access Key is empty');
    }
    
    // Validate endpoint URL format
    if (!credentials.endpoint.startsWith('https://')) {
        console.error('❌ Endpoint must start with https://');
        throw new Error('Invalid endpoint: must start with https://');
    }
    
    if (!credentials.endpoint.includes('.r2.cloudflarestorage.com')) {
        console.warn('⚠️  Endpoint does not contain .r2.cloudflarestorage.com');
        console.warn(`   Received: ${credentials.endpoint}`);
        console.warn('   Expected format: https://ACCOUNT_ID.r2.cloudflarestorage.com');
    }

    try {
        const client = new S3Client({
            region: 'auto',
            endpoint: credentials.endpoint,
            credentials: {
                accessKeyId: credentials.accessKeyId.trim(),
                secretAccessKey: credentials.secretAccessKey.trim()
            },
            forcePathStyle: false
        });
        
        console.log('✅ S3 client initialized successfully\n');
        return client;
    } catch (error) {
        console.error('❌ Failed to initialize S3 client:', error.message);
        throw error;
    }
}

/**
 * Upload a file to Cloudflare R2
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {string} fileName - File name (will be prefixed with 'images/')
 * @param {string} mimeType - MIME type (e.g., 'image/webp')
 * @param {object} db - Firebase database reference
 * @returns {Promise<{success: boolean, url: string, key: string, error?: string}>}
 */
async function uploadToR2(fileBuffer, fileName, mimeType = 'image/webp', db) {
    try {
        if (!db) {
            throw new Error('Firebase database reference is required');
        }

        // Fetch credentials from Firebase
        const credentials = await fetchCredentialsFromFirebase(db);
        
        console.log('\n📤 Starting upload to R2...');
        console.log(`   File: ${fileName}`);
        console.log(`   Size: ${(fileBuffer.length / 1024).toFixed(2)} KB`);
        console.log(`   Endpoint: ${credentials.endpoint}`);
        console.log(`   Bucket: ${credentials.bucketName}`);
        
        const client = initializeR2Client(credentials);

        const key = `images/${Date.now()}_${Math.random().toString(36).substring(7)}_${fileName.replace(/[^a-zA-Z0-9.-]/g, '')}`;

        console.log(`   Key: ${key}`);

        const command = new PutObjectCommand({
            Bucket: credentials.bucketName,
            Key: key,
            Body: fileBuffer,
            ContentType: mimeType,
            Metadata: {
                'uploaded-at': new Date().toISOString()
            }
        });

        console.log('⏳ Sending to R2...');
        await client.send(command);

        const privateProxyUrl = keyToFetchImageUrl(key);

        console.log(`✅ File uploaded to R2: ${key}`);
        console.log(`   App URL: ${privateProxyUrl}\n`);
        return { success: true, url: privateProxyUrl, key };
    } catch (error) {
        console.error('\n❌ R2 Upload Error:');
        console.error(`   Message: ${error.message}`);
        console.error(`   Code: ${error.code}`);
        console.error(`   Name: ${error.name}`);
        if (error.hostname) console.error(`   Hostname: ${error.hostname}`);
        if (error.syscall) console.error(`   Syscall: ${error.syscall}`);
        console.error('');
        
        return { success: false, error: error.message };
    }
}

/**
 * Generate a signed URL for temporary access to a file
 * @param {string} key - File key in R2
 * @param {number} expiresIn - URL expiration time in seconds (default 1 hour)
 * @param {object} db - Firebase database reference
 * @returns {Promise<{success: boolean, url: string, error?: string}>}
 */
async function getSignedUrlForFile(key, db, expiresIn = 3600) {
    try {
        if (!db) {
            throw new Error('Firebase database reference is required');
        }

        // Fetch credentials from Firebase
        const credentials = await fetchCredentialsFromFirebase(db);
        const client = initializeR2Client(credentials);

        const command = new GetObjectCommand({
            Bucket: credentials.bucketName,
            Key: key
        });

        const signedUrl = await getSignedUrl(client, command, { expiresIn });
        console.log(`✅ Signed URL generated for: ${key}`);
        return { success: true, url: signedUrl };
    } catch (error) {
        console.error('❌ Signed URL Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Delete a file from Cloudflare R2
 * @param {string} key - File key in R2
 * @param {object} db - Firebase database reference
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteFromR2(key, db) {
    try {
        if (!db) {
            throw new Error('Firebase database reference is required');
        }

        // Fetch credentials from Firebase
        const credentials = await fetchCredentialsFromFirebase(db);
        const client = initializeR2Client(credentials);

        const command = new DeleteObjectCommand({
            Bucket: credentials.bucketName,
            Key: key
        });

        await client.send(command);
        console.log(`✅ File deleted from R2: ${key}`);
        return { success: true };
    } catch (error) {
        console.error('❌ R2 Delete Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Fetch file directly from Cloudflare R2 (for download/streaming)
 * @param {string} key - File key in R2
 * @param {object} db - Firebase database reference
 * @returns {Promise<{success: boolean, body: ReadableStream, contentType?: string, error?: string}>}
 */
async function fetchFromR2(key, db) {
    try {
        if (!db) {
            throw new Error('Firebase database reference is required');
        }

        // Fetch credentials from Firebase
        const credentials = await fetchCredentialsFromFirebase(db);
        const client = initializeR2Client(credentials);

        const command = new GetObjectCommand({
            Bucket: credentials.bucketName,
            Key: key
        });

        const response = await client.send(command);
        console.log(`✅ File fetched from R2: ${key}`);
        return {
            success: true,
            body: response.Body,
            contentType: response.ContentType,
            contentLength: response.ContentLength,
            metadata: response.Metadata
        };
    } catch (error) {
        console.error('❌ R2 Fetch Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Clear credentials cache (useful for manual refresh)
 */
function clearCredentialsCache() {
    credentialsCache = null;
    cacheTimestamp = 0;
    console.log('✅ Credentials cache cleared');
}

module.exports = {
    fetchCredentialsFromFirebase,
    uploadToR2,
    getSignedUrlForFile,
    deleteFromR2,
    fetchFromR2,
    clearCredentialsCache
};
