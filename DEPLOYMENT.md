# Weka Soko Backend - Deployment Guide

## Migration from Railway to Render + Supabase

This guide will help you deploy the backend to Render with Supabase as the database.

## Prerequisites

1. **Supabase Account** - Create at https://supabase.com
2. **Render Account** - Create at https://render.com
3. **Cloudinary Account** (for image uploads)
4. **M-Pesa Daraja Account** (for payments)

---

## Step 1: Set Up Supabase Database

1. Go to https://supabase.com and create a new project
2. Go to **SQL Editor** and run your database migrations:
   ```sql
   -- Copy from src/db/migrations/006_add_agent_system.sql
   -- Or run: psql <your-supabase-url> < src/db/migrations/*.sql
   ```
3. Get your **Database Connection String**:
   - Go to **Settings** → **Database**
   - Copy the **Connection String** (Pooler mode recommended)
   - Format: `postgresql://postgres:[PASSWORD]@[HOST]/postgres`

---

## Step 2: Deploy to Render

### Option A: Deploy via Render Dashboard (Recommended)

1. **Push code to GitHub** (if not already):
   ```bash
   cd "C:\Users\USER\Desktop\Weka Soko\weka-soko-backend"
   git init
   git add .
   git commit -m "Initial commit - ready for Render deployment"
   git remote add origin https://github.com/YOUR_USERNAME/weka-soko-backend.git
   git push -u origin main
   ```

2. **Create Render Web Service**:
   - Go to https://render.com/create
   - Click **"New +"** → **"Web Service"**
   - Connect your GitHub repository
   - Configure:
     - **Name**: `weka-soko-backend`
     - **Region**: Frankfurt (Germany) or nearest to your users
     - **Branch**: `main`
     - **Root Directory**: (leave blank)
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `node src/index.js`
     - **Instance Type**: Free (or Starter for production)

3. **Add Environment Variables**:
   In Render dashboard → **Environment** → Add these variables:

   ```
   DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]/postgres
   JWT_SECRET=your_super_secret_jwt_key_min_32_chars
   GROQ_API_KEY=gsk_xxx (from https://console.groq.com)
   HUGGINGFACE_API_KEY=hf_xxx (from https://huggingface.co)
   CRON_SECRET=wekasoko_super_secret_cron_key_2025
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   MPESA_ENVIRONMENT=sandbox
   MPESA_CONSUMER_KEY=your_consumer_key
   MPESA_CONSUMER_SECRET=your_consumer_secret
   MPESA_PASSKEY=your_passkey
   MPESA_CALLBACK_URL=https://YOUR-RENDER-URL.up.r.app/api/payments/mpesa/callback
   FRONTEND_URL=https://weka-soko.vercel.app
   VAPID_PUBLIC_KEY=your_vapid_public_key
   VAPID_PRIVATE_KEY=your_vapid_private_key
   UNLOCK_FEE_KES=250
   NODE_ENV=production
   ```

4. **Deploy**:
   - Click **"Create Web Service"**
   - Wait for deployment (5-10 minutes)
   - Copy your **Render URL** (e.g., `https://weka-soko-backend-xyz.up.r.app`)

---

### Option B: Deploy via Render CLI

```bash
# Install Render CLI
npm install -g @render-cloud/cli

# Login to Render
render login

# Deploy
cd "C:\Users\USER\Desktop\Weka Soko\weka-soko-backend"
render up
```

---

## Step 3: Update Frontend Configuration

Update the frontend to use the new backend URL:

1. **Create `.env.local`** in the frontend directory:
   ```bash
   cd "C:\Users\USER\Documents\Weka Soko\weka-soko-nextjs"
   echo "NEXT_PUBLIC_API_URL=https://YOUR-BACKEND-URL.up.r.app" >> .env.local
   ```

2. **Or update `lib/utils.js`**:
   ```javascript
   export const API = (process.env.NEXT_PUBLIC_API_URL || 'https://YOUR-BACKEND-URL.up.r.app').replace(/\/$/, '');
   ```

3. **Redeploy frontend**:
   ```bash
   git add .
   git commit -m "Update backend URL to Render deployment"
   git push origin main
   ```

---

## Step 4: Verify Deployment

1. **Check Health Endpoint**:
   ```bash
   curl https://YOUR-BACKEND-URL.up.r.app/api/health
   ```
   Expected response: `{"status":"ok","timestamp":"..."}`

2. **Test Admin Routes**:
   ```bash
   # Get admin stats (requires auth token)
   curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
        https://YOUR-BACKEND-URL.up.r.app/api/admin/stats
   ```

3. **Test Buyer Request Approval**:
   ```bash
   curl -X POST \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     https://YOUR-BACKEND-URL.up.r.app/api/admin/requests/REQUEST_ID/approve
   ```

---

## Step 5: Database Migration (if needed)

If migrating from Railway:

```bash
# Export from old database
pg_dump "postgresql://old-db-url" > backup.sql

# Import to Supabase
psql "postgresql://supabase-url" < backup.sql

# Or use Supabase migration tool
npx supabase db push
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Supabase PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret key for JWT tokens (min 32 chars) |
| `GROQ_API_KEY` | ✅ | Groq API key for AI features |
| `HUGGINGFACE_API_KEY` | ✅ | Hugging Face API key |
| `CRON_SECRET` | ✅ | Secret for cron job authentication |
| `CLOUDINARY_*` | ✅ | Cloudinary credentials for image uploads |
| `MPESA_*` | ✅ | M-Pesa Daraja credentials |
| `FRONTEND_URL` | ✅ | Frontend URL for CORS |
| `VAPID_*` | ⚠️ | Push notification keys (optional) |
| `UNLOCK_FEE_KES` | ✅ | Fee to unlock contact details (default: 250) |

---

## Troubleshooting

### Backend won't start
- Check Render logs: **Logs** tab in dashboard
- Verify `DATABASE_URL` is correct
- Ensure all required env vars are set

### Database connection errors
- Use **Connection Pooler** mode in Supabase
- Check firewall settings in Supabase
- Verify connection string format

### API returns 404
- Ensure routes are registered in `src/routes/admin.js`
- Check that `src/index.js` imports the routes
- Verify the route path matches exactly

### M-Pesa callback fails
- Update callback URL in Daraja dashboard to: `https://YOUR-RENDER-URL.up.r.app/api/payments/mpesa/callback`
- Use `https` (not `http`)
- Ensure callback URL is publicly accessible

---

## Cost Estimate

- **Render Free Tier**: 750 hours/month (sufficient for 1 service)
- **Supabase Free Tier**: 500MB database, 50K MAU
- **Total Monthly Cost**: **$0** (for testing/small scale)

For production:
- **Render Starter**: $7/month
- **Supabase Pro**: $25/month
- **Total**: ~$32/month

---

## Support

- Render Docs: https://render.com/docs
- Supabase Docs: https://supabase.com/docs
- Node.js on Render: https://render.com/docs/node

---

**Last Updated**: May 2026
**Version**: 2.0 (Supabase + Render)
