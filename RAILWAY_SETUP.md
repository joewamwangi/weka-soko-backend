# Railway Deployment Setup Guide

## Critical: Environment Variables Required

Your backend is running on Railway but crashing because it's missing environment variables. Follow these steps:

## Step 1: Go to Railway Dashboard

1. Open: **https://railway.app**
2. Login to your account
3. Find project: **weka-soko-backend**
4. Click on it

## Step 2: Add Environment Variables

Click on **"Variables"** tab (or "Settings" → "Environment Variables")

### Required Variables:

```
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=weka_soko_super_secret_key_2026_change_this
JWT_EXPIRES_IN=30d
FRONTEND_URL=https://your-admin-panel.vercel.app
ADMIN_URL=https://your-admin-panel.vercel.app
UNLOCK_FEE_KES=260
ESCROW_FEE_PERCENT=5.5
```

### Optional (for full functionality):

```
# M-Pesa (if using)
MPESA_ENV=sandbox
MPESA_SHORTCODE=174379
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_CONSUMER_KEY=get_from_safaricom
MPESA_CONSUMER_SECRET=get_from_safaricom
MPESA_CALLBACK_URL=https://weka-soko-backend-production.up.railway.app/api/payments/mpesa/callback

# Cloudinary (for image uploads)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Email (optional - for password reset emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=Weka Soko <noreply@wekasoko.co.ke>
```

## Step 3: Where to Get DATABASE_URL

### If migrating from Supabase:
1. Go to: https://app.supabase.com
2. Select your project
3. Go to **Settings** → **Database**
4. Scroll to **Connection string**
5. Copy the **URI** (looks like: `postgresql://postgres:[password]@db.[xxx].supabase.co:5432/postgres`)
6. Replace `[password]` with your actual password

### If migrating from Render:
1. Go to: https://dashboard.render.com
2. Find your database
3. Copy the **Internal Database URL** or **External Database URL**

### If using Railway Postgres:
1. In Railway dashboard, click **"New"** → **"Database"** → **"PostgreSQL"**
2. Once deployed, click on it
3. Copy the **DATABASE_URL** from Variables
4. Add it to your backend service

## Step 4: Deploy

After adding variables:
1. Railway will **automatically redeploy** (takes 1-2 minutes)
2. Watch the **Deployments** tab for progress
3. Once green, test: `https://your-app.railway.app/health`

## Step 5: Test Login

Once deployed, test admin login:
- URL: Your admin panel (Vercel/Netlify)
- Email: `admin@wekasoko.co.ke`
- Password: `WekaSoko@Admin2026`

## Troubleshooting

### Backend still crashing?
Check Railway logs:
1. Go to Railway dashboard
2. Click on your project
3. Click **"Deployments"** tab
4. Click **"View Logs"**
5. Look for error messages

### Common errors:
- `DATABASE_URL is required` → Add DATABASE_URL variable
- `JWT_SECRET is required` → Add JWT_SECRET variable
- `Connection refused` → Database URL is wrong or database is down
- `Table does not exist` → Run migrations first

## Quick Fix Command

If you have Railway CLI:

```bash
# Install CLI
npm install -g @railway/cli

# Login
railway login

# Link to project
railway link

# Set variables
railway variables set NODE_ENV=production
railway variables set DATABASE_URL="your_database_url"
railway variables set JWT_SECRET="weka_soko_super_secret_key_2026"
railway variables set FRONTEND_URL="https://your-admin.vercel.app"
railway variables set ADMIN_URL="https://your-admin.vercel.app"

# Deploy
railway up
```

## Next Steps

Once backend is working:
1. ✅ Admin login will work
2. ✅ All API calls will function
3. ✅ Dashboard will load properly

**DO NOT proceed until environment variables are added!**
