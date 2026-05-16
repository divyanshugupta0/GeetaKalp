# Cloudflare R2 Configuration Guide

## Overview
Your Cloudflare R2 credentials are fetched dynamically from Firebase at runtime. This eliminates the need for environment variables and makes credential management centralized.

## Firebase Configuration

Add the following keys to your **Firebase Realtime Database root level**:

| Firebase Key | Description | Example |
|---|---|---|
| `cloudflare_access_key_id` | R2 Access Key ID | `a9b8c7d6e5f4g3h2i1j0` |
| `cloudflare_secret_access_key` | R2 Secret Access Key | `K_oG...` (keep secret) |
| `cloudflare_account_id` | Cloudflare Account ID | `a1b2c3d4e5f6g7h8i9j0` |
| `cloudflare_r2_bucket_name` | R2 Bucket Name | `geeta-kalp-images` |
| `cloudflare_endpoint` | R2 Endpoint URL | `https://a1b2c3d4e5f6g7h8i9j0.r2.cloudflarestorage.com` |
| `cloudflare_r2_public_url` | Optional legacy public URL. Not required for private buckets. | `https://cdn.geetakalp.com` or leave unset |

## Step-by-Step Setup

### 1. Get Your Cloudflare R2 Credentials

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2** → **Overview**
3. Create a new R2 bucket (e.g., `geeta-kalp-images`)
4. Go to **Settings** → **API Credentials**
5. Click **Create API Token** and select:
   - **Permissions**: Read & Write
   - **Resources**: Specific bucket (your bucket)
6. Copy the credentials:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint** (format: `https://{account-id}.r2.cloudflarestorage.com`)

### 2. Keep the Bucket Private

You do not need to enable public access on the R2 bucket. Uploaded product images are served through the app at `/api/fetch-image/:key`, and the server reads the private object from R2 using your configured credentials.

### 3. Add Credentials to Firebase

Using Firebase Console:

1. Open **Realtime Database** → **Data** tab
2. Click the **+** button next to root
3. Add each key-value pair:

```json
{
  "cloudflare_access_key_id": "your_access_key_id",
  "cloudflare_secret_access_key": "your_secret_key",
  "cloudflare_account_id": "your_account_id",
  "cloudflare_r2_bucket_name": "geeta-kalp-images",
  "cloudflare_endpoint": "https://your_account_id.r2.cloudflarestorage.com",
  "cloudflare_r2_public_url": ""
}
```

**Or** using Firebase CLI:

```bash
firebase database:set cloudflare_access_key_id "your_access_key_id"
firebase database:set cloudflare_secret_access_key "your_secret_key"
firebase database:set cloudflare_account_id "your_account_id"
firebase database:set cloudflare_r2_bucket_name "geeta-kalp-images"
firebase database:set cloudflare_endpoint "https://your_account_id.r2.cloudflarestorage.com"
firebase database:set cloudflare_r2_public_url ""
```

## API Endpoints

### Upload Image
**POST** `/api/upload`
- **Headers**: `Authorization: Bearer {adminToken}`
- **Body**: `FormData` with `image` file
- **Response**:
```json
{
  "success": true,
  "url": "/api/fetch-image/images/1715936400123_abc123_product.webp",
  "key": "images/1715936400123_abc123_product.webp"
}
```

### Fetch Image
**GET** `/api/fetch-image/:key`
- **Response**: Direct image stream (cached for 1 year)

### Delete Image
**DELETE** `/api/delete-image/:key`
- **Headers**: `Authorization: Bearer {adminToken}`
- **Response**:
```json
{
  "success": true,
  "message": "Image deleted successfully"
}
```

## Image Upload Workflow

1. **Admin uploads image** → API compresses to WebP
2. **Service fetches Firebase credentials** (cached for 5 minutes)
3. **Image uploaded to private R2** with unique key
4. **App proxy URL returned** to frontend
5. **Proxy URL stored in product** in Firebase

## Caching

Credentials are cached in-memory for **5 minutes** to reduce Firebase reads. To manually refresh:
```javascript
// In your code
const { clearCredentialsCache } = require('./services/cloudflareR2');
clearCredentialsCache();
```

## Troubleshooting

| Issue | Solution |
|---|---|
| "Missing required Cloudflare R2 credentials" | Ensure all keys exist in Firebase root |
| "Upload failed: 403 Forbidden" | Check if API token has correct permissions in R2 |
| Images not loading | Verify R2 credentials and bucket/key values; public bucket access is not required |
| Slow uploads | Make sure R2 bucket is in the same region as your server |

## Security Best Practices

- ✅ Store secrets in Firebase (protected by rules)
- ✅ Use API tokens with minimal permissions
- ✅ Enable R2 bucket encryption
- ✅ Set up CORS policies if needed
- ✅ Regularly rotate API tokens
- ❌ Never hardcode credentials in code
- ❌ Don't commit credentials to version control
